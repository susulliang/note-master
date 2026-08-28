import { useCallback, useEffect, useRef, useState } from 'react';
import {
  readModelPref,
  writeModelPref,
  readDtypePref,
  writeDtypePref,
  type WhisperModelName,
  type WhisperDtype,
  type WhisperWorkerEvent,
} from '@/lib/whisper-models';

export type WhisperStatus = 'idle' | 'loading' | 'ready' | 'error';

/** The interface use-call-capture consumes — just "PCM in, text out". */
export interface CallTranscriber {
  transcribe(audio: Float32Array): Promise<string>;
}

interface PendingLoad {
  model: WhisperModelName;
  resolve: () => void;
  reject: (reason: Error) => void;
}

interface PendingTranscribe {
  resolve: (text: string) => void;
  reject: (reason: Error) => void;
}

/**
 * Local Whisper transcription, fully on-device (transformers.js WASM).
 *
 * Owns the transcribe worker: it is created lazily on the first `load()`
 * call (no worker spin-up for agents who never touch call capture), keeps
 * one pipeline resident, and supports switching between base.en (default,
 * higher accuracy) and tiny.en (faster, lighter). Downloads are one-time
 * per model — the browser caches the weights.
 *
 * Model and working-dtype preferences survive reloads via localStorage.
 */
export function useLocalTranscriber() {
  const [model, setModel] = useState<WhisperModelName>(readModelPref);
  const [status, setStatus] = useState<WhisperStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [dtype, setDtype] = useState<WhisperDtype | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastInferenceMs, setLastInferenceMs] = useState<number | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const modelRef = useRef(model);
  const statusRef = useRef(status);
  const nextIdRef = useRef(0);
  const pendingLoadsRef = useRef<PendingLoad[]>([]);
  const pendingTranscribesRef = useRef(new Map<number, PendingTranscribe>());
  /** Promise of the latest load request — transcribe() awaits it */
  const loadPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    modelRef.current = model;
  }, [model]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const settleLoads = (target: WhisperModelName, err?: Error) => {
    const remaining: PendingLoad[] = [];
    for (const pending of pendingLoadsRef.current) {
      if (pending.model === target) {
        if (err) pending.reject(err);
        else pending.resolve();
      } else {
        remaining.push(pending);
      }
    }
    pendingLoadsRef.current = remaining;
  };

  const handleWorkerEvent = useCallback((event: MessageEvent<WhisperWorkerEvent>) => {
    const data = event.data;

    switch (data.type) {
      case 'load-start':
        // Set refs synchronously: promise continuations can run before
        // React commits the state update (statusRef would go stale).
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
        writeModelPref(data.model);
        setDtype(data.dtype);
        writeDtypePref(data.model, data.dtype);
        setStatus('ready');
        setProgress(100);
        setError(null);
        settleLoads(data.model);
        break;

      case 'load-error': {
        const err = new Error(data.message);
        statusRef.current = 'error';
        setStatus('error');
        setError(data.message);
        settleLoads(data.model, err);
        break;
      }

      case 'result': {
        setLastInferenceMs(data.ms);
        const pending = pendingTranscribesRef.current.get(data.id);
        if (pending) {
          pendingTranscribesRef.current.delete(data.id);
          pending.resolve(data.text);
        }
        break;
      }

      case 'transcribe-error': {
        const pending = pendingTranscribesRef.current.get(data.id);
        if (pending) {
          pendingTranscribesRef.current.delete(data.id);
          pending.reject(new Error(data.message));
        }
        break;
      }
    }
  }, []);

  const ensureWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;

    const worker = new Worker(new URL('../workers/transcribe.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.addEventListener('message', handleWorkerEvent);
    worker.addEventListener('error', (event) => {
      // Worker-level failure (script load error, wasm init crash, …)
      setStatus('error');
      setError(`Transcription worker crashed: ${event.message || 'unknown error'}`);
      for (const pending of pendingTranscribesRef.current.values()) {
        pending.reject(new Error('Transcription worker crashed.'));
      }
      pendingTranscribesRef.current.clear();
      settleLoads(modelRef.current, new Error('Transcription worker crashed.'));
    });

    workerRef.current = worker;
    return worker;
  }, [handleWorkerEvent]);

  /** Load `model` (defaults to the current one). Resolves when ready. */
  const load = useCallback(
    (target?: WhisperModelName) => {
      const requested = target ?? modelRef.current;
      const worker = ensureWorker();

      setStatus('loading');
      setProgress(0);
      setError(null);

      const promise = new Promise<void>((resolve, reject) => {
        pendingLoadsRef.current.push({ model: requested, resolve, reject });
        worker.postMessage({ type: 'load', model: requested, dtype: readDtypePref(requested) });
      });
      // Fire-and-forget callers must not surface unhandled rejections.
      promise.catch(() => undefined);
      loadPromiseRef.current = promise;
      return promise;
    },
    [ensureWorker]
  );

  /** Switch the resident model and start loading it. */
  const switchModel = useCallback(
    (target: WhisperModelName) => {
      if (target === modelRef.current && statusRef.current === 'ready') return;
      setModel(target);
      modelRef.current = target;
      writeModelPref(target);
      void load(target);
    },
    [load]
  );

  /**
   * Transcribe one 16 kHz mono PCM segment. Auto-warms the model if no
   * load was ever requested; rejects on load failure or worker errors.
   */
  const transcribe = useCallback(
    async (audio: Float32Array): Promise<string> => {
      if (!loadPromiseRef.current) void load();

      if (loadPromiseRef.current) {
        await loadPromiseRef.current;
      }
      if (statusRef.current !== 'ready' || !workerRef.current) {
        throw new Error('Local Whisper model is not ready.');
      }

      const worker = workerRef.current;
      const id = (nextIdRef.current += 1);

      const promise = new Promise<string>((resolve, reject) => {
        pendingTranscribesRef.current.set(id, { resolve, reject });
        // Transfer the PCM buffer — the main thread never needs it again.
        worker.postMessage({ type: 'transcribe', id, audio }, [audio.buffer]);
      });
      promise.catch(() => undefined);
      return promise;
    },
    [load]
  );

  // Terminate the worker on unmount; reject anything still pending.
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      for (const pending of pendingTranscribesRef.current.values()) {
        pending.reject(new Error('Transcription worker was stopped.'));
      }
      pendingTranscribesRef.current.clear();
      for (const pending of pendingLoadsRef.current) {
        pending.reject(new Error('Transcription worker was stopped.'));
      }
      pendingLoadsRef.current = [];
    };
  }, []);

  const isSupported =
    typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined' && typeof fetch === 'function';

  return {
    isSupported,
    model,
    status,
    progress,
    dtype,
    error,
    lastInferenceMs,
    load,
    switchModel,
    transcribe,
  };
}
