/**
 * Local Whisper transcription — shared model registry and worker protocol.
 *
 * Whisper runs fully in the browser via transformers.js (ONNX Runtime Web,
 * WASM backend): call audio never leaves the machine, there is no API key
 * and no per-minute cost. The trade-off is a one-time model download and
 * CPU inference, so both models are English-only quantized exports:
 *
 *   base.en — default; higher accuracy, ~70 MB one-time download
 *   tiny.en — lighter and faster fallback, ~30 MB one-time download
 *
 * Model files are fetched from the Hugging Face Hub and cached by the
 * browser (Cache API), so only the first capture of each model downloads.
 */

/** Hugging Face repo per selectable model */
export const LOCAL_WHISPER_MODELS = {
  'base.en': 'onnx-community/whisper-base.en',
  'tiny.en': 'onnx-community/whisper-tiny.en',
} as const;

export type WhisperModelName = keyof typeof LOCAL_WHISPER_MODELS;

export const DEFAULT_WHISPER_MODEL: WhisperModelName = 'base.en';

export const WHISPER_MODEL_META: Record<
  WhisperModelName,
  { label: string; note: string }
> = {
  'base.en': { label: 'base.en', note: 'Higher accuracy · ~70 MB one-time download' },
  'tiny.en': { label: 'tiny.en', note: 'Fastest + lightest · ~30 MB one-time download' },
};

export const WHISPER_MODELS = Object.keys(LOCAL_WHISPER_MODELS) as WhisperModelName[];

/**
 * Precision fallback chain, most-quantized first. `q8` is the intended
 * dtype; `fp16`/`fp32` are larger escape hatches for the rare case where
 * a repo's quantized export fails to create a session on the current
 * runtime (see transformers.js issue #1707 for an example of that class
 * of failure).
 */
export const DTYPE_CHAIN = ['q8', 'fp16', 'fp32'] as const;

export type WhisperDtype = (typeof DTYPE_CHAIN)[number];

// ---------------------------------------------------------------------------
//  Worker protocol (main thread ⇆ src/workers/transcribe.worker.ts)
// ---------------------------------------------------------------------------

export interface WhisperLoadMessage {
  type: 'load';
  model: WhisperModelName;
  /** Preferred dtype (from localStorage); worker still falls back down the chain */
  dtype?: WhisperDtype;
}

export interface WhisperTranscribeMessage {
  type: 'transcribe';
  id: number;
  /** 16 kHz mono PCM samples; the buffer is transferred, not copied */
  audio: Float32Array;
}

export type WhisperWorkerRequest = WhisperLoadMessage | WhisperTranscribeMessage;

export type WhisperWorkerEvent =
  | { type: 'load-start'; model: WhisperModelName }
  | { type: 'progress'; model: WhisperModelName; progress: number }
  | { type: 'ready'; model: WhisperModelName; dtype: WhisperDtype }
  | { type: 'load-error'; model: WhisperModelName; message: string }
  | { type: 'result'; id: number; text: string; ms: number }
  | { type: 'transcribe-error'; id: number; message: string };

/** localStorage keys for user preferences */
const MODEL_PREF_KEY = 'nm-whisper-model';

export function readModelPref(): WhisperModelName {
  try {
    const value = localStorage.getItem(MODEL_PREF_KEY);
    if (value && value in LOCAL_WHISPER_MODELS) return value as WhisperModelName;
  } catch {
    /* private mode / unavailable */
  }
  return DEFAULT_WHISPER_MODEL;
}

export function writeModelPref(model: WhisperModelName): void {
  try {
    localStorage.setItem(MODEL_PREF_KEY, model);
  } catch {
    /* private mode / unavailable */
  }
}

/** Remember which dtype actually loaded for a model (skips failed retries next time) */
export function readDtypePref(model: WhisperModelName): WhisperDtype | undefined {
  try {
    const value = localStorage.getItem(`nm-whisper-dtype-${model}`);
    if (value && (DTYPE_CHAIN as readonly string[]).includes(value)) {
      return value as WhisperDtype;
    }
  } catch {
    /* private mode / unavailable */
  }
  return undefined;
}

export function writeDtypePref(model: WhisperModelName, dtype: WhisperDtype): void {
  try {
    localStorage.setItem(`nm-whisper-dtype-${model}`, dtype);
  } catch {
    /* private mode / unavailable */
  }
}
