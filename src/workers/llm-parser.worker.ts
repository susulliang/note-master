/**
 * Local LLM fallback-parser worker.
 *
 * Loads an ultra-small instruction-tuned model (SmolLM2-360M by default)
 * through transformers.js v3 and extracts ticket fields from speaker-tagged
 * transcripts entirely on-device. Runs in a worker for the same two
 * reasons as the Whisper worker: WASM inference is CPU-heavy, and
 * transformers.js downloads weights from the Hugging Face Hub.
 *
 * Prompt construction and output validation live on the main thread
 * (src/lib/llm-parser.ts) — this worker only runs generation:
 *
 *   load  { model, dtype? }                    → load-start / progress+ / ready | load-error
 *   parse { id, system, user, maxNewTokens }    → result { id, text, ms } | parse-error
 */

import { pipeline, env } from '@huggingface/transformers';
import type { TextGenerationPipeline } from '@huggingface/transformers';
import {
  LOCAL_LLM_MODELS,
  LLM_DTYPE_CHAIN,
  type LlmModelName,
  type LlmDtype,
  type LlmWorkerRequest,
  type LlmWorkerEvent,
} from '@/lib/llm-parser';

// Model files come from the Hugging Face Hub — never probe the local origin.
env.allowLocalModels = false;

/** Progress events emitted by transformers.js during downloads */
interface ProgressInfo {
  status?: string;
  file?: string;
  progress?: number;
}

/** The currently loaded pipeline + which dtype actually worked */
let current: {
  model: LlmModelName;
  pipe: TextGenerationPipeline;
  dtype: LlmDtype;
} | null = null;

/** In-flight load, so parse requests can await a model swap */
let loading: Promise<void> | null = null;

/** Serialize loads: a rapid model toggle must not interleave */
let loadChain: Promise<void> = Promise.resolve();

/** Serialize generations: one WASM LLM at a time, in request order */
let parseChain: Promise<void> = Promise.resolve();

// Window-typed `self` can't express worker-scope postMessage; narrow it.
const scope = self as unknown as {
  postMessage(message: LlmWorkerEvent): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<LlmWorkerRequest>) => void
  ): void;
};

const post = (message: LlmWorkerEvent) => scope.postMessage(message);

/**
 * Load `model`, trying precisions from `preferred` (then the rest of the
 * chain, most quantized first). Resolves once a session is ready; posts
 * `ready` with the dtype that worked or `load-error` if all fail.
 */
async function loadModel(model: LlmModelName, preferred?: LlmDtype): Promise<void> {
  if (current?.model === model) {
    post({ type: 'ready', model, dtype: current.dtype });
    return;
  }

  post({ type: 'load-start', model });

  const order: LlmDtype[] = preferred
    ? [preferred, ...LLM_DTYPE_CHAIN.filter((dtype) => dtype !== preferred)]
    : [...LLM_DTYPE_CHAIN];

  let lastError: unknown = null;

  for (const dtype of order) {
    // Aggregate per-file download progress into one 0–100 number.
    const fileProgress = new Map<string, number>();
    const onProgress = (data: ProgressInfo) => {
      if (data.status === 'progress' && data.file && typeof data.progress === 'number') {
        fileProgress.set(data.file, data.progress);
        const values = [...fileProgress.values()];
        const overall = values.reduce((sum, value) => sum + value, 0) / values.length;
        post({ type: 'progress', model, progress: Math.min(99, Math.round(overall)) });
      }
    };

    try {
      const pipe = await pipeline('text-generation', LOCAL_LLM_MODELS[model], {
        device: 'wasm',
        dtype,
        progress_callback: onProgress as (data: ProgressInfo) => void,
      });

      // Free the previous model's memory before swapping in the new one —
      // only one pipeline is ever resident (minimum-footprint goal).
      if (current) {
        try {
          await current.pipe.dispose();
        } catch {
          /* best effort */
        }
      }
      current = { model, pipe, dtype };
      post({ type: 'ready', model, dtype });
      return;
    } catch (err) {
      // e.g. a quantized export the current runtime can't instantiate —
      // fall through to the next precision.
      lastError = err;
    }
  }

  post({
    type: 'load-error',
    model,
    message: `Could not load ${model} in any precision. Last error: ${
      (lastError as Error | null)?.message ?? String(lastError)
    }`,
  });
}

interface ParseJob {
  id: number;
  system: string;
  user: string;
  maxNewTokens: number;
}

async function runParse(job: ParseJob): Promise<void> {
  const started = performance.now();
  try {
    // Wait out a model swap that's in flight.
    if (loading) await loading;
    if (!current) throw new Error('No LLM model is loaded yet.');

    // Greedy decoding: extraction must be deterministic, not creative.
    // `return_full_text: false` keeps only the completion (the JSON object).
    const output = (await current.pipe(
      [
        { role: 'system', content: job.system },
        { role: 'user', content: job.user },
      ],
      {
        max_new_tokens: job.maxNewTokens,
        do_sample: false,
        return_full_text: false,
      }
    )) as Array<{ generated_text?: unknown }>;

    const raw = output?.[0]?.generated_text;
    // Chat-style input returns the assistant message string; be liberal in
    // what we accept (string | { content } | [message]) so a transformers.js
    // minor-version shape change can't break the pipeline.
    let text = '';
    if (typeof raw === 'string') {
      text = raw;
    } else if (raw && typeof raw === 'object') {
      const content = (raw as { content?: unknown }).content;
      text = typeof content === 'string' ? content : JSON.stringify(raw);
    }

    post({ type: 'result', id: job.id, text, ms: Math.round(performance.now() - started) });
  } catch (err) {
    post({
      type: 'parse-error',
      id: job.id,
      message: (err as Error | null)?.message ?? String(err),
    });
  }
}

scope.addEventListener('message', (event) => {
  const data = event.data;

  if (data.type === 'load') {
    // Chain loads so switching models rapidly is well-defined; `loading`
    // tracks the latest request (the model the user last asked for).
    const run = loadChain.then(() => loadModel(data.model, data.dtype));
    loadChain = run.catch(() => undefined);
    loading = run.catch(() => undefined);
    return;
  }

  if (data.type === 'parse') {
    // Serialize generations through one chain — concurrent WASM inference
    // would thrash CPU and blow the memory budget.
    parseChain = parseChain
      .then(() =>
        runParse({ id: data.id, system: data.system, user: data.user, maxNewTokens: data.maxNewTokens })
      )
      .catch(() => undefined);
  }
});
