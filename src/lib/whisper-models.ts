/**
 * Local Whisper transcription — shared model registry and worker protocol.
 *
 * Whisper runs fully in the browser via transformers.js v3 (ONNX Runtime Web,
 * WASM backend): call audio never leaves the machine, there is no API key
 * and no per-minute cost. The trade-off is a one-time model download and
 * CPU inference, so all models are quantized Xenova exports:
 *
 *   base.en — default; higher accuracy, ~70 MB one-time download
 *   tiny.en — lighter and faster fallback, ~30 MB one-time download
 *   base.fr — French calls; transcript in the original language, ~75 MB
 *   tiny.fr — French calls; lightest original-language transcript, ~35 MB
 *
 * The ".fr" models are the MULTILINGUAL base/tiny exports (same Xenova
 * q8 lineage as the .en ones — there is no dedicated .fr export). They
 * run Whisper's default TRANSCRIBE task with language='french' (see
 * transcribe.worker.ts): the transcript stays in the ORIGINAL language,
 * so the caption panel shows French text on French calls. English is
 * produced one step later — the LLM parse prompts (llm-parser.ts /
 * cloud-parser.ts) instruct the model to write every extracted value
 * in English, so the fields and the ticket note stay in English on
 * French calls. On a mixed call (English-speaking agent on the mic,
 * French-speaking customer on the CCP tab) Whisper is audio-driven and
 * still transcribes English speech readably under the French token.
 *
 * Repos are the Xenova exports (not the newer `onnx-community` ones): their
 * `q8` files are the classic DynamicQuantizeLinear exports that transformers.js
 * v3 + WASM creates sessions from reliably, whereas the newer repos ship a
 * transposed-weight QDQ layout that only the v4 runtime understands (loading
 * them on v3 fails with "TransposeDQWeightsForMatMulNBits Missing required
 * scale" at session creation).
 *
 * Model files are fetched from the Hugging Face Hub and cached by the
 * browser (Cache API), so only the first capture of each model downloads.
 *
 * LoRA / fine-tuned French models — see resolveRepo() below. Runtime LoRA
 * adapters are NOT loadable in this stack (neither transformers.js nor
 * onnxruntime-web ships an adapter API); a merged LoRA export is a drop-in
 * repo override.
 */

/** Hugging Face repo per selectable model */
export const LOCAL_WHISPER_MODELS = {
  'base.en': 'Xenova/whisper-base.en',
  'tiny.en': 'Xenova/whisper-tiny.en',
  'base.fr': 'Xenova/whisper-base',
  'tiny.fr': 'Xenova/whisper-tiny',
} as const;

export type WhisperModelName = keyof typeof LOCAL_WHISPER_MODELS;

export const DEFAULT_WHISPER_MODEL: WhisperModelName = 'base.en';

// ---------------------------------------------------------------------------
//  Repo resolution — how a LoRA fine-tune plugs into French transcription
// ---------------------------------------------------------------------------
//
// transformers.js and onnxruntime-web CANNOT load PEFT/LoRA adapters at
// runtime — there is no adapter API in the JS bindings (adapter hot-swap
// only exists in the native ORT-GenAI / llama.cpp stacks). The
// browser-compatible way to ship a French fine-tune — LoRA or full — is:
//
//   1. Fine-tune on French speech (PEFT LoRA, r=16-32 on attention/mlp
//      projections is the usual recipe for Whisper).
//   2. MERGE the adapter back: model.merge_and_unload() — after this the
//      checkpoint is a plain Whisper model, no adapter runtime needed.
//   3. Export to ONNX in the Xenova layout (encoder_model.onnx +
//      decoder_model_merged.onnx + their _quantized q8 variants; optimum-cli
//      export --model <merged> --task automatic-speech-recognition, then
//      quantize) and push the folder to a Hugging Face repo. No French
//      fine-tune currently ships ONNX exports, so this export step is ours.
//   4. Point base.fr (or tiny.fr) at that repo — see the two overrides
//      below. Everything else (dtype chain, French language option,
//      caching, RAM tracking) is unchanged: a merged model is a drop-in.
//
// Overrides, in priority order:
//   a. localStorage 'nm-whisper-repo-override' — JSON map like
//      {"base.fr":"org/whisper-base-fr-lora"}. Dev/ops escape hatch for
//      validating a candidate export before baking it into a build
//      (resolved on the MAIN thread — workers cannot read localStorage —
//      and forwarded to the worker in the load message).
//   b. Build-time env: VITE_WHISPER_BASE_FR_REPO / VITE_WHISPER_TINY_FR_REPO
//      (inlined by Vite, so they work inside the worker directly).
//   c. The default Xenova repos in LOCAL_WHISPER_MODELS.

const envRepoOverrides: Partial<Record<WhisperModelName, string>> = {
  'base.fr': import.meta.env.VITE_WHISPER_BASE_FR_REPO,
  'tiny.fr': import.meta.env.VITE_WHISPER_TINY_FR_REPO,
};

/**
 * Repo for `model` from build-time env (works in the worker too — Vite
 * inlines import.meta.env at compile time). Returns undefined when unset
 * or malformed; callers fall back to the registry default.
 */
export function repoFromEnv(model: WhisperModelName): string | undefined {
  const repo = envRepoOverrides[model];
  return typeof repo === 'string' && repo.includes('/') ? repo : undefined;
}

const REPO_OVERRIDE_KEY = 'nm-whisper-repo-override';

/**
 * Runtime repo override for `model` from localStorage — main thread only.
 * Lets a merged LoRA export be validated/swapped without a rebuild.
 */
export function readRepoOverride(model: WhisperModelName): string | undefined {
  try {
    const raw = localStorage.getItem(REPO_OVERRIDE_KEY);
    if (!raw) return undefined;
    const map = JSON.parse(raw) as Record<string, unknown>;
    const repo = map?.[model];
    if (typeof repo === 'string' && repo.includes('/')) return repo;
  } catch {
    /* private mode / malformed JSON — fall back to defaults */
  }
  return undefined;
}

/** Set/clear (repo='') a runtime override. Console escape hatch for ops. */
export function writeRepoOverride(model: WhisperModelName, repo: string): void {
  try {
    const map = JSON.parse(localStorage.getItem(REPO_OVERRIDE_KEY) ?? '{}') as Record<string, string>;
    if (repo) map[model] = repo;
    else delete map[model];
    localStorage.setItem(REPO_OVERRIDE_KEY, JSON.stringify(map));
  } catch {
    /* private mode / unavailable */
  }
}

export const WHISPER_MODEL_META: Record<
  WhisperModelName,
  { label: string; note: string }
> = {
  'base.en': { label: 'base.en', note: 'Higher accuracy · ~70 MB one-time download' },
  'tiny.en': { label: 'tiny.en', note: 'Fastest + lightest · ~30 MB one-time download' },
  'base.fr': {
    label: 'base.fr',
    note: 'French calls · transcript in the original language, parse fills fields in English · ~75 MB one-time download',
  },
  'tiny.fr': {
    label: 'tiny.fr',
    note: 'French calls · fastest original-language transcript, parse fills English fields · ~35 MB one-time download',
  },
};

export const WHISPER_MODELS = Object.keys(LOCAL_WHISPER_MODELS) as WhisperModelName[];

/** True for the multilingual (.fr) models — they transcribe French calls in
 *  the ORIGINAL language; English field values come from the LLM parse
 *  step, not from Whisper. */
export function isMultilingualModel(model: WhisperModelName): boolean {
  return model.endsWith('.fr');
}

/**
 * Approximate resident-memory footprint per model + precision (MB) — the
 * fallback RAM badge when the worker cannot measure its own heap
 * (performance.memory is main-thread-only in Chromium, absent elsewhere).
 */
export const WHISPER_RAM_ESTIMATE_MB: Record<WhisperModelName, Record<WhisperDtype, number>> = {
  'base.en': { q8: 150, fp32: 480 },
  'tiny.en': { q8: 60, fp32: 200 },
  // Multilingual twins share the .en param counts (74M / 39M)
  'base.fr': { q8: 150, fp32: 480 },
  'tiny.fr': { q8: 60, fp32: 200 },
};

/**
 * Precision fallback chain. `q8` (classic DynamicQuantizeLinear quantization)
 * is the intended dtype — small download and well-supported by the WASM/CPU
 * execution provider. `fp32` is the much larger escape hatch (~4× download)
 * for the rare case where a quantized export fails to create a session on
 * the current runtime. `fp16` is deliberately absent: it targets WebGPU
 * exports, not CPU/WASM, so it would only ever fail between the two.
 */
export const DTYPE_CHAIN = ['q8', 'fp32'] as const;

export type WhisperDtype = (typeof DTYPE_CHAIN)[number];

// ---------------------------------------------------------------------------
//  Worker protocol (main thread ⇆ src/workers/transcribe.worker.ts)
// ---------------------------------------------------------------------------

export interface WhisperLoadMessage {
  type: 'load';
  model: WhisperModelName;
  /** Preferred dtype (from localStorage); worker still falls back down the chain */
  dtype?: WhisperDtype;
  /**
   * Main-thread-resolved repo override (localStorage 'nm-whisper-repo-override'
   * — workers cannot read it themselves). Takes priority over env and default;
   * absent means "no runtime override, use env/registry".
   */
  repo?: string;
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
  | { type: 'transcribe-error'; id: number; message: string }
  | { type: 'mem-stats'; heapUsedMb: number; heapLimitMb: number };

/** Snapshot of the Whisper worker's JS heap — powers the RAM badge */
export interface WhisperMemStats {
  /** MB currently used by the worker's JS heap */
  heapUsedMb: number;
  /** MB heap ceiling the browser granted the worker */
  heapLimitMb: number;
}

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
