import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExtractedField, TranscriptEntry } from '@/lib/field-extraction';
import {
  buildParsePrompt,
  extractJsonLoose,
  validateLlmFields,
  readLlmModelPref,
  writeLlmModelPref,
  readLlmEnabledPref,
  writeLlmEnabledPref,
  LLM_MODELS,
  type LlmModelName,
  type LlmWorkerEvent,
  type PriorLlmValues,
} from '@/lib/llm-parser';

export type LlmParserStatus = 'idle' | 'loading' | 'ready' | 'error' | 'disabled';

interface PendingParse {
  resolve: (text: string) => void;
  timer: number;
}

/** Hard cap on a single generation (ms) — WASM can be slow, but the agent
 *  should never wait on a stuck generation. */
const PARSE_TIMEOUT_MS = 45_000;

/** Generation token cap for extraction. Condensed values keep the JSON
 *  short, but the cap MUST comfortably exceed the longest legitimate reply:
 *  a reply truncated mid-JSON parses as nothing, which is exactly how a
 *  form gets stuck on its first parse while the conversation grows. */
const MAX_NEW_TOKENS = 512;

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
  const [model, setModel] = useState<LlmModelName>(readLlmModelPref);
  const [status, setStatus] = useState<LlmParserStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabledState] = useState(readLlmEnabledPref);
  const [isParsing, setIsParsing] = useState(false);
  const [lastParseMs, setLastParseMs] = useState<number | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const modelRef = useRef(model);
  const statusRef = useRef<LlmParserStatus>(status);
  const enabledRef = useRef(enabled);
  const nextIdRef = useRef(0);
  /** Load() waiters — resolved on ready (load-error resolves them too; the
   *  error is surfaced via the status state instead of a rejection). */
  const pendingLoadsRef = useRef<Array<() => void>>([]);
  const pendingParsesRef = useRef(new Map<number, PendingParse>());
  /** Promise of the latest load request — parse() awaits it */
  const loadPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    modelRef.current = model;
  }, [model]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const handleWorkerEvent = useCallback((event: MessageEvent<LlmWorkerEvent>) => {
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
        {
          const waiters = pendingLoadsRef.current;
          pendingLoadsRef.current = [];
          waiters.forEach((resolve) => resolve());
        }
        break;

      case 'load-error':
        statusRef.current = 'error';
        setStatus('error');
        setError(data.message);
        {
          const waiters = pendingLoadsRef.current;
          pendingLoadsRef.current = [];
          waiters.forEach((resolve) => resolve());
        }
        break;

      case 'result': {
        const pending = pendingParsesRef.current.get(data.id);
        if (!pending) return;
        pendingParsesRef.current.delete(data.id);
        window.clearTimeout(pending.timer);
        // Raw generation text — validation/retry lives in parse(), which can
        // re-prompt; here we only hand the reply back.
        pending.resolve(data.text);
        break;
      }

      case 'parse-error': {
        const pending = pendingParsesRef.current.get(data.id);
        if (!pending) return;
        pendingParsesRef.current.delete(data.id);
        window.clearTimeout(pending.timer);
        pending.resolve('');
        break;
      }
    }
  }, []);

  const ensureWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;

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
        pending.resolve('');
      }
      pendingParsesRef.current.clear();
      const waiters = pendingLoadsRef.current;
      pendingLoadsRef.current = [];
      waiters.forEach((resolve) => resolve());
    });

    workerRef.current = worker;
    return worker;
  }, [handleWorkerEvent]);

  // Terminate the worker on unmount; settle anything still pending.
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      for (const pending of pendingParsesRef.current.values()) {
        window.clearTimeout(pending.timer);
        pending.resolve('');
      }
      pendingParsesRef.current.clear();
      const waiters = pendingLoadsRef.current;
      pendingLoadsRef.current = [];
      waiters.forEach((resolve) => resolve());
    };
  }, []);

  /** Load (or switch to) a model. Resolves when ready or failed. */
  const load = useCallback(
    (target?: LlmModelName): Promise<void> => {
      const requested = target ?? modelRef.current;
      if (!enabledRef.current) {
        statusRef.current = 'disabled';
        setStatus('disabled');
        return Promise.resolve();
      }
      if (statusRef.current === 'ready' && modelRef.current === requested) {
        return Promise.resolve();
      }

      const worker = ensureWorker();
      statusRef.current = 'loading';
      setStatus('loading');

      const promise = new Promise<void>((resolve) => {
        pendingLoadsRef.current.push(resolve);
      });
      loadPromiseRef.current = promise;
      worker.postMessage({ type: 'load', model: requested });
      return promise;
    },
    [ensureWorker]
  );

  /** Switch the resident model and start loading it. */
  const switchModel = useCallback(
    (target: LlmModelName) => {
      setModel(target);
      modelRef.current = target;
      writeLlmModelPref(target);
      if (statusRef.current === 'ready' || statusRef.current === 'loading') {
        void load(target);
      }
    },
    [load]
  );

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    enabledRef.current = value;
    writeLlmEnabledPref(value);
    if (value) {
      if (statusRef.current === 'disabled') {
        statusRef.current = 'idle';
        setStatus('idle');
      }
    } else {
      statusRef.current = 'disabled';
      setStatus('disabled');
    }
  }, []);

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
  const parse = useCallback(
    async (
      entries: TranscriptEntry[],
      missingFieldIds: readonly string[],
      prior?: PriorLlmValues
    ): Promise<ExtractedField[]> => {
      if (!enabledRef.current || entries.length === 0 || statusRef.current === 'disabled') {
        return [];
      }

      // Model not ready → load on demand (one-time download)
      if (statusRef.current !== 'ready' || loadPromiseRef.current) {
        if (loadPromiseRef.current) await loadPromiseRef.current;
        else await load();
        if (statusRef.current !== 'ready') return [];
      }

      const worker = workerRef.current;
      if (!worker) return [];

      /** One generation round-trip → raw reply text ("" on error/timeout) */
      const generate = (system: string, user: string): Promise<string> =>
        new Promise<string>((resolve) => {
          const id = (nextIdRef.current += 1);
          const timer = window.setTimeout(() => {
            const pending = pendingParsesRef.current.get(id);
            if (!pending) return;
            pendingParsesRef.current.delete(id);
            resolve('');
          }, PARSE_TIMEOUT_MS);
          pendingParsesRef.current.set(id, { resolve, timer });
          worker.postMessage({
            type: 'parse',
            id,
            system,
            user,
            maxNewTokens: MAX_NEW_TOKENS,
          });
        });

      /** Validate a raw reply: loose JSON extraction (with salvage of
       *  complete pairs from truncated replies) then field validation.
       *  null ⇔ nothing usable in the reply at all. */
      const validateReply = (text: string): ExtractedField[] | null => {
        if (!text) return null;
        const json = extractJsonLoose(text);
        return json ? validateLlmFields(json) : null;
      };

      const started = performance.now();
      setIsParsing(true);
      try {
        const first = buildParsePrompt(entries, missingFieldIds, prior);
        let fields = validateReply(await generate(first.system, first.user));

        // Retry when the reply was BROKEN (no balanced JSON object, the
        // truncation/rambling signature) — or when a substantial
        // conversation produced ZERO fields: the model failed to understand
        // the situation, and a second, brevity-hardened pass often reads
        // what the first one missed. (A short transcript that legitimately
        // mentions nothing needs no retry.)
        const chars = entries.reduce((n, e) => n + e.text.length, 0);
        const modelFailed = fields === null || (fields.length === 0 && chars >= SUBSTANTIAL_TRANSCRIPT_CHARS);
        if (modelFailed) {
          const strict = buildParsePrompt(entries, missingFieldIds, prior, true);
          const retried = validateReply(await generate(strict.system, strict.user));
          if (retried !== null && (fields === null || retried.length > 0)) {
            fields = retried;
          }
        }

        return fields ?? [];
      } finally {
        setIsParsing(false);
        // Wall time of the whole parse, retry included — that is what the
        // agent actually waited for
        setLastParseMs(Math.round(performance.now() - started));
      }
    },
    [load]
  );

  return {
    model,
    status,
    progress,
    error,
    enabled,
    isParsing,
    lastParseMs,
    isReady: status === 'ready',
    setEnabled,
    load,
    switchModel,
    parse,
    /** Selectable model names for the settings UI */
    models: LLM_MODELS,
  };
}
