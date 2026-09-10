import { useCallback, useEffect, useRef, useState } from 'react';
import type { TranscriptEntry } from '@/lib/field-extraction';

/** Shape of the ticket form data as stored by TicketNotesPage — a flat map
 *  of node-id → string (or string[] for the dynamic troubleshooting list). */
export type CatFormData = Record<string, string | string[]>;

/**
 * Cat Assistant — the workspace mascot (a Clippy-style sprite that lives on
 * the canvas and pops up tips / advice during calls).
 *
 * This hook is the "brain": it owns the thought queue and decides when to
 * push a message. The visual sprite + bubble live in CatAssistant.tsx and
 * just render `currentThought`.
 *
 * Thought sources:
 *  - ambient:   random cat-themed idle musings, shown on a slow timer when
 *               nothing else is happening.
 *  - tip:       form-state nudges (empty required fields, call ended with
 *               missing info). Push-led, not polled.
 *  - advice:    LLM-generated call advice derived from the live transcript.
 *               Rate-limited so the agent isn't spammed.
 *  - greeting:  one-liners when a call starts / ends.
 *
 * Design goals:
 *  - Never blocks the agent: the bubble auto-dismisses and never steals focus.
 *  - Cheap when idle: no timers fire except the single ambient scheduler.
 *  - One LLM call at a time; if a new transcript window arrives while a
 *    previous advice request is in flight, the new one is skipped (the agent
 *    already got advice on a near-identical window).
 */

export type CatThoughtKind = 'ambient' | 'tip' | 'advice' | 'greeting';

export interface CatThought {
  id: number;
  kind: CatThoughtKind;
  text: string;
  /** When this thought should auto-dismiss (Date.now ms). 0 = never (pinned). */
  expiresAt: number;
}

export interface CatAssistantProps {
  /** True while a CCP call is being captured (live transcription running). */
  isCapturing: boolean;
  /** Full speaker-tagged transcript of the current call. */
  transcript: TranscriptEntry[];
  /** Current form data — used for "missing field" tip nudges. */
  formData: CatFormData;
  /** Optional async LLM generation (DeepSeek). Omit → no advice thoughts. */
  cloudGenerate?: (
    system: string,
    user: string,
    maxTokens?: number
  ) => Promise<{ text: string; ms: number; timedOut: boolean }>;
  /** Whether cloudGenerate is available (has API key). */
  cloudEnabled?: boolean;
}

/** Field ids the cat should nudge about when empty. Keys match NODE_IDS. */
const NUDGE_FIELDS: Array<{ id: string; label: string }> = [
  { id: 'customerName', label: 'Customer name' },
  { id: 'contactNumber', label: 'Contact number' },
  { id: 'shippingAddress', label: 'Shipping address' },
];

/** Cat-themed idle thoughts. Keep them short — the bubble is small. */
const AMBIENT_THOUGHTS = [
  'Purring...',
  'I heard a laser pointer. Did you?',
  'Tip: confirm the model before troubleshooting.',
  'Nap time is 2 minutes. I\'ll be back.',
  'Did the customer try turning it off and on?',
  'A clean sensor is a happy sensor. 🧹',
  'Write down the serial while it\'s fresh.',
  'I\'m just a cat, but I believe in you.',
  'Nine lives, zero warranty claims... yet.',
];

/** How long each thought stays on screen before auto-dismiss (ms). */
const THOUGHT_TTL_MS = 8_000;

/** Min gap between two ambient thoughts (ms). */
const AMBIENT_MIN_GAP_MS = 45_000;
/** Max gap between two ambient thoughts (ms). */
const AMBIENT_MAX_GAP_MS = 90_000;

/** Min gap between two LLM advice requests (ms). */
const ADVICE_MIN_INTERVAL_MS = 30_000;
/** Transcript must have grown by at least this many chars since the last
 *  advice request before we ask the LLM again. */
const ADVICE_MIN_NEW_CHARS = 180;
/** Max tokens for an advice reply — keep it snappy. */
const ADVICE_MAX_TOKENS = 120;

/** System prompt for advice generation. Short on purpose: we want one
 *  concrete, actionable line, not an essay. */
const ADVICE_SYSTEM =
  'You are a sassy-but-helpful support-cat mascot for Ecovacs NA agents. ' +
  'Given a live call transcript snippet, reply with ONE short sentence ' +
  '(≤20 words) of advice for the agent: a question to ask, a step to try, ' +
  'or a field to capture. No preamble, no bullet, no emoji.';

let thoughtIdSeq = 0;

/** Pick a random integer in [min, max). */
function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min));
}

/** Decide whether a form field is "empty" (empty string or whitespace). */
function isEmptyField(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function useCatAssistant({
  isCapturing,
  transcript,
  formData,
  cloudGenerate,
  cloudEnabled,
}: CatAssistantProps) {
  const [thoughts, setThoughts] = useState<CatThought[]>([]);
  /** True while an LLM advice request is in flight (drives the spinner). */
  const [isThinking, setIsThinking] = useState(false);
  /** The most recently pushed thought (rendered as the bubble). */
  const currentThought = thoughts[thoughts.length - 1] ?? null;

  const adviceInFlightRef = useRef(false);
  const lastAdviceAtRef = useRef(0);
  const lastAdviceCharsRef = useRef(0);
  const wasCapturingRef = useRef(isCapturing);
  const ambientTimerRef = useRef<number | null>(null);
  const transcriptLenRef = useRef(0);

  const pushThought = useCallback((kind: CatThoughtKind, text: string, ttl = THOUGHT_TTL_MS) => {
    const thought: CatThought = {
      id: ++thoughtIdSeq,
      kind,
      text,
      expiresAt: ttl > 0 ? Date.now() + ttl : 0,
    };
    setThoughts((prev) => [...prev.slice(-4), thought]);
  }, []);

  /** Dismiss the current thought (agent clicked the bubble / X). */
  const dismiss = useCallback(() => {
    setThoughts((prev) => prev.slice(0, -1));
  }, []);

  // -----------------------------------------------------------------
  //  Auto-dismiss: sweep expired thoughts once a second.
  // -----------------------------------------------------------------
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      setThoughts((prev) => {
        const alive = prev.filter((t) => t.expiresAt === 0 || t.expiresAt > now);
        return alive.length === prev.length ? prev : alive;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // -----------------------------------------------------------------
  //  Call lifecycle greetings.
  // -----------------------------------------------------------------
  useEffect(() => {
    if (isCapturing && !wasCapturingRef.current) {
      pushThought('greeting', 'Live! I\'ll keep an ear out. 🎧', 6000);
    } else if (!isCapturing && wasCapturingRef.current) {
      pushThought('greeting', 'Call over. Let\'s wrap this note up.', 7000);
      // Nudge about any still-empty required fields after the call ends.
      const missing = NUDGE_FIELDS.filter((f) => isEmptyField(formData[f.id]));
      if (missing.length > 0) {
        const names = missing.map((f) => f.label).join(', ');
        pushThought('tip', `Still missing: ${names}.`, 10_000);
      }
    }
    wasCapturingRef.current = isCapturing;
  }, [isCapturing, formData, pushThought]);

  // -----------------------------------------------------------------
  //  LLM advice during live transcription.
  //  Debounced on transcript length growth; one in-flight request max.
  // -----------------------------------------------------------------
  useEffect(() => {
    if (!isCapturing || !cloudGenerate || !cloudEnabled) return;

    const totalChars = transcript.reduce((n, e) => n + e.text.length, 0);
    const newChars = totalChars - lastAdviceCharsRef.current;
    const enoughNew = newChars >= ADVICE_MIN_NEW_CHARS;
    const cooledDown = Date.now() - lastAdviceAtRef.current >= ADVICE_MIN_INTERVAL_MS;

    if (!enoughNew || !cooledDown || adviceInFlightRef.current) return;

    lastAdviceCharsRef.current = totalChars;
    adviceInFlightRef.current = true;
    setIsThinking(true);

    // Take the last ~600 chars of transcript for context (most recent speech).
    const window = transcript.slice(-8);
    const user = window
      .map((e) => `${e.speaker === 'agent' ? 'Agent' : 'Customer'}: ${e.text}`)
      .join('\n');

    void cloudGenerate(ADVICE_SYSTEM, user, ADVICE_MAX_TOKENS).then(({ text, timedOut }) => {
      adviceInFlightRef.current = false;
      setIsThinking(false);
      lastAdviceAtRef.current = Date.now();
      const advice = text.trim();
      if (!timedOut && advice.length > 0 && advice.length < 220) {
        pushThought('advice', advice, 9000);
      }
    });
  }, [transcript, isCapturing, cloudGenerate, cloudEnabled, pushThought]);

  // -----------------------------------------------------------------
  //  Ambient idle thoughts — slow random timer, only when no call.
  // -----------------------------------------------------------------
  const scheduleAmbient = useCallback(() => {
    if (ambientTimerRef.current !== null) return;
    const delay = randInt(AMBIENT_MIN_GAP_MS, AMBIENT_MAX_GAP_MS);
    ambientTimerRef.current = window.setTimeout(() => {
      ambientTimerRef.current = null;
      pushThought('ambient', AMBIENT_THOUGHTS[randInt(0, AMBIENT_THOUGHTS.length)]);
      scheduleAmbient();
    }, delay);
  }, [pushThought]);

  useEffect(() => {
    if (isCapturing) {
      // Pause ambient thoughts during a call — advice takes over.
      if (ambientTimerRef.current !== null) {
        window.clearTimeout(ambientTimerRef.current);
        ambientTimerRef.current = null;
      }
      return;
    }
    scheduleAmbient();
    return () => {
      if (ambientTimerRef.current !== null) {
        window.clearTimeout(ambientTimerRef.current);
        ambientTimerRef.current = null;
      }
    };
  }, [isCapturing, scheduleAmbient]);

  // Reset the "chars since last advice" baseline on transcript clear.
  useEffect(() => {
    if (transcript.length === 0) {
      transcriptLenRef.current = 0;
      lastAdviceCharsRef.current = 0;
    }
  }, [transcript.length]);

  return {
    currentThought,
    dismiss,
    /** Push a custom tip thought (e.g. from external events). */
    pushTip: (text: string, ttl?: number) => pushThought('tip', text, ttl),
    /** True while an LLM advice request is in flight (for the "thinking" state). */
    isThinking,
  };
}
