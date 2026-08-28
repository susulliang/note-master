/**
 * Local Whisper transcription worker.
 *
 * Loads a quantized English Whisper model (Xenova/whisper-{base,tiny}.en)
 * through transformers.js v3 and transcribes 16 kHz mono PCM segments entirely
 * on-device. Keeping this in a worker matters twice over:
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

/** Serialize loads: a rapid base.en ⇄ tiny.en toggle must not interleave */
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
    const output = (await current.pipe(audio)) as { text?: string } | Array<{ text?: string }>;
    const text = (Array.isArray(output) ? (output[0]?.text ?? '') : (output.text ?? '')).trim();

    post({ type: 'result', id, text, ms: Math.round(performance.now() - started) });
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
