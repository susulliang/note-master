/**
 * Local LLM fallback-parser worker.
 *
 * Loads an ultra-small instruction-tuned model through transformers.js v3
 * and extracts ticket fields from speaker-tagged transcripts entirely
 * on-device. Runs in a worker for the same two reasons as the Whisper
 * worker: inference is CPU-heavy (unless WebGPU kicks in), and
 * transformers.js downloads weights from the Hugging Face Hub.
 *
 * Prompt construction and output validation live on the main thread
 * (src/lib/llm-parser.ts) — this worker only runs generation:
 *
 *   load  { model, dtype? }                    → load-start / progress+ / ready | load-error
 *   parse { id, system, user, maxNewTokens }    → gen-progress+ / result { id, text, ms } | parse-error
 *
 * Device strategy: WebGPU is tried FIRST when the browser exposes it —
 * GPU inference is roughly an order of magnitude faster than WASM, which
 * is the difference between a parse finishing in seconds vs timing out.
 * Falls back to wasm when the pipeline cannot initialize on GPU. The
 * `ready` event reports which backend actually won, so the UI can show
 * a GPU badge.
 */

import { pipeline, env, TextStreamer } from '@huggingface/transformers';
import type { TextGenerationPipeline } from '@huggingface/transformers';
import {
  LOCAL_LLM_MODELS,
  LLM_DTYPE_CHAIN,
  LLM_DTYPE_CHAIN_WEBGPU,
  type LlmModelName,
  type LlmDtype,
  type LlmDevice,
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

/** The currently loaded pipeline + which dtype/device actually worked */
let current: {
  model: LlmModelName;
  pipe: TextGenerationPipeline;
  dtype: LlmDtype;
  device: LlmDevice;
} | null = null;

/** In-flight load, so parse requests can await a model swap */
let loading: Promise<void> | null = null;

/** Serialize loads: a rapid model toggle must not interleave */
let loadChain: Promise<void> = Promise.resolve();

/**
 * How long a freshly created WebGPU pipeline gets to finish a 2-token
 * warmup generation before the backend is declared unusable.
 */
const GPU_WARMUP_TIMEOUT_MS = 45_000;

const GPU_WARMUP_TIMEOUT_MESSAGE =
  'WebGPU stalled at first inference — the model loaded but a 2-token warmup generation did not finish in 45s. ' +
  'Typical on integrated GPUs: fp32 weights are streamed once per prompt token over the shared-memory bus, ' +
  'so prefill is memory-bound and far too slow for real parses. Falling back to the CPU build.';

/** Serialize generations: one LLM at a time, in request order */
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
 * Report the worker's JS-heap usage to the main thread (the RAM badge).
 * Throttled to one post per 2s — a per-result report would just add
 * message traffic during back-to-back parses. Model weights live in
 * WASM/GPU memory, not the JS heap, so this number tracks the WORKER
 * OVERHEAD (prompt strings, tokenizer state, pipeline plumbing); the
 * weights themselves show up in the browser's about:blank worker process
 * instead. Still the best per-worker signal available from inside the
 * page.
 */
let memReportedAt = 0;
function postMemStats(force = false): void {
  const now = performance.now();
  if (!force && now - memReportedAt < 2000) return;
  memReportedAt = now;
  const memory = (self as { performance?: { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } } })
    .performance?.memory;
  if (!memory) return; // non-Chromium: API unavailable, badge just stays hidden
  post({
    type: 'mem-stats',
    heapUsedMb: Math.round(memory.usedJSHeapSize / 1048576),
    heapLimitMb: Math.round(memory.jsHeapSizeLimit / 1048576),
  });
}

/** WebGPU available in this worker? (navigator.gpu exists and an adapter
 *  can be requested — some browsers expose gpu but have no adapter.) */
async function hasWebGpu(): Promise<boolean> {
  const gpu = (self as { navigator?: { gpu?: unknown } }).navigator?.gpu;
  if (!gpu) return false;
  try {
    const adapter = await (gpu as { requestAdapter(): Promise<unknown> }).requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

/**
 * Load `model`, trying precisions from `preferred` (then the rest of the
 * chain, most quantized first). WebGPU is tried before wasm when present.
 * Resolves once a session is ready; posts `ready` with the dtype+device
 * that worked or `load-error` if all fail.
 */
async function loadModel(
  model: LlmModelName,
  preferred?: LlmDtype,
  deviceRequest?: 'gpu' | 'cpu'
): Promise<void> {
  if (current?.model === model && (!deviceRequest || current.device === deviceRequest)) {
    post({ type: 'ready', model, dtype: current.dtype, device: current.device });
    return;
  }

  post({ type: 'load-start', model });

  // Device order: an explicit request from the download manager pins the
  // backend; otherwise GPU first (order of magnitude faster) with wasm as
  // the fallback — EXCEPT the 1.5B model, which stays CPU on AUTO: even
  // q4f16 (~1 GB) makes a ~1k-token iGPU prefill marginal, so GPU for the
  // 1.5B is a deliberate choice via the download manager, not a default.
  const devices: Array<'webgpu' | 'wasm'> = deviceRequest
    ? [deviceRequest === 'gpu' ? 'webgpu' : 'wasm']
    : (await hasWebGpu()) && model !== 'qwen2.5-1.5b'
      ? ['webgpu', 'wasm']
      : ['wasm'];

  // DTYPE IS DEVICE-SPECIFIC.
  //
  // WebGPU: q4f16 FIRST (4-bit weights, fp16 compute) — the format the
  // WebGPU ecosystem standardized on (WebLLM, transformers.js demos).
  // Field data behind this: fp32 weights stream ~5x more bytes per token,
  // and on a shared-memory iGPU a ~1k-token prefill is bandwidth-starved
  // into a 60s timeout with 0 output tokens; q4f16 fits the same prefill
  // into ~10s. fp16 (half traffic) and fp32 stay as error-fallbacks for
  // drivers that reject q4f16 graphs. q8 (DynamicQuantizeLinear) is NOT
  // offered on WebGPU: field data showed it loads fine but hangs at first
  // inference — q8 is the WASM/CPU format.
  const dtypeOrder = (device: 'webgpu' | 'wasm'): LlmDtype[] => {
    const wasmOrder: LlmDtype[] = preferred
      ? [preferred, ...LLM_DTYPE_CHAIN.filter((dtype) => dtype !== preferred)]
      : [...LLM_DTYPE_CHAIN];
    return device === 'webgpu' ? [...LLM_DTYPE_CHAIN_WEBGPU] : wasmOrder;
  };

  const failedAttempts: Array<{ device: 'gpu' | 'cpu'; dtype: LlmDtype; message: string }> = [];

  for (const device of devices) {
    for (const dtype of dtypeOrder(device)) {
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
          device,
          dtype,
          progress_callback: onProgress as (data: ProgressInfo) => void,
        });

        // A WebGPU pipeline must EARN trust before it gets real parses.
        // The load-fine-but-stall-at-first-inference failure mode (field
        // data: ~1k-token prompt, 0 output tokens, 60s GPU leash fired
        // mid-prefill — fp32 weights streamed once per prompt token are
        // memory-bandwidth-bound on integrated GPUs) is otherwise only
        // discovered mid-call, burning the whole parse budget of a LIVE
        // conversation. A tiny 2-token generation right after load
        // surfaces it NOW: on timeout the worker reports load-error and
        // the main thread's GPU-crash recovery reloads a fresh worker
        // pinned to CPU. (The stuck GPU submission cannot be cancelled,
        // so the worker is terminated rather than reused. The race works
        // because ORT-WebGPU inference is async — the event loop, and
        // therefore the timer, keeps running while the GPU stalls.)
        if (device === 'webgpu') {
          const warmed = await Promise.race([
            pipe(
              [{ role: 'user', content: 'Say OK.' }],
              { max_new_tokens: 2, do_sample: false, return_full_text: false }
            ).then(() => true),
            new Promise<boolean>((resolve) => {
              setTimeout(() => resolve(false), GPU_WARMUP_TIMEOUT_MS);
            }),
          ]);
          if (!warmed) {
            failedAttempts.push({
              device: 'gpu',
              dtype,
              message: GPU_WARMUP_TIMEOUT_MESSAGE,
            });
            post({
              type: 'load-error',
              model,
              message: GPU_WARMUP_TIMEOUT_MESSAGE,
              failedAttempts,
            });
            return;
          }
        }

        // Free the previous model's memory before swapping in the new one —
        // only one pipeline is ever resident (minimum-footprint goal).
        if (current) {
          try {
            await current.pipe.dispose();
          } catch {
            /* best effort */
          }
        }
        current = { model, pipe, dtype, device: device === 'webgpu' ? 'gpu' : 'cpu' };
        post({
          type: 'ready',
          model,
          dtype,
          device: current.device,
          ...(failedAttempts.length > 0 ? { failedAttempts } : {}),
        });
        postMemStats(true); // fresh model resident — heap just grew
        return;
      } catch (err) {
        // Record WHY this variant failed (the download manager surfaces
        // it — e.g. gpu/fp32 weights downloaded then session-init crashed)
        // and fall through to the next precision / device.
        failedAttempts.push({
          device: device === 'webgpu' ? 'gpu' : 'cpu',
          dtype,
          message: (err as Error | null)?.message ?? String(err),
        });
      }
    }
  }

  post({
    type: 'load-error',
    model,
    message: `Could not load ${model} in any precision. Last error: ${
      failedAttempts[failedAttempts.length - 1]?.message ?? 'unknown'
    }`,
    ...(failedAttempts.length > 0 ? { failedAttempts } : {}),
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

    // Stream per-token progress so the main thread can drive a REAL
    // generation progress bar (generated / max_new_tokens) instead of an
    // indeterminate shimmer. The streamer's token_callback fires once per
    // decoded token — THROTTLED to one postMessage per 125ms: a per-token
    // message would re-render the whole page (React state update per
    // token) and make the page laggy during fast GPU generation. The
    // final count is always sent (result follows immediately anyway).
    let generated = 0;
    let lastPost = 0;
    const postProgress = () => {
      const now = performance.now();
      if (now - lastPost < 125) return;
      lastPost = now;
      post({
        type: 'gen-progress',
        id: job.id,
        generated,
        maxNewTokens: job.maxNewTokens,
      });
    };
    const streamer = new TextStreamer(current.pipe.tokenizer, {
      skip_prompt: true,
      token_callback_function: () => {
        generated += 1;
        postProgress();
      },
    });

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
        streamer,
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
    postMemStats(); // throttled — keeps the RAM badge live across parses
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
    const run = loadChain.then(() => loadModel(data.model, data.dtype, data.device));
    loadChain = run.catch(() => undefined);
    loading = run.catch(() => undefined);
    return;
  }

  if (data.type === 'reset') {
    // Hard reset: drop the resident pipeline. Used after a WebGPU
    // device-lost crash left stale state (env.webgpu.device) that would
    // poison every later load — the main thread terminates and recreates
    // this whole worker, so this is mostly belt-and-braces.
    current = null;
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
