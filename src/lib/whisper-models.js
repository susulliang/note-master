/**
 * Local Whisper transcription — shared model registry and worker protocol.
 *
 * Whisper runs fully in the browser via transformers.js v3 (ONNX Runtime Web,
 * WASM backend): call audio never leaves the machine, there is no API key
 * and no per-minute cost. The trade-off is a one-time model download and
 * CPU inference, so both models are English-only quantized exports:
 *
 *   base.en — default; higher accuracy, ~70 MB one-time download
 *   tiny.en — lighter and faster fallback, ~30 MB one-time download
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
 */
/** Hugging Face repo per selectable model */
export const LOCAL_WHISPER_MODELS = {
    'base.en': 'Xenova/whisper-base.en',
    'tiny.en': 'Xenova/whisper-tiny.en',
};
export const DEFAULT_WHISPER_MODEL = 'base.en';
export const WHISPER_MODEL_META = {
    'base.en': { label: 'base.en', note: 'Higher accuracy · ~70 MB one-time download' },
    'tiny.en': { label: 'tiny.en', note: 'Fastest + lightest · ~30 MB one-time download' },
};
export const WHISPER_MODELS = Object.keys(LOCAL_WHISPER_MODELS);
/**
 * Approximate resident-memory footprint per model + precision (MB) — the
 * fallback RAM badge when the worker cannot measure its own heap
 * (performance.memory is main-thread-only in Chromium, absent elsewhere).
 */
export const WHISPER_RAM_ESTIMATE_MB = {
    'base.en': { q8: 150, fp32: 480 },
    'tiny.en': { q8: 60, fp32: 200 },
};
/**
 * Precision fallback chain. `q8` (classic DynamicQuantizeLinear quantization)
 * is the intended dtype — small download and well-supported by the WASM/CPU
 * execution provider. `fp32` is the much larger escape hatch (~4× download)
 * for the rare case where a quantized export fails to create a session on
 * the current runtime. `fp16` is deliberately absent: it targets WebGPU
 * exports, not CPU/WASM, so it would only ever fail between the two.
 */
export const DTYPE_CHAIN = ['q8', 'fp32'];
/** localStorage keys for user preferences */
const MODEL_PREF_KEY = 'nm-whisper-model';
export function readModelPref() {
    try {
        const value = localStorage.getItem(MODEL_PREF_KEY);
        if (value && value in LOCAL_WHISPER_MODELS)
            return value;
    }
    catch {
        /* private mode / unavailable */
    }
    return DEFAULT_WHISPER_MODEL;
}
export function writeModelPref(model) {
    try {
        localStorage.setItem(MODEL_PREF_KEY, model);
    }
    catch {
        /* private mode / unavailable */
    }
}
/** Remember which dtype actually loaded for a model (skips failed retries next time) */
export function readDtypePref(model) {
    try {
        const value = localStorage.getItem(`nm-whisper-dtype-${model}`);
        if (value && DTYPE_CHAIN.includes(value)) {
            return value;
        }
    }
    catch {
        /* private mode / unavailable */
    }
    return undefined;
}
export function writeDtypePref(model, dtype) {
    try {
        localStorage.setItem(`nm-whisper-dtype-${model}`, dtype);
    }
    catch {
        /* private mode / unavailable */
    }
}
