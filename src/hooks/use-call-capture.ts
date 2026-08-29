import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ACCUMULATING_FIELD_IDS,
  extractFields,
  isAsrArtifact,
  type AutoFillSource,
  type ExtractedField,
  type Speaker,
  type TranscriptEntry,
} from '@/lib/field-extraction';
import type { ParaphraseInput } from '@/lib/llm-parser';
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
  'purchaseInfo',
  'issueDescription',
  'issueType',
  'resolutionSummary',
] as const;

/** Structural slice of useLlmParser() the capture hook needs */
export interface CallCaptureLlmParser {
  parse: (
    entries: TranscriptEntry[],
    missingFieldIds: readonly string[],
    /** Previously extracted values the model must carry forward / refine */
    prior?: { resolutionSummary?: string; issueDescription?: string }
  ) => Promise<ExtractedField[]>;
  /** Condense the verbatim clause lists into concise note style */
  paraphrase: (input: ParaphraseInput) => Promise<ExtractedField[]>;
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
 *  more often than this would just stack the worker. Short enough that new
 *  information shows up on the form while the call is still going. */
const LLM_MIN_INTERVAL_MS = 20_000;

/** Transcript must be at least this long before a parse is worth the
 *  inference cost. */
const LLM_MIN_TRANSCRIPT_CHARS = 120;

/** After the regex engine collects NEW verbatim clauses, wait this long
 *  before asking the LLM to paraphrase them — more speech (and more
 *  clauses) usually arrives within seconds, and one polished rewrite of
 *  the whole list beats several of its prefixes. */
const PARAPHRASE_DEBOUNCE_MS = 6_000;

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
 * is relegated to provisional pre-fills: it runs right after each segment
 * and may fill any field the LLM has not yet claimed — an LLM value always
 * supersedes it on the next pass, so the model's reading of the situation
 * still wins. LLM output is validated against the canonical option lists
 * before it reaches the form.
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
  onAutoFill: (fieldId: string, value: string, source: AutoFillSource) => void,
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
  /** Fields already given a provisional REGEX fill, with the value pushed.
   *  Accumulating fields (issue clauses, TBS steps, the issue type derived
   *  from them) KEEP GROWING as the call goes on — their pushed value is
   *  tracked so a later, longer extraction can replace the frozen first
   *  one. Scalar fields (name, phone, serial…) stay first-wins. */
  const regexFilledRef = useRef(new Map<string, string>());
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

  /** Verbatim clause lists the regex engine collected since the LAST
   *  paraphrase pass — waiting to be polished. */
  const paraphrasePendingRef = useRef<Partial<ParaphraseInput>>({});
  /** Verbatim clause lists the last COMPLETED paraphrase pass consumed */
  const paraphrasedFromRef = useRef<Partial<ParaphraseInput>>({});
  /** Timer for the debounced paraphrase pass */
  const paraphraseTimerRef = useRef<number | null>(null);
  /** True while a paraphrase generation is in flight */
  const paraphraseRunningRef = useRef(false);
  /** Latest paraphrase pass — lets the arm timer reach it without a cycle */
  const runParaphraseRef = useRef<() => Promise<void>>(() => undefined);

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
   * Arm the debounced paraphrase pass (resetting any armed timer). Uses the
   * runParaphraseRef indirection so runParaphrase can re-arm itself for
   * verbatim that arrived mid-flight without a declaration cycle.
   */
  const armParaphrase = useCallback(() => {
    if (paraphraseTimerRef.current !== null) {
      window.clearTimeout(paraphraseTimerRef.current);
    }
    paraphraseTimerRef.current = window.setTimeout(() => {
      paraphraseTimerRef.current = null;
      void runParaphraseRef.current();
    }, PARAPHRASE_DEBOUNCE_MS);
  }, []);

  /**
   * Paraphrase pass: hand the VERBATIM clause lists the regex engine
   * collected to the LLM and push the polished, concise rewrite onto the
   * form ('paraphrase' source — it replaces the machine-written text it
   * derives from, never human-typed or main-parse values).
   *
   * Runs only for fields the main parse has NOT claimed (llmConfirmed) —
   * the extraction parse reads the whole conversation and its condensed
   * output supersedes this stage. When the model is unavailable or its
   * reply is unusable, the growing verbatim fill is pushed directly
   * ('regex-grow') so the box still keeps up with the call.
   */
  const runParaphrase = useCallback(async (): Promise<void> => {
    const parser = llmParserRef.current;
    if (!parser || paraphraseRunningRef.current || llmRunningRef.current) return;

    const input: ParaphraseInput = {};
    for (const key of ['issueDescription', 'resolutionSummary'] as const) {
      const verbatim = paraphrasePendingRef.current[key];
      if (verbatim && !llmConfirmedRef.current.has(key)) input[key] = verbatim;
    }
    if (!input.issueDescription && !input.resolutionSummary) {
      paraphrasePendingRef.current = {};
      return;
    }

    paraphraseRunningRef.current = true;
    try {
      const fields = await parser.paraphrase(input);
      const applied: ExtractedField[] = [];
      for (const field of fields) {
        // The main parse claimed the field while we were generating — its
        // full-context reading wins over this polish
        if (llmConfirmedRef.current.has(field.fieldId)) continue;
        paraphrasedFromRef.current[
          field.fieldId as 'issueDescription' | 'resolutionSummary'
        ] = input[field.fieldId as 'issueDescription' | 'resolutionSummary'];
        // Rides the same suggestion/prior-carry-forward machinery as main
        // parse results (buildPriorValues feeds it into the next parse)
        llmSuggestionsRef.current.set(field.fieldId, field);
        onAutoFillRef.current(field.fieldId, field.value, 'paraphrase');
        applied.push(field);
      }

      // Verbatim the model could not polish → keep the growing raw fill
      for (const key of ['issueDescription', 'resolutionSummary'] as const) {
        const verbatim = input[key];
        if (verbatim && !applied.some((f) => f.fieldId === key)) {
          onAutoFillRef.current(key, verbatim, 'regex-grow');
        }
      }

      if (applied.length > 0) {
        setSuggestions((prev) => {
          const map = new Map(prev.map((f) => [f.fieldId, f]));
          for (const f of applied) map.set(f.fieldId, f);
          return [...map.values()];
        });
      }
    } catch {
      // Paraphrase failed — the verbatim fill stands
      for (const key of ['issueDescription', 'resolutionSummary'] as const) {
        const verbatim = input[key];
        if (verbatim && !llmConfirmedRef.current.has(key)) {
          onAutoFillRef.current(key, verbatim, 'regex-grow');
        }
      }
    } finally {
      paraphraseRunningRef.current = false;
      // Consume what this pass handled; newer verbatim that arrived
      // mid-flight stays pending and re-arms the timer below
      for (const key of ['issueDescription', 'resolutionSummary'] as const) {
        if (paraphrasePendingRef.current[key] === input[key]) {
          delete paraphrasePendingRef.current[key];
        }
      }
      const stillPending =
        paraphrasePendingRef.current.issueDescription ??
        paraphrasePendingRef.current.resolutionSummary;
      if (stillPending) armParaphrase();
    }
  }, [armParaphrase]);

  // Keep the timer's indirection pointing at the latest pass
  useEffect(() => {
    runParaphraseRef.current = runParaphrase;
  }, [runParaphrase]);

  /**
   * Provisional pattern-match fill, run after every transcribed segment.
   *
   * The LLM is still the PRIMARY parser — but a partial LLM success must
   * not starve every other field. The gate is per-field, not global:
   *
   *  - fields the LLM has authoritatively filled are NEVER touched;
   *  - every field the LLM has NOT claimed may still get a provisional
   *    regex fill. When the model is resident and reading well, its next
   *    pass replaces those values wholesale (mergeAutoFill: an LLM value
   *    supersedes a regex one); when the model is unavailable, still
   *    downloading, or simply fails on a garbled transcript (it read the
   *    phone number but nothing else), the provisional values are all the
   *    form gets — and a provisional value beats an empty one.
   *
   * Accumulating fields (issue clauses, TBS steps, the issue type derived
   * from them) KEEP GROWING as the call goes on:
   *
   *  - with the model resident, the new verbatim clauses go to the
   *    paraphrase stage and the polished rewrite replaces the previous
   *    one — the box never flashes raw vernacular;
   *  - without the model, the longer verbatim fill replaces the previous
   *    regex fill directly ('regex-grow').
   *
   * Scalar fields (name, phone, serial…) stay first-wins.
   */
  const runRegexExtraction = useCallback(() => {
    const fields = extractFields(entriesRef.current).filter(
      (f) => !llmConfirmedRef.current.has(f.fieldId)
    );

    // Suggestions: regex finds under the LLM's authoritative reading
    setSuggestions(() => {
      const map = new Map<string, ExtractedField>();
      for (const f of fields) map.set(f.fieldId, f);
      for (const f of llmSuggestionsRef.current.values()) map.set(f.fieldId, f);
      return [...map.values()];
    });

    // The paraphrase stage needs a resident model; without one the growing
    // verbatim fill is pushed straight to the form
    const canParaphrase = llmParserRef.current?.isReady === true;

    for (const field of fields) {
      const pushed = regexFilledRef.current.get(field.fieldId);
      if (pushed === undefined) {
        // First fill for this field — push and remember it
        regexFilledRef.current.set(field.fieldId, field.value);
        onAutoFillRef.current(field.fieldId, field.value, 'regex');
      } else if (
        ACCUMULATING_FIELD_IDS.has(field.fieldId) &&
        field.value !== pushed
      ) {
        // The accumulating extraction GREW as the call went on
        regexFilledRef.current.set(field.fieldId, field.value);
        const paraphrasable =
          field.fieldId === 'issueDescription' || field.fieldId === 'resolutionSummary';
        if (paraphrasable && canParaphrase) {
          // Defer to the polish: the box keeps the last paraphrased note
          // until the new clauses have been rewritten — no vernacular
          // flash in the form
          paraphrasePendingRef.current[
            field.fieldId as 'issueDescription' | 'resolutionSummary'
          ] = field.value;
          armParaphrase();
        } else {
          onAutoFillRef.current(field.fieldId, field.value, 'regex-grow');
        }
      }
    }
  }, [armParaphrase]);

  /**
 * APPEND GUARD for the two cumulative fields (issue clauses, resolution
 * steps): the LLM's next parse is only a partial re-read of what the box
 * already holds (its window slid, or it simply dropped clauses). Merge so
 * nothing on the box is ever LOST:
 *
 *  - clauses already in `current` keep their position;
 *  - NEW clauses from `next` append after them;
 *  - clauses present in both are deduped (case-insensitive containment,
 *    same rule as the regex accumulator);
 *  - when next's value is just a re-wording of the whole current value
 *    (no new clauses), next WINS — the model refined the wording.
 *
 * Scalar fields (name, phone, serial…) return `next` unchanged: a later
 * correction should REPLACE, not append.
 */
const CUMULATIVE_FIELD_IDS = new Set(['issueDescription', 'resolutionSummary']);

function mergeAccumulated(fieldId: string, current: string | undefined, next: string): string {
  const cur = (current ?? '').trim();
  if (!cur) return next;
  if (!CUMULATIVE_FIELD_IDS.has(fieldId)) return next;
  if (next.trim() === cur) return next;

  const splitClauses = (v: string) =>
    v
      .split(/\s*(?:;|->)\s*/)
      .map((c) => c.trim())
      .filter(Boolean);

  const curClauses = splitClauses(cur);
  const nextClauses = splitClauses(next);
  if (curClauses.length === 0 || nextClauses.length === 0) return next;

  // Subsumed: next's clauses are all already inside current (containment
  // either direction) → current already holds everything; keep current but
  // prefer next's wording when it is the LONGER reading
  const lower = (s: string) => s.toLowerCase();
  const nextHasNew = nextClauses.some(
    (n) => !curClauses.some((c) => lower(c).includes(lower(n)) || lower(n).includes(lower(c)))
  );
  if (!nextHasNew) return next.length > cur.length ? next : cur;

  // Append-guard: keep every current clause, then add only the NEW ones
  const merged = [...curClauses];
  for (const n of nextClauses) {
    const dup = merged.some(
      (c) => lower(c).includes(lower(n)) || lower(n).includes(lower(c))
    );
    if (!dup) merged.push(n);
  }
  const joiner = fieldId === 'resolutionSummary' ? ' -> ' : '; ';
  return merged.join(joiner);
}

/** Merge authoritative LLM results into suggestions + push to the form */
const applyLlmFields = useCallback((fields: ExtractedField[]) => {
    if (fields.length === 0) return;
    const applied: ExtractedField[] = [];
    for (const field of fields) {
      llmConfirmedRef.current.add(field.fieldId);
      // APPEND GUARD: never let a partial re-read shrink the cumulative
      // boxes — merge the model's new clauses ONTO what's already there
      const prior = llmSuggestionsRef.current.get(field.fieldId);
      const merged = prior
        ? mergeAccumulated(field.fieldId, prior.value, field.value)
        : field.value;
      const finalField = merged === field.value ? field : { ...field, value: merged };
      llmSuggestionsRef.current.set(field.fieldId, finalField);
      applied.push(finalField);
      // Authoritative: replaces any provisional regex value underneath it
      onAutoFillRef.current(field.fieldId, finalField.value, 'llm');
    }
    setSuggestions((prev) => {
      const map = new Map(prev.map((f) => [f.fieldId, f]));
      for (const f of applied) map.set(f.fieldId, f);
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
   *
   * Previously extracted values that keep evolving ride along in the prompt:
   *
   *  - resolution steps are cumulative — once they slide out of the
   *    transcript window the model could not re-list them on its own, so
   *    carrying them forward is what makes the field KEEP GROWING instead
   *    of freezing or shrinking;
   *  - the issue description is refined in place — the customer keeps
   *    describing the problem and the agent confirms/diagnoses it, so each
   *    parse folds the new details into the description already on the
   *    ticket.
   */
  const buildPriorValues = useCallback((): { resolutionSummary?: string; issueDescription?: string } => {
    const resolutionSummary = llmSuggestionsRef.current.get('resolutionSummary')?.value;
    const issueDescription = llmSuggestionsRef.current.get('issueDescription')?.value;
    return {
      ...(resolutionSummary ? { resolutionSummary } : {}),
      ...(issueDescription ? { issueDescription } : {}),
    };
  }, []);

  const runLlmParse = useCallback(async (): Promise<void> => {
    const parser = llmParserRef.current;
    if (!parser || llmRunningRef.current) return;

    llmRunningRef.current = true;
    lastLlmRunRef.current = Date.now();
    const startLen = entriesRef.current.reduce((n, e) => n + e.text.length, 0);
    try {
      // Ask for every field, not just the "missing" ones — understanding
      // the full context is the point
      const fields = await parser.parse(
        entriesRef.current,
        PARSEABLE_FIELD_IDS,
        buildPriorValues()
      );
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
  }, [applyLlmFields, armIdleParse, buildPriorValues]);

  /**
   * Idle-tick: parse now when the queue has drained, the throttle window
   * has elapsed and there is enough conversation to be worth the inference;
   * otherwise re-arm for exactly when the throttle clears.
   */
  const llmTick = useCallback(() => {
    if (
      llmRunningRef.current ||
      paraphraseRunningRef.current ||
      transcribingRef.current ||
      pendingCountRef.current > 0
    )
      return;
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
        // Whisper emits bracketed pseudo-tags ([BLANK_AUDIO], [INAUDIBLE],
        // …) for non-speech audio — they carry no ticket information and
        // only confuse both parsers, so the turn is never recorded.
        if (isAsrArtifact(text)) return;

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
        // Carry the accumulated resolution steps + current issue
        // description in — same evolving-fields rule as the periodic passes
        // (see runLlmParse)
        // Bounded: the parser's own timeout caps a stuck generation
        const fields = await parser.parse(
          entriesRef.current,
          PARSEABLE_FIELD_IDS,
          buildPriorValues()
        );
        applyLlmFields(fields);

        // Anything the main parse could NOT fill (broken JSON on a garbled
        // call) still deserves its polished form: flush a paraphrase of the
        // verbatim clauses the regex engine collected before the call ends.
        const pending: ParaphraseInput = {};
        for (const key of ['issueDescription', 'resolutionSummary'] as const) {
          const verbatim = paraphrasePendingRef.current[key];
          if (verbatim && !llmConfirmedRef.current.has(key)) pending[key] = verbatim;
        }
        if (pending.issueDescription || pending.resolutionSummary) {
          if (paraphraseTimerRef.current !== null) {
            window.clearTimeout(paraphraseTimerRef.current);
            paraphraseTimerRef.current = null;
          }
          await runParaphraseRef.current();
        }
      }
    }
  }, [applyLlmFields, buildPriorValues]);

  const clear = useCallback(() => {
    entriesRef.current = [];
    regexFilledRef.current = new Map();
    llmConfirmedRef.current = new Set();
    llmSuggestionsRef.current = new Map();
    lastLlmRunRef.current = 0;
    paraphrasePendingRef.current = {};
    paraphrasedFromRef.current = {};
    paraphraseRunningRef.current = false;
    if (paraphraseTimerRef.current !== null) {
      window.clearTimeout(paraphraseTimerRef.current);
      paraphraseTimerRef.current = null;
    }
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
      if (paraphraseTimerRef.current !== null) window.clearTimeout(paraphraseTimerRef.current);
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
