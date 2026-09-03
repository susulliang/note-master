import { useCallback, useEffect, useRef, useState } from 'react';
import { buildParsePrompt, buildParaphrasePrompt, buildPromptWindow, describeLoadError, getTranscriptCharCap, extractJsonLoose, extractLineFields, validateLlmFields, validateParaphraseReply, readLlmModelPref, writeLlmModelPref, readLlmEnabledPref, writeLlmEnabledPref, LLM_MODELS, } from '@/lib/llm-parser';
/** True when the raw error is a WebGPU device-lost code (0xEE00xxxx–0xEEFFxxxx
 *  as a bare unsigned decimal, e.g. 3999415816) or names a lost device. */
function isDeviceLostCode(raw) {
    const n = /^(\d{8,10})$/.exec(raw.trim())?.[1];
    if (n) {
        const v = Number(n);
        if (v >= 0xee000000 && v <= 0xeeffffff)
            return true;
    }
    return /device (has been )?lost/i.test(raw);
}
/** Hard cap on a single generation (ms) — WASM can be slow, but the agent
 *  should never wait on a stuck generation. The 1.5B model needs roughly
 *  double the wall time of the smaller ones for the same reply, so it gets
 *  a longer leash. Field data: 45s was NOT enough for the 0.5B model on a
 *  plain CPU (both attempts timed out → empty reply), so the caps were
 *  raised: a slow-but-complete parse beats a fast-but-empty one. */
const PARSE_TIMEOUT_MS = 120000;
const PARSE_TIMEOUT_MS_LARGE_MODEL = 240000;
/**
 * WebGPU budget. A working WebGPU pipeline parses in SECONDS — a
 * generation that has not produced a single token after this long is not
 * slow, it is HUNG (the load-fine-but-stall-at-first-inference WebGPU
 * failure mode field-seen on Qwen 0.5B fp32). The shorter leash means the
 * hang is detected — and recovered from — in a third of the CPU wait.
 */
const PARSE_TIMEOUT_MS_GPU = 60000;
/** Generation token cap for extraction. Condensed values keep the JSON
 *  short, but the cap MUST comfortably exceed the longest legitimate reply:
 *  a reply truncated mid-JSON parses as nothing, which is exactly how a
 *  form gets stuck on its first parse while the conversation grows. The
 *  issueDescription contract is recall-first — every customer point as
 *  its own clause, up to ~1000 chars ≈ 250 tokens on top of the other
 *  nine fields — so the cap sits well above that. */
const MAX_NEW_TOKENS = 1024;
/** Generation token cap for a paraphrase pass — two condensed strings, so
 *  well under the extraction budget (raised alongside the recall-first
 *  issueDescription cap: every clause in, none omitted). */
const MAX_PARAPHRASE_NEW_TOKENS = 640;
/** A transcript at least this long that yields ZERO fields means the model
 *  failed to understand it (not that the call mentioned nothing) — worth
 *  one strict retry. Real support calls always produce at least an issue
 *  description at this length. */
const SUBSTANTIAL_TRANSCRIPT_CHARS = 300;
/**
 * Ultra-small on-device LLM — the PRIMARY ticket-field parser.
 *
 * Mirrors `useLocalTranscriber`'s worker-ownership pattern: the worker is
 * created lazily on the first `load()`, keeps one text-generation pipeline
 * resident, and supports switching between the registered models. The
 * `parse()` API takes a speaker-tagged transcript plus the field ids to
 * extract (callers normally pass ALL of them) and returns validated fields
 * — or `[]` when disabled / not loaded / the model produced nothing
 * usable.
 *
 * The hook never auto-loads on its own: the call-capture hook decides when
 * a conversation is worth a parse, and the page warms the model when call
 * capture starts, so agents who never capture a call never download a model.
 */
export function useLlmParser() {
    const [model, setModel] = useState(readLlmModelPref);
    const [status, setStatus] = useState('idle');
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState(null);
    const [enabled, setEnabledState] = useState(readLlmEnabledPref);
    const [isParsing, setIsParsing] = useState(false);
    const [isParaphrasing, setIsParaphrasing] = useState(false);
    const [lastParseMs, setLastParseMs] = useState(null);
    /** Debug metrics of the last parse: prompt/reply sizes + generation speed */
    const [lastStats, setLastStats] = useState(null);
    /** What the last parse sent to the model: which entries made the window */
    const [lastWindow, setLastWindow] = useState(null);
    /** Raw model reply of the last parse (capped for display) */
    const [lastReply, setLastReply] = useState(null);
    /** Backend the pipeline initialized on ('gpu' = WebGPU, 'cpu' = WASM) */
    const [device, setDevice] = useState(null);
    /** Live generation progress of the in-flight parse: 0–1 (tokens
     *  generated / max_new_tokens), streamed per-token by the worker */
    const [genProgress, setGenProgress] = useState(0);
    /** Worker JS-heap snapshot (RAM badge); null until the worker reports */
    const [memStats, setMemStats] = useState(null);
    /** Precision that actually loaded (drives the RAM estimate fallback) */
    const [dtype, setDtype] = useState(null);
    /** Variants that failed before the current one loaded (download manager) */
    const [failedAttempts, setFailedAttempts] = useState(null);
    const workerRef = useRef(null);
    const modelRef = useRef(model);
    const statusRef = useRef(status);
    const deviceRef = useRef(device);
    const enabledRef = useRef(enabled);
    const nextIdRef = useRef(0);
    /** Load() waiters — resolved on ready (load-error resolves them too; the
     *  error is surfaced via the status state instead of a rejection). */
    const pendingLoadsRef = useRef([]);
    const pendingParsesRef = useRef(new Map());
    /** Promise of the latest load request — parse() awaits it */
    const loadPromiseRef = useRef(null);
    useEffect(() => {
        modelRef.current = model;
    }, [model]);
    useEffect(() => {
        statusRef.current = status;
    }, [status]);
    useEffect(() => {
        enabledRef.current = enabled;
    }, [enabled]);
    useEffect(() => {
        deviceRef.current = device;
    }, [device]);
    const handleWorkerEvent = useCallback((event) => {
        const data = event.data;
        switch (data.type) {
            case 'load-start':
                statusRef.current = 'loading';
                setStatus('loading');
                setProgress(0);
                setError(null);
                break;
            case 'progress':
                statusRef.current = 'loading';
                setStatus('loading');
                setProgress(data.progress);
                break;
            case 'ready':
                statusRef.current = 'ready';
                setModel(data.model);
                modelRef.current = data.model;
                writeLlmModelPref(data.model);
                setStatus('ready');
                setProgress(100);
                setError(null);
                setDevice(data.device);
                deviceRef.current = data.device;
                setDtype(data.dtype);
                setFailedAttempts(data.failedAttempts ?? null);
                {
                    const waiters = pendingLoadsRef.current;
                    pendingLoadsRef.current = [];
                    waiters.forEach((resolve) => resolve());
                }
                break;
            case 'load-error': {
                statusRef.current = 'error';
                setStatus('error');
                setError(describeLoadError(data.message));
                setFailedAttempts((data.failedAttempts ?? []).map((f) => ({
                    ...f,
                    message: describeLoadError(f.message),
                })));
                {
                    const waiters = pendingLoadsRef.current;
                    pendingLoadsRef.current = [];
                    waiters.forEach((resolve) => resolve());
                }
                // GPU device-lost recovery: a crashed WebGPU device leaves a stale
                // reference in transformers.js' shared state (env.webgpu.device),
                // which poisons every later pipeline creation on ANY backend — that
                // is why the wasm fallback after a GPU crash also fails. A fresh
                // worker is a fresh ORT instance; recreate it and load wasm once.
                const gpuCrashed = (data.failedAttempts ?? []).some((f) => f.device === 'gpu' || isDeviceLostCode(f.message));
                if (gpuCrashed) {
                    const model = data.model;
                    window.setTimeout(() => {
                        workerRef.current?.terminate();
                        workerRef.current = null;
                        statusRef.current = 'loading';
                        setStatus('loading');
                        setError(null);
                        const worker = ensureWorker();
                        const promise = new Promise((resolve) => {
                            pendingLoadsRef.current.push(resolve);
                        });
                        loadPromiseRef.current = promise;
                        // Clean worker + explicit cpu pin: skip the GPU entirely
                        worker.postMessage({ type: 'load', model, device: 'cpu' });
                    }, 250);
                }
                break;
            }
            case 'gen-progress': {
                // Live per-token generation progress of the in-flight parse —
                // drives the DETERMINATE progress bar (generated/max_new_tokens).
                // Stale events (a timed-out attempt's late tokens) are ignored.
                if (!pendingParsesRef.current.has(data.id))
                    break;
                setGenProgress(Math.min(1, data.generated / Math.max(1, data.maxNewTokens)));
                break;
            }
            case 'result': {
                const pending = pendingParsesRef.current.get(data.id);
                if (!pending)
                    return;
                pendingParsesRef.current.delete(data.id);
                window.clearTimeout(pending.timer);
                // Raw generation text — validation/retry lives in parse(), which can
                // re-prompt; here we only hand the reply back (with the worker's
                // own generation-time measurement for the speed metrics).
                pending.resolve({ text: data.text, ms: data.ms, timedOut: false });
                break;
            }
            case 'parse-error': {
                const pending = pendingParsesRef.current.get(data.id);
                if (!pending)
                    return;
                pendingParsesRef.current.delete(data.id);
                window.clearTimeout(pending.timer);
                pending.resolve({ text: '', ms: 0, timedOut: false });
                break;
            }
            case 'mem-stats':
                setMemStats({ heapUsedMb: data.heapUsedMb, heapLimitMb: data.heapLimitMb });
                break;
        }
    }, []);
    const ensureWorker = useCallback(() => {
        if (workerRef.current)
            return workerRef.current;
        const worker = new Worker(new URL('../workers/llm-parser.worker.ts', import.meta.url), {
            type: 'module',
        });
        worker.addEventListener('message', handleWorkerEvent);
        worker.addEventListener('error', (event) => {
            // Worker-level failure (script load error, wasm init crash, …)
            statusRef.current = 'error';
            setStatus('error');
            setError(`LLM parser worker crashed: ${event.message || 'unknown error'}`);
            for (const pending of pendingParsesRef.current.values()) {
                window.clearTimeout(pending.timer);
                pending.resolve({ text: '', ms: 0, timedOut: false });
            }
            pendingParsesRef.current.clear();
            const waiters = pendingLoadsRef.current;
            pendingLoadsRef.current = [];
            waiters.forEach((resolve) => resolve());
        });
        workerRef.current = worker;
        return worker;
    }, [handleWorkerEvent]);
    /**
     * Recover from a HUNG generation. transformers.js cannot cancel an
     * in-flight generation, and the worker serializes generations through
     * one chain — so a single stuck inference (0 tokens, no error, timeout
     * fired) blocks EVERY later parse forever. That is exactly the "later
     * conversation info stops appending" failure mode. The only reliable
     * unblock is terminating the worker and reloading the model in a fresh
     * one (weights come from the browser cache, so the reload is fast).
     *
     * A hang on the GPU backend reloads pinned to CPU — the
     * loads-but-stalls WebGPU mode is the known culprit there and CPU/WASM
     * q8 is the proven-reliable build. A CPU hang gets a clean same-backend
     * retry (it may legitimately have been a one-off stall).
     */
    const recoverAfterHang = useCallback(() => {
        const hungOnGpu = deviceRef.current === 'gpu';
        const target = modelRef.current;
        workerRef.current?.terminate();
        workerRef.current = null;
        // Settle every in-flight generation: they will never get a result now
        for (const pending of pendingParsesRef.current.values()) {
            window.clearTimeout(pending.timer);
            pending.resolve({ text: '', ms: 0, timedOut: true });
        }
        pendingParsesRef.current.clear();
        statusRef.current = 'loading';
        setStatus('loading');
        setGenProgress(0);
        const worker = ensureWorker();
        const promise = new Promise((resolve) => {
            pendingLoadsRef.current.push(resolve);
        });
        loadPromiseRef.current = promise;
        worker.postMessage({
            type: 'load',
            model: target,
            ...(hungOnGpu ? { device: 'cpu' } : {}),
        });
    }, [ensureWorker]);
    // Terminate the worker on unmount; settle anything still pending.
    useEffect(() => {
        return () => {
            workerRef.current?.terminate();
            workerRef.current = null;
            for (const pending of pendingParsesRef.current.values()) {
                window.clearTimeout(pending.timer);
                pending.resolve({ text: '', ms: 0, timedOut: false });
            }
            pendingParsesRef.current.clear();
            const waiters = pendingLoadsRef.current;
            pendingLoadsRef.current = [];
            waiters.forEach((resolve) => resolve());
        };
    }, []);
    /**
     * Load (or switch to) a model — optionally pinned to a backend ('gpu'
     * forces WebGPU+fp32, 'cpu' forces wasm+q8). Resolves when ready or
     * failed. The download manager uses the device pin; the automatic path
     * leaves it undefined (GPU when available, wasm fallback).
     */
    const load = useCallback((target, device) => {
        const requested = target ?? modelRef.current;
        if (!enabledRef.current) {
            statusRef.current = 'disabled';
            setStatus('disabled');
            return Promise.resolve();
        }
        if (statusRef.current === 'ready' &&
            modelRef.current === requested &&
            (!device || deviceRef.current === device)) {
            return Promise.resolve();
        }
        const worker = ensureWorker();
        statusRef.current = 'loading';
        setStatus('loading');
        setFailedAttempts(null);
        const promise = new Promise((resolve) => {
            pendingLoadsRef.current.push(resolve);
        });
        loadPromiseRef.current = promise;
        worker.postMessage({
            type: 'load',
            model: requested,
            ...(device ? { device } : {}),
        });
        return promise;
    }, [ensureWorker]);
    /** Switch the resident model and start loading it. */
    const switchModel = useCallback((target) => {
        setModel(target);
        modelRef.current = target;
        writeLlmModelPref(target);
        if (statusRef.current === 'ready' || statusRef.current === 'loading') {
            void load(target);
        }
    }, [load]);
    const setEnabled = useCallback((value) => {
        setEnabledState(value);
        enabledRef.current = value;
        writeLlmEnabledPref(value);
        if (value) {
            if (statusRef.current === 'disabled') {
                statusRef.current = 'idle';
                setStatus('idle');
            }
        }
        else {
            statusRef.current = 'disabled';
            setStatus('disabled');
        }
    }, []);
    /**
     * Await model readiness (downloading on demand). false when the parser is
     * disabled or the model failed to load — callers then fall back to the
     * provisional regex values.
     */
    const ensureReady = useCallback(async () => {
        if (!enabledRef.current || statusRef.current === 'disabled')
            return false;
        if (statusRef.current !== 'ready' || loadPromiseRef.current) {
            if (loadPromiseRef.current)
                await loadPromiseRef.current;
            else
                await load();
            if (statusRef.current !== 'ready')
                return false;
        }
        return !!workerRef.current;
    }, [load]);
    /** One generation round-trip → raw reply text + the worker's own
     *  generation-time measurement ("" / 0 on error/timeout). The worker
     *  serializes generations internally, so parse and paraphrase can never
     *  run inference concurrently. */
    const generateReply = useCallback((system, user, maxNewTokens) => {
        const worker = workerRef.current;
        if (!worker)
            return Promise.resolve({ text: '', ms: 0, timedOut: false });
        return new Promise((resolve) => {
            const id = (nextIdRef.current += 1);
            // Device-aware leash: WebGPU hangs (not slow) get detected fast;
            // CPU/WASM keeps the long budget because it IS legitimately slow
            const timeoutMs = deviceRef.current === 'gpu'
                ? PARSE_TIMEOUT_MS_GPU
                : modelRef.current === 'qwen2.5-1.5b'
                    ? PARSE_TIMEOUT_MS_LARGE_MODEL
                    : PARSE_TIMEOUT_MS;
            const timer = window.setTimeout(() => {
                const pending = pendingParsesRef.current.get(id);
                if (!pending)
                    return;
                pendingParsesRef.current.delete(id);
                resolve({ text: '', ms: 0, timedOut: true });
                // The worker is still stuck in that generation and cannot cancel
                // it — terminate + reload so later parses are not queued behind
                // a dead inference forever
                recoverAfterHang();
            }, timeoutMs);
            pendingParsesRef.current.set(id, { resolve, timer });
            worker.postMessage({ type: 'parse', id, system, user, maxNewTokens });
        });
    }, [recoverAfterHang]);
    /**
     * Run one extraction. Resolves with validated fields — `[]` when the
     * parser is disabled, not loaded, times out, or the model's output fails
     * validation. Never rejects: a failed parse must not break the capture
     * loop.
     *
     * `prior` carries the previous parse's resolution steps back into the
     * prompt so the cumulative field keeps growing instead of being replaced
     * by a partial re-read.
     *
     * When the model's reply is BROKEN — no balanced JSON object, the usual
     * signature of a reply truncated mid-generation or the model rambling —
     * one strict retry is made with brevity pressure. Without it, every parse
     * after the first would fail silently and the form would freeze on the
     * first parse's values forever.
     */
    const parse = useCallback(async (entries, missingFieldIds, prior) => {
        if (entries.length === 0 || !(await ensureReady()))
            return [];
        /** Validate a raw reply: loose JSON extraction (with salvage of
         *  complete pairs from truncated replies), then the SIMPLE line
         *  format when the reply holds no JSON at all, then field
         *  validation. null ⇔ nothing usable in the reply at all. */
        const validateReply = (text) => {
            if (!text)
                return null;
            const json = extractJsonLoose(text);
            if (json)
                return validateLlmFields(json);
            const lines = extractLineFields(text);
            return lines ? validateLlmFields(lines) : null;
        };
        const started = performance.now();
        setIsParsing(true);
        setGenProgress(0);
        // Device-aware transcript window: CPU/WASM prefill is the wall-time
        // bottleneck, so it gets a tighter tail (see getTranscriptCharCap)
        const charCap = getTranscriptCharCap(deviceRef.current);
        // Debug trail: exactly what this parse sends to the model
        setLastWindow(buildPromptWindow(entries, charCap));
        /** Metrics of the attempt whose reply was ACCEPTED (the strict retry
         *  overwrites these when its reply wins) */
        let promptChars = 0;
        let genMs = 0;
        let attempts = 0;
        let timedOut = false;
        try {
            const first = buildParsePrompt(entries, missingFieldIds, prior);
            promptChars = first.system.length + first.user.length;
            const firstRun = await generateReply(first.system, first.user, MAX_NEW_TOKENS);
            attempts = 1;
            genMs = firstRun.ms;
            timedOut = firstRun.timedOut;
            let reply = firstRun.text;
            let fields = validateReply(reply);
            // Retry when the reply was BROKEN (no balanced JSON object, the
            // truncation/rambling signature) — or when a substantial
            // conversation produced ZERO fields: the model failed to understand
            // the situation, and a second, brevity-hardened pass often reads
            // what the first one missed. (A short transcript that legitimately
            // mentions nothing needs no retry.)
            //
            // NEVER retry a TIMEOUT: the worker is still busy generating the
            // first attempt (transformers.js cannot cancel it), so the retry
            // would queue behind it — doubling the stall with zero chance of
            // being faster. The next idle parse (armed in runLlmParse's
            // finally) retries with the newest transcript instead.
            const chars = entries.reduce((n, e) => n + e.text.length, 0);
            const modelFailed = fields === null || (fields.length === 0 && chars >= SUBSTANTIAL_TRANSCRIPT_CHARS);
            if (modelFailed && !firstRun.timedOut) {
                // Brevity-hardened retry, same line format
                const strict = buildParsePrompt(entries, missingFieldIds, prior, true, 'simple', charCap);
                const retriedRun = await generateReply(strict.system, strict.user, MAX_NEW_TOKENS);
                attempts = 2;
                timedOut = retriedRun.timedOut;
                const retried = validateReply(retriedRun.text);
                if (retried !== null && (fields === null || retried.length > 0)) {
                    fields = retried;
                    reply = retriedRun.text;
                    // The retry's prompt+generation are what actually produced the
                    // accepted reply — report those
                    promptChars = strict.system.length + strict.user.length;
                    genMs = retriedRun.ms;
                }
            }
            // Keep the raw reply (even a broken one — that is the interesting
            // case to inspect) for the debug panel
            setLastReply(reply ? reply.slice(0, 4000) : '');
            // Speed metrics for the debug panel: what went in, what came out,
            // how fast the model generated it (~4 chars/token estimate)
            const wallMs = Math.round(performance.now() - started);
            const replyChars = reply.length;
            const replyTokens = Math.ceil(replyChars / 4);
            setLastStats({
                promptChars,
                promptTokens: Math.ceil(promptChars / 4),
                replyChars,
                replyTokens,
                genMs,
                wallMs,
                tokensPerSec: genMs > 0 ? Math.round((replyTokens / genMs) * 1000) : 0,
                attempts,
                timedOut,
            });
            return fields ?? [];
        }
        finally {
            setIsParsing(false);
            // Wall time of the whole parse, retry included — that is what the
            // agent actually waited for
            setLastParseMs(Math.round(performance.now() - started));
        }
    }, [ensureReady, generateReply]);
    /**
     * Paraphrase the VERBATIM clause lists the regex engine collected into
     * concise note style. A much simpler contract than the extraction parse —
     * two strings in, two strings out — so it also works when the full parse
     * struggles, and it keeps the provisional regex fill from reading like a
     * raw transcript dump. Resolves with the polished fields (possibly a
     * subset), `[]` when the model is unavailable or its reply held nothing
     * usable — the verbatim fill then stands. Never rejects.
     */
    const paraphrase = useCallback(async (input) => {
        if (!(await ensureReady()))
            return [];
        setIsParaphrasing(true);
        try {
            const { system, user } = buildParaphrasePrompt(input);
            const run = await generateReply(system, user, MAX_PARAPHRASE_NEW_TOKENS);
            if (!run.text)
                return [];
            const json = extractJsonLoose(run.text);
            return json ? validateParaphraseReply(json) : [];
        }
        finally {
            setIsParaphrasing(false);
        }
    }, [ensureReady, generateReply]);
    return {
        model,
        status,
        progress,
        error,
        enabled,
        isParsing,
        /** True while the paraphrasing (note-polish) generation is in flight */
        isParaphrasing,
        lastParseMs,
        /** Debug metrics of the last parse: prompt/reply chars + tokens, model
         *  generation time and output tokens/s — powers the speed readout */
        lastStats,
        /** Which transcript entries the LAST parse sent to the model — the
         *  caption panel highlights them so parsing behavior is inspectable */
        lastWindow,
        /** Raw model reply from the last parse (capped) — debugging what the
         *  model actually said, not just what survived validation */
        lastReply,
        /** Backend the pipeline is running on: 'gpu' (WebGPU) or 'cpu' (WASM) */
        device,
        /** Precision that actually loaded (q8 / fp32 / fp16 / q4f16) */
        dtype,
        /** Worker JS-heap snapshot for the RAM badge (null until reported) */
        memStats,
        /** Load variants that failed before the current session (manager UI) */
        failedAttempts,
        /** Live generation progress of the in-flight parse (0–1) — tokens
         *  generated / max_new_tokens, streamed per-token by the worker */
        genProgress,
        isReady: status === 'ready',
        setEnabled,
        load,
        switchModel,
        parse,
        /** Condense verbatim vernacular clauses into concise note style */
        paraphrase,
        /** One raw generation round-trip — for SOP heading ranking and any
         *  other free-form prompts. Returns empty text when the worker is
         *  disabled / not yet loaded; timedOut=true signals the generation
         *  was killed by the safety timeout. */
        generate: generateReply,
        /** Selectable model names for the settings UI */
        models: LLM_MODELS,
    };
}
