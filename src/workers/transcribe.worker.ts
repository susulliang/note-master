/**
 * Local Whisper transcription worker.
 *
 * Loads a quantized Whisper model (Xenova/whisper-{base,tiny}[.en]) through
 * transformers.js v3 and transcribes 16 kHz mono PCM segments entirely
 * on-device. The `.fr` models are the multilingual exports: speech is
 * transcribed in its ORIGINAL language (French calls show French text in
 * the caption panel). English happens one step later — the LLM parse
 * prompts translate the extracted values, so fields and notes stay in
 * English on French calls. Keeping this in a worker matters twice over:
 *
 *   1. WASM inference is CPU-heavy — running it off the main thread keeps
 *      the flowchart editor at 60 fps while segments transcribe.
 *   2. transformers.js downloads model weights from the Hugging Face Hub;
 *      a dedicated worker is also the documented setup for the library.
 *
 * Model weights are cached by the browser's Cache API, so the download only
 * happens once per model per browser profile.
 *
 * Protocol (see src/lib/whisper-models.ts for the message types):
 *   load       { model, dtype? }  → load-start / progress+ / ready | load-error
 *   transcribe { id, audio }       → result { id, text, ms } | transcribe-error
 */

import { pipeline, env } from '@huggingface/transformers';
import type { AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import {
  LOCAL_WHISPER_MODELS,
  DTYPE_CHAIN,
  type WhisperModelName,
  type WhisperDtype,
  type WhisperWorkerRequest,
  type WhisperWorkerEvent,
} from '@/lib/whisper-models';

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
  model: WhisperModelName;
  pipe: AutomaticSpeechRecognitionPipeline;
  dtype: WhisperDtype;
} | null = null;

/** In-flight load, so transcribe requests can await a model swap */
let loading: Promise<void> | null = null;

/** Serialize loads: a rapid model toggle (e.g. base.en ⇄ base.fr) must not interleave */
let loadChain: Promise<void> = Promise.resolve();

// Window-typed `self` can't express worker-scope postMessage; narrow it.
const scope = self as unknown as {
  postMessage(message: WhisperWorkerEvent): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<WhisperWorkerRequest>) => void
  ): void;
};

const post = (message: WhisperWorkerEvent) => scope.postMessage(message);

/**
 * Report the worker's JS-heap usage to the main thread (the RAM badge).
 * Throttled to one post per 2s. Model weights live in WASM memory, not
 * the JS heap, so this tracks worker overhead; still the best per-worker
 * signal available from inside the page. Hidden on non-Chromium browsers
 * where performance.memory is unavailable.
 */
let memReportedAt = 0;
function postMemStats(force = false): void {
  const now = performance.now();
  if (!force && now - memReportedAt < 2000) return;
  memReportedAt = now;
  const memory = (self as { performance?: { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } } })
    .performance?.memory;
  if (!memory) return;
  post({
    type: 'mem-stats',
    heapUsedMb: Math.round(memory.usedJSHeapSize / 1048576),
    heapLimitMb: Math.round(memory.jsHeapSizeLimit / 1048576),
  });
}

/**
 * Load `model`, trying precisions from `preferred` (then the rest of the
 * chain, most quantized first). Resolves once a session is ready; posts
 * `ready` with the dtype that worked or `load-error` if all fail.
 */
async function loadModel(model: WhisperModelName, preferred?: WhisperDtype): Promise<void> {
  if (current?.model === model) {
    post({ type: 'ready', model, dtype: current.dtype });
    return;
  }

  post({ type: 'load-start', model });

  const order: WhisperDtype[] = preferred
    ? [preferred, ...DTYPE_CHAIN.filter((dtype) => dtype !== preferred)]
    : [...DTYPE_CHAIN];

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
      const pipe = await pipeline('automatic-speech-recognition', LOCAL_WHISPER_MODELS[model], {
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
      postMemStats(true); // fresh model resident — heap just grew
      return;
    } catch (err) {
      // e.g. a quantized export that the current runtime can't instantiate
      // (transformers.js issue #1707) — fall through to the next precision.
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

async function handleTranscribe(id: number, audio: Float32Array): Promise<void> {
  const started = performance.now();
  try {
    // Wait out a model swap that's in flight.
    if (loading) await loading;
    if (!current) throw new Error('No Whisper model is loaded yet.');

    // Segments are ≤ 30 s, so the single-pass path applies — no chunking
    // options needed; the pipeline zero-pads to Whisper's 30 s window.
    //
    // French models (.fr = multilingual base/tiny) run the default
    // TRANSCRIBE task with language='french', so the transcript comes
    // back in the ORIGINAL language — the caption panel shows French
    // text on French calls. Translation to English happens one step
    // later, at the LLM parse (llm-parser.ts / cloud-parser.ts prompts
    // tell the model to write every extracted value in English), so the
    // fields and the ticket note stay in English. NOTE: transformers.js
    // v3 has NOT implemented Whisper's auto language detection — an
    // unspecified language silently defaults to ENGLISH (models.js
    // _retrieve_init_tokens), which is why french is forced here.
    // On a mixed call (English agent mic + French customer) Whisper is
    // audio-driven and still transcribes English speech readably under
    // the French token; the parse handles either language. English-only
    // `.en` models must NOT receive task/language options (they throw).
    const output = (await current.pipe(
      audio,
      current.model.endsWith('.fr') ? { language: 'french', task: 'transcribe' } : {}
    )) as { text?: string } | Array<{ text?: string }>;
    const text = (Array.isArray(output) ? (output[0]?.text ?? '') : (output.text ?? '')).trim();

    post({ type: 'result', id, text, ms: Math.round(performance.now() - started) });
    postMemStats(); // throttled — keeps the RAM badge live across segments
  } catch (err) {
    post({
      type: 'transcribe-error',
      id,
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

  if (data.type === 'transcribe') {
    void handleTranscribe(data.id, data.audio);
  }
});
