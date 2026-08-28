import { useState, useRef, useEffect, useCallback } from 'react';
import { extractFields, type ExtractedField, type Speaker, type TranscriptEntry } from '@/lib/field-extraction';
import type { CallTranscriber } from './use-local-transcriber';

// Re-exported for components that consume capture state (VoiceCaptionPanel).
export type { Speaker, TranscriptEntry, ExtractedField };

/** Field ids the parsing pipeline can fill (regex + LLM) */
const PARSEABLE_FIELD_IDS = [
  'customerName',
  'contactNumber',
  'emailAddress',
  'deebotModel',
  'skuNumber',
  'serialNumber',
  'issueDescription',
  'issueType',
  'resolutionSummary',
] as const;

/**
 * Fields pattern matching may still pre-fill while the LLM model is
 * resident — format-verifiable identifiers, where regex is actually
 * trustworthy. Parsing fields that need CONTEXT understanding (name, model,
 * complaint, resolution) is the LLM's job; regex only covers them as a
 * stopgap while the model is unavailable.
 */
const REGEX_RELIABLE_FIELD_IDS = new Set([
  'contactNumber',
  'emailAddress',
  'serialNumber',
  'skuNumber',
]);

/** Structural slice of useLlmParser() the capture hook needs */
export interface CallCaptureLlmParser {
  parse: (
    entries: TranscriptEntry[],
    missingFieldIds: readonly string[]
  ) => Promise<ExtractedField[]>;
  isReady: boolean;
}

/** Seconds of audio per transcription request — small enough for snappy
 *  near-live captions, large enough to amortize per-segment overhead. */
const SEGMENT_MS = 15_000;

/** Pause between recorder segments (stop → start cycle) */
const RESTART_DELAY_MS = 250;

/** After the transcription queue drains, wait this long before asking the
 *  LLM to re-read the conversation (more speech may still arrive). */
const LLM_IDLE_DEBOUNCE_MS = 1_500;

/** Minimum spacing between two LLM parses — WASM generation is slow; asking
 *  more often than this would just stack the worker. */
const LLM_MIN_INTERVAL_MS = 30_000;

/** Transcript must be at least this long before a parse is worth the
 *  inference cost. */
const LLM_MIN_TRANSCRIPT_CHARS = 120;

/** How long finalize() waits for the final segments to transcribe (ms) */
const FINALIZE_DRAIN_MS = 6_000;

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** Pick the first MediaRecorder mime type this browser supports */
function pickMimeType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m));
}

/**
 * Decode a recorded segment into the 16 kHz mono Float32 PCM that local
 * Whisper expects. decodeAudioData on a 16 kHz AudioContext resamples the
 * opus/webm blob; multi-channel audio is downmixed by averaging.
 *
 * Runs on the main thread (AudioContext is unavailable in workers) but is
 * cheap compared to the WASM inference that follows in the worker.
 */
async function blobToPcm16k(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext({ sampleRate: 16_000 });
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const channels = decoded.numberOfChannels;
    if (channels <= 1) {
      // Copy: the decoded buffer is owned by the (soon closed) context.
      return decoded.getChannelData(0).slice();
    }
    const mono = new Float32Array(decoded.length);
    for (let c = 0; c < channels; c += 1) {
      const data = decoded.getChannelData(c);
      for (let i = 0; i < decoded.length; i += 1) {
        mono[i] += data[i] / channels;
      }
    }
    return mono;
  } finally {
    void ctx.close().catch(() => undefined);
  }
}

/** Errors that carry a specific, already-human-readable message */
function readableCaptureError(err: unknown): string {
  const name = (err as DOMException)?.name ?? '';
  if (name === 'NotAllowedError') {
    return 'Screen/tab share was denied or cancelled — click "Capture call" again and pick the CCP tab.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No audio device found for capture — check the default input device.';
  }
  return `Could not start capture (${name || 'unknown error'}).`;
}

/** Blobs captured in one synchronized segment window, per speaker. */
interface SegmentBlobs {
  agent?: Blob;
  customer?: Blob;
}

/**
 * Call-capture transcription with **speaker separation**.
 *
 * Two streams are recorded simultaneously and transcribed as ~15s segments
 * each by a **local Whisper model** (transformers.js WASM in a Web Worker):
 *
 *   tab audio — getDisplayMedia of the CCP tab  → "customer" entries
 *   mic audio — getUserMedia (echo-cancelled)   → "agent" entries
 *
 * Both recorders share one stop/start segment cycle, so every window yields
 * one blob per speaker. Blobs are queued per cycle (customer first, then
 * agent) and transcribed sequentially, producing an interleaved,
 * speaker-tagged transcript.
 *
 * Parsing is LLM-first: whenever the transcription queue goes idle, the
 * on-device LLM (src/lib/llm-parser.ts) re-reads the WHOLE conversation —
 * agent and customer speech together — and its full-context understanding
 * of the situation is what fills the form, overriding anything pattern
 * matching wrote earlier. REGEX extraction (src/lib/field-extraction.ts)
 * is relegated to a provisional stopgap: it pre-fills empty fields right
 * after each segment while the LLM model is unavailable, and once the
 * model is resident it only touches format-verifiable identifiers
 * (phone / email / serial / SKU). Every regex value is provisional until
 * the LLM replaces it; LLM output is validated against the canonical
 * option lists before it reaches the form.
 *
 * Audio never leaves the machine; there is no API key and no per-minute
 * cost.
 *
 * Known limitation: browsers can only echo-cancel audio this page plays
 * itself, so with loudspeakers the mic also hears the customer and their
 * words can surface as a duplicate Agent line. A headset keeps the two
 * speakers cleanly separated (the UI nudges the agent about this).
 */
export function useCallCapture(
  onAutoFill: (fieldId: string, value: string, source: 'regex' | 'llm') => void,
  transcriber: CallTranscriber,
  llmParser?: CallCaptureLlmParser
) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [suggestions, setSuggestions] = useState<ExtractedField[]>([]);
  const [segmentsSent, setSegmentsSent] = useState(0);
  /** Segments recorded but not yet transcribed (worker still catching up) */
  const [queued, setQueued] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Live input level per speaker — proves each channel is actually arriving */
  const [customerLevel, setCustomerLevel] = useState(0);
  const [agentLevel, setAgentLevel] = useState(0);
  /** True when the agent's mic is being recorded alongside the tab audio */
  const [hasMic, setHasMic] = useState(false);

  const displayStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  /** One recorder per speaker — this is what keeps the two voices separable */
  const tabRecorderRef = useRef<MediaRecorder | null>(null);
  const micRecorderRef = useRef<MediaRecorder | null>(null);
  const tabAnalyserRef = useRef<AnalyserNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const shouldCaptureRef = useRef(false);
  const entriesRef = useRef<TranscriptEntry[]>([]);
  /** Fields already given a provisional REGEX fill (one push each) */
  const regexFilledRef = useRef(new Set<string>());
  /** Fields the LLM has authoritatively filled — regex never touches these */
  const llmConfirmedRef = useRef(new Set<string>());
  /** Latest LLM-extracted field per id (drives the suggestion chips) */
  const llmSuggestionsRef = useRef(new Map<string, ExtractedField>());
  const onAutoFillRef = useRef(onAutoFill);
  const transcriberRef = useRef(transcriber);
  const llmParserRef = useRef(llmParser);
  const segmentTimerRef = useRef<number | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  /** Sequential transcription chain — keeps transcript ordering stable */
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  /** Mirrors the `queued` state synchronously (idle detection needs it now) */
  const pendingCountRef = useRef(0);
  /** True while a Whisper inference is in flight */
  const transcribingRef = useRef(false);
  /** Timer for the scheduled idle LLM parse (debounce + throttle retries) */
  const llmIdleTimerRef = useRef<number | null>(null);
  /** Timestamp of the last LLM parse start (throttle) */
  const lastLlmRunRef = useRef(0);
  /** True while an LLM parse is in flight */
  const llmRunningRef = useRef(false);
  /** Latest idle-tick, so the arm timer can reach it without a dep cycle */
  const llmTickRef = useRef<() => void>(() => undefined);

  /** Segment-window sequence number; increments on every stop/start cycle */
  const seqRef = useRef(0);
  /** Next window that has not been handed to the transcription queue yet */
  const nextFlushSeqRef = useRef(1);
  /** Captured-but-unqueued blobs, keyed by window sequence number */
  const pendingRef = useRef(new Map<number, SegmentBlobs>());

  /** Latest stop() — lets stream 'ended' listeners stop capture safely */
  const stopRef = useRef<(() => void) | null>(null);

  const isSupported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getDisplayMedia &&
    typeof MediaRecorder !== 'undefined';

  useEffect(() => {
    onAutoFillRef.current = onAutoFill;
    transcriberRef.current = transcriber;
    llmParserRef.current = llmParser;
  }, [onAutoFill, transcriber, llmParser]);

  // -----------------------------------------------------------------
  //  Field parsing — LLM-first; regex is a provisional stopgap
  // -----------------------------------------------------------------

  /**
   * Provisional pattern-match fill, run after every transcribed segment.
   * Regex has no real context understanding, so it is scoped down to what
   * it can genuinely verify:
   *
   *  - fields the LLM already claimed are never touched;
   *  - while the LLM model is RESIDENT, regex only pre-fills
   *    format-verifiable identifiers (phone / email / serial / SKU);
   *  - while the model is unavailable (disabled, downloading, failed) it
   *    covers every field as a plain fallback — a provisional value beats
   *    an empty one;
   *  - anything it writes stays provisional: the next LLM pass over the
   *    full conversation replaces it.
   */
  const runRegexExtraction = useCallback(() => {
    const llmReady = !!llmParserRef.current?.isReady;
    const fields = extractFields(entriesRef.current).filter((f) => {
      if (llmConfirmedRef.current.has(f.fieldId)) return false;
      if (llmReady && !REGEX_RELIABLE_FIELD_IDS.has(f.fieldId)) return false;
      return true;
    });

    // Suggestions: regex finds under the LLM's authoritative reading
    setSuggestions(() => {
      const map = new Map<string, ExtractedField>();
      for (const f of fields) map.set(f.fieldId, f);
      for (const f of llmSuggestionsRef.current.values()) map.set(f.fieldId, f);
      return [...map.values()];
    });

    for (const field of fields) {
      if (!regexFilledRef.current.has(field.fieldId)) {
        regexFilledRef.current.add(field.fieldId);
        onAutoFillRef.current(field.fieldId, field.value, 'regex');
      }
    }
  }, []);

  /** Merge authoritative LLM results into suggestions + push to the form */
  const applyLlmFields = useCallback((fields: ExtractedField[]) => {
    if (fields.length === 0) return;
    for (const field of fields) {
      llmConfirmedRef.current.add(field.fieldId);
      llmSuggestionsRef.current.set(field.fieldId, field);
      // Authoritative: replaces any provisional regex value underneath it
      onAutoFillRef.current(field.fieldId, field.value, 'llm');
    }
    setSuggestions((prev) => {
      const map = new Map(prev.map((f) => [f.fieldId, f]));
      for (const f of fields) map.set(f.fieldId, f);
      return [...map.values()];
    });
  }, []);

  /** Arm the idle LLM parse after `delayMs` (with a debounce default) */
  const armIdleParse = useCallback((delayMs: number = LLM_IDLE_DEBOUNCE_MS) => {
    if (llmIdleTimerRef.current !== null) {
      window.clearTimeout(llmIdleTimerRef.current);
    }
    llmIdleTimerRef.current = window.setTimeout(() => {
      llmIdleTimerRef.current = null;
      llmTickRef.current();
    }, delayMs);
  }, []);

  /**
   * One LLM pass over the WHOLE conversation — agent and customer speech
   * together, every parseable field. The model's reading of the situation
   * is what fills the form; as the transcript grows, later passes can
   * improve on earlier answers (the page applies override semantics).
   */
  const runLlmParse = useCallback(async (): Promise<void> => {
    const parser = llmParserRef.current;
    if (!parser || llmRunningRef.current) return;

    llmRunningRef.current = true;
    lastLlmRunRef.current = Date.now();
    const startLen = entriesRef.current.reduce((n, e) => n + e.text.length, 0);
    try {
      // Ask for every field, not just the "missing" ones — understanding
      // the full context is the point
      const fields = await parser.parse(entriesRef.current, PARSEABLE_FIELD_IDS);
      applyLlmFields(fields);
    } catch {
      /* parse failed — provisional regex results stand */
    } finally {
      llmRunningRef.current = false;
      // Speech arrived while the model was thinking — schedule one more
      // pass so the reading includes it (the tick re-applies the throttle)
      const endLen = entriesRef.current.reduce((n, e) => n + e.text.length, 0);
      if (endLen > startLen) armIdleParse();
    }
  }, [applyLlmFields, armIdleParse]);

  /**
   * Idle-tick: parse now when the queue has drained, the throttle window
   * has elapsed and there is enough conversation to be worth the inference;
   * otherwise re-arm for exactly when the throttle clears.
   */
  const llmTick = useCallback(() => {
    if (llmRunningRef.current || transcribingRef.current || pendingCountRef.current > 0) return;
    if (!llmParserRef.current) return;

    const textLen = entriesRef.current.reduce((n, e) => n + e.text.length, 0);
    if (entriesRef.current.length === 0 || textLen < LLM_MIN_TRANSCRIPT_CHARS) return;

    const since = Date.now() - lastLlmRunRef.current;
    if (lastLlmRunRef.current > 0 && since < LLM_MIN_INTERVAL_MS) {
      armIdleParse(LLM_MIN_INTERVAL_MS - since);
      return;
    }
    void runLlmParse();
  }, [armIdleParse, runLlmParse]);

  // Keep the arm timer's indirection pointing at the latest tick
  useEffect(() => {
    llmTickRef.current = llmTick;
  }, [llmTick]);

  // -----------------------------------------------------------------
  //  Per-speaker audio level meters (single rAF loop, two analysers)
  // -----------------------------------------------------------------
  const startLevelLoop = useCallback(() => {
    const read = (node: AnalyserNode | null): number => {
      if (!node) return 0;
      const buf = new Uint8Array(node.fftSize);
      node.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i += 1) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      return Math.min(1, Math.sqrt(sum / buf.length) * 4);
    };

    let lastUpdate = 0;
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const now = performance.now();
      if (now - lastUpdate > 100) {
        lastUpdate = now;
        setCustomerLevel(read(tabAnalyserRef.current));
        setAgentLevel(read(micAnalyserRef.current));
      }
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const stopLevelLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    tabAnalyserRef.current = null;
    micAnalyserRef.current = null;
    setCustomerLevel(0);
    setAgentLevel(0);
  }, []);

  // -----------------------------------------------------------------
  //  Segment transcription chain (local Whisper in the worker)
  // -----------------------------------------------------------------
  const postSegment = useCallback(
    async (blob: Blob, speaker: Speaker) => {
      transcribingRef.current = true;
      setIsTranscribing(true);
      try {
        const pcm = await blobToPcm16k(blob);
        const text = (await transcriberRef.current.transcribe(pcm)).trim();
        if (!text) return;

        setError(null);
        entriesRef.current = [...entriesRef.current, { speaker, text }];
        setTranscript(entriesRef.current);

        runRegexExtraction();
      } catch (err) {
        setError(`Local transcription failed: ${(err as Error).message}`);
      } finally {
        transcribingRef.current = false;
        setIsTranscribing(false);
      }
    },
    [runRegexExtraction]
  );

  const enqueueSegment = useCallback(
    (blob: Blob, speaker: Speaker) => {
      pendingCountRef.current += 1;
      setQueued(pendingCountRef.current);
      queueRef.current = queueRef.current
        .then(() => postSegment(blob, speaker))
        .catch(() => undefined)
        .finally(() => {
          pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
          setQueued(pendingCountRef.current);
          setSegmentsSent((n) => n + 1);
          // Queue drained → schedule an LLM pass over the whole conversation
          if (pendingCountRef.current === 0) armIdleParse();
        });
    },
    [postSegment, armIdleParse]
  );

  /**
   * Hand finished windows to the transcription queue, in order. A window is
   * finished once the next one has started producing data — by then neither
   * recorder can add to it anymore.
   */
  const flushComplete = useCallback(
    (throughSeq: number) => {
      while (nextFlushSeqRef.current < throughSeq) {
        const seq = nextFlushSeqRef.current;
        const bucket = pendingRef.current.get(seq);
        pendingRef.current.delete(seq);
        nextFlushSeqRef.current = seq + 1;

        if (!bucket) continue; // empty window (silence on both channels)
        if (bucket.customer) enqueueSegment(bucket.customer, 'customer');
        if (bucket.agent) enqueueSegment(bucket.agent, 'agent');
      }
    },
    [enqueueSegment]
  );

  /** Final flush on stop — drain every window still pending, in order. */
  const flushAllPending = useCallback(() => {
    const seqs = [...pendingRef.current.keys()].sort((a, b) => a - b);
    for (const seq of seqs) {
      const bucket = pendingRef.current.get(seq);
      pendingRef.current.delete(seq);
      nextFlushSeqRef.current = Math.max(nextFlushSeqRef.current, seq + 1);
      if (!bucket) continue;
      if (bucket.customer) enqueueSegment(bucket.customer, 'customer');
      if (bucket.agent) enqueueSegment(bucket.agent, 'agent');
    }
  }, [enqueueSegment]);

  /**
   * A segment blob arrived from one of the recorders. dataavailable fires
   * before the cycle's seq increments, so seqRef.current is still the
   * window the blob belongs to.
   */
  const handleSegmentData = useCallback(
    (speaker: Speaker, event: BlobEvent) => {
      if (!event.data || event.data.size === 0) return;

      const seq = seqRef.current;
      const bucket = pendingRef.current.get(seq) ?? {};
      bucket[speaker] = event.data;
      pendingRef.current.set(seq, bucket);

      // Once every speaker that can produce audio for this window has
      // delivered its blob, the window can be queued right away — no need
      // to wait for the next window to start.
      const agentExpected = !!micRecorderRef.current;
      const windowComplete = !!bucket.customer && (!agentExpected || !!bucket.agent);

      if (windowComplete) {
        flushComplete(seq + 1);
      } else if (!shouldCaptureRef.current) {
        // Capture already stopped — don't wait for a blob that will
        // never come.
        flushAllPending();
      }
    },
    [flushComplete, flushAllPending]
  );

  // -----------------------------------------------------------------
  //  Recorder stop/start cycle — each blob is a complete webm file,
  //  both recorders cycle in lockstep
  // -----------------------------------------------------------------
  const beginSegment = useCallback(() => {
    if (!shouldCaptureRef.current) return;

    seqRef.current += 1;
    try {
      tabRecorderRef.current?.start();
    } catch {
      // already recording
    }
    try {
      micRecorderRef.current?.start();
    } catch {
      // already recording
    }

    if (tabRecorderRef.current || micRecorderRef.current) {
      segmentTimerRef.current = window.setTimeout(() => {
        try {
          tabRecorderRef.current?.stop();
        } catch {
          /* ignore */
        }
        try {
          micRecorderRef.current?.stop();
        } catch {
          /* ignore */
        }
      }, SEGMENT_MS);
    }
  }, []);

  // -----------------------------------------------------------------
  //  Lifecycle
  // -----------------------------------------------------------------
  const start = useCallback(async () => {
    if (!isSupported) return;

    setError(null);
    shouldCaptureRef.current = true;
    seqRef.current = 0;
    nextFlushSeqRef.current = 1;
    pendingRef.current.clear();

    // 1. Capture the CCP tab — video: true is required for tab audio,
    //    and the user must tick "Also share tab audio" in the share dialog
    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
    } catch (err) {
      setError(readableCaptureError(err));
      shouldCaptureRef.current = false;
      return;
    }

    if (display.getAudioTracks().length === 0) {
      display.getTracks().forEach((t) => t.stop());
      setError(
        'No tab audio in that share — click "Capture call" again, choose the CCP tab, and tick "Also share tab audio".'
      );
      shouldCaptureRef.current = false;
      return;
    }
    displayStreamRef.current = display;

    // 2. Also open the agent's mic. It is recorded as a SEPARATE stream so
    //    Whisper can be told who is speaking (mic = agent, tab = customer)
    //    instead of getting an inseparable mix of both voices.
    let mic: MediaStream | null = null;
    try {
      mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = mic;
      setHasMic(true);
    } catch {
      // Headset/mic unavailable — continue with the customer side only
      setHasMic(false);
    }

    // 3. Analysers for the per-speaker level meters (no mixing, no output)
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => undefined);
    }
    audioCtxRef.current = ctx;

    const tabAnalyser = ctx.createAnalyser();
    tabAnalyser.fftSize = 1024;
    ctx.createMediaStreamSource(display).connect(tabAnalyser);
    tabAnalyserRef.current = tabAnalyser;

    if (mic) {
      const micAnalyser = ctx.createAnalyser();
      micAnalyser.fftSize = 1024;
      ctx.createMediaStreamSource(mic).connect(micAnalyser);
      micAnalyserRef.current = micAnalyser;
    }

    // 4. User can also stop sharing from the browser's own banner
    display.getAudioTracks()[0].addEventListener('ended', () => {
      // Fire-and-forget: stop() is idempotent
      void stopRef.current?.();
    });

    // 5. One recorder per speaker, driven by the shared segment cycle
    const mimeType = pickMimeType();
    const recorderOptions = mimeType
      ? { mimeType, audioBitsPerSecond: 32_000 }
      : undefined;

    const tabAudioStream = new MediaStream([display.getAudioTracks()[0]]);
    const tabRecorder = new MediaRecorder(tabAudioStream, recorderOptions);
    tabRecorder.ondataavailable = (event) => handleSegmentData('customer', event);
    // The tab recorder owns the restart cadence; the mic recorder rides along.
    tabRecorder.onstop = () => {
      if (shouldCaptureRef.current) {
        restartTimerRef.current = window.setTimeout(beginSegment, RESTART_DELAY_MS);
      } else {
        flushAllPending();
      }
    };
    tabRecorderRef.current = tabRecorder;

    if (mic) {
      const micAudioStream = new MediaStream(mic.getAudioTracks());
      const micRecorder = new MediaRecorder(micAudioStream, recorderOptions);
      micRecorder.ondataavailable = (event) => handleSegmentData('agent', event);
      micRecorder.onstop = () => {
        if (!shouldCaptureRef.current) flushAllPending();
      };
      micRecorderRef.current = micRecorder;
    }

    setIsCapturing(true);
    startLevelLoop();
    beginSegment();
  }, [isSupported, beginSegment, startLevelLoop, handleSegmentData, flushAllPending]);

  const stop = useCallback(() => {
    shouldCaptureRef.current = false;
    setIsCapturing(false);
    setHasMic(false);

    if (segmentTimerRef.current !== null) {
      window.clearTimeout(segmentTimerRef.current);
      segmentTimerRef.current = null;
    }
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }

    stopLevelLoop();

    // stop() flushes a final partial segment per speaker through
    // ondataavailable; the onstop handlers then drain anything pending.
    try {
      tabRecorderRef.current?.stop();
    } catch {
      /* ignore */
    }
    try {
      micRecorderRef.current?.stop();
    } catch {
      /* ignore */
    }
    tabRecorderRef.current = null;
    micRecorderRef.current = null;

    displayStreamRef.current?.getTracks().forEach((t) => t.stop());
    displayStreamRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;

    audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
  }, [stopLevelLoop]);

  // Keep the 'ended'-listener ref pointing at the latest stop()
  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  const toggle = useCallback(() => {
    if (shouldCaptureRef.current) {
      stop();
    } else {
      void start();
    }
  }, [start, stop]);

  /**
   * Drain-and-parse for hang-up: waits (bounded) for the final partial
   * segments to transcribe, then runs one last authoritative LLM pass over
   * the whole conversation — every field, no throttle — so the reading
   * includes the last seconds of the call. The note generated after this
   * resolves includes everything the call captured.
   */
  const finalize = useCallback(async (): Promise<void> => {
    const deadline = Date.now() + FINALIZE_DRAIN_MS;
    while (
      (pendingCountRef.current > 0 || transcribingRef.current) &&
      Date.now() < deadline
    ) {
      await sleep(150);
    }

    // Cancel any scheduled idle parse — the explicit pass below supersedes it
    if (llmIdleTimerRef.current !== null) {
      window.clearTimeout(llmIdleTimerRef.current);
      llmIdleTimerRef.current = null;
    }

    const parser = llmParserRef.current;
    if (parser?.isReady) {
      const textLen = entriesRef.current.reduce((n, e) => n + e.text.length, 0);
      if (entriesRef.current.length > 0 && textLen >= 40) {
        // Bounded: the parser's own timeout caps a stuck generation
        const fields = await parser.parse(entriesRef.current, PARSEABLE_FIELD_IDS);
        applyLlmFields(fields);
      }
    }
  }, [applyLlmFields]);

  const clear = useCallback(() => {
    entriesRef.current = [];
    regexFilledRef.current = new Set();
    llmConfirmedRef.current = new Set();
    llmSuggestionsRef.current = new Map();
    lastLlmRunRef.current = 0;
    if (llmIdleTimerRef.current !== null) {
      window.clearTimeout(llmIdleTimerRef.current);
      llmIdleTimerRef.current = null;
    }
    setTranscript([]);
    setSuggestions([]);
    setSegmentsSent(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldCaptureRef.current = false;
      if (segmentTimerRef.current !== null) window.clearTimeout(segmentTimerRef.current);
      if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current);
      if (llmIdleTimerRef.current !== null) window.clearTimeout(llmIdleTimerRef.current);
      stopLevelLoop();
      try {
        tabRecorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      try {
        micRecorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      displayStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => undefined);
    };
  }, [stopLevelLoop]);

  return {
    isSupported,
    isCapturing,
    toggle,
    stop,
    clear,
    finalize,
    transcript,
    suggestions,
    segmentsSent,
    queued,
    isTranscribing,
    error,
    customerLevel,
    agentLevel,
    hasMic,
  };
}
