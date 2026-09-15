import { useCallback, useEffect, useRef, useState } from 'react';
import type { TranscriptEntry } from '@/lib/field-extraction';
import { buildPromptWindow } from '@/lib/llm-parser';

/**
 * Live-call TLDR — an English + Chinese 1–3-sentence summary of the
 * ENTIRE conversation, shown under the transcript on French (.fr-model)
 * calls so the agent can follow a call they may not fully understand.
 *
 * Regeneration schedule, counted from capture start: 10s, 30s, then every
 * 30s (60s, 90s, 120s…) — early refreshes track the opening complaint,
 * later ones the resolution path. One request is in flight at most; a
 * milestone with too little conversation (or a failed round-trip) is
 * skipped, never queued. The last TLDR persists after hang-up (it is the
 * whole-call summary) and resets on the next capture / transcript clear.
 *
 * Uses the cloud generate path (DeepSeek) — the same handle the SOP panel
 * and the cat use — because the Chinese half needs a bilingual model; the
 * local Qwen 0.5B cannot be trusted to write Chinese. No key → no TLDR.
 */

/** Async LLM generation (DeepSeek) — same shape SopPanel / the cat use. */
export type TldrGenerate = (
  system: string,
  user: string,
  maxNewTokens?: number
) => Promise<{ text: string; ms: number; timedOut: boolean }>;

export interface CallTldrState {
  /** English 1–3-sentence summary ('' until the first refresh lands) */
  en: string;
  /** Simplified-Chinese 1–3-sentence summary */
  zh: string;
  /** True while a refresh round-trip is in flight */
  isGenerating: boolean;
  /** Seconds into the call when the last refresh landed (null = never) */
  updatedAtSec: number | null;
}

interface UseCallTldrArgs {
  /** True while a call is being captured AND it is an FR call. Rising
   *  edge = new call → reset + start the milestone timers. */
  isCapturing: boolean;
  /** Live speaker-tagged transcript (already noise-filtered upstream) */
  transcript: TranscriptEntry[];
  /** Cloud generation handle; omit/undefined → TLDR stays empty. */
  cloudGenerate?: TldrGenerate;
}

/** Milestone schedule: 10s, 30s, then every 30s. */
const FIRST_MILESTONE_SEC = 10;
const SECOND_MILESTONE_SEC = 30;
const STEP_SEC = 30;
/** Min conversation worth an API call (fewer → skip the milestone) */
const MIN_ENTRIES = 2;
const MIN_CHARS = 60;
/** Enough for 3 sentences × 2 languages with room to spare. */
const TLDR_MAX_TOKENS = 300;

/** Next milestone strictly after `sec` seconds into the call. */
function nextMilestoneSec(sec: number): number {
  if (sec < FIRST_MILESTONE_SEC) return FIRST_MILESTONE_SEC;
  if (sec < SECOND_MILESTONE_SEC) return SECOND_MILESTONE_SEC;
  return sec - (sec % STEP_SEC) + STEP_SEC;
}

const TLDR_SYSTEM = [
  'You write live TLDR summaries of customer-support calls for Ecovacs NA agents (DEEBOT vacuums, GOAT lawn mowers, WINBOT window cleaners, ULTRAMARINE pool robots).',
  'The transcript is machine-garbled ASR text and may be in FRENCH, English, or both. AGENT/CUSTOMER lines are speaker-attributed; RECORDING lines contain both parties mixed — attribute by content.',
  'Reply with EXACTLY two lines and nothing else:',
  "EN: <1-3 sentences in plain English summarizing the ENTIRE conversation so far — the customer's issue, key facts captured (robot model, identity details, purchase/warranty status) and the current status / next steps. No bullets, no quotes.>",
  'ZH: <用1-3句简体中文总结整通对话：客户的问题、已获取的关键信息（机型、身份、购买/保修情况）以及当前进展与下一步。不用列表。>',
].join('\n');

const EMPTY_TLDR: CallTldrState = {
  en: '',
  zh: '',
  isGenerating: false,
  updatedAtSec: null,
};

export function useCallTldr({ isCapturing, transcript, cloudGenerate }: UseCallTldrArgs) {
  const [tldr, setTldr] = useState<CallTldrState>(EMPTY_TLDR);

  // Latest values behind stable callbacks (the timer chain must never be
  // torn down/rebuilt by a transcript update).
  const transcriptRef = useRef(transcript);
  const generateRef = useRef(cloudGenerate);
  const inFlightRef = useRef(false);
  const startTsRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);
  useEffect(() => {
    generateRef.current = cloudGenerate;
  }, [cloudGenerate]);

  const generate = useCallback(async () => {
    const gen = generateRef.current;
    if (!gen || inFlightRef.current) return;

    // Too little conversation yet — skip this milestone silently.
    const entries = transcriptRef.current;
    const chars = entries.reduce((n, e) => n + e.text.length, 0);
    if (entries.length < MIN_ENTRIES || chars < MIN_CHARS) return;

    inFlightRef.current = true;
    setTldr((prev) => ({ ...prev, isGenerating: true }));
    try {
      const window = buildPromptWindow(entries);
      const { text, timedOut } = await gen(TLDR_SYSTEM, window.text, TLDR_MAX_TOKENS);
      // Partial tolerance: keep the previous half when the reply only
      // carries one of the two lines — a malformed refresh never blanks
      // the panel mid-call.
      const en = timedOut ? '' : (text.match(/^EN:\s*(.+)$/m)?.[1]?.trim() ?? '');
      const zh = timedOut ? '' : (text.match(/^ZH:\s*(.+)$/m)?.[1]?.trim() ?? '');
      if (en || zh) {
        const updatedAtSec = Math.max(0, Math.round((Date.now() - startTsRef.current) / 1000));
        setTldr((prev) => ({
          en: en || prev.en,
          zh: zh || prev.zh,
          isGenerating: false,
          updatedAtSec,
        }));
        return;
      }
    } catch {
      // Network/API failure — try again at the next milestone.
    } finally {
      inFlightRef.current = false;
      setTldr((prev) => (prev.isGenerating ? { ...prev, isGenerating: false } : prev));
    }
  }, []);

  // Stable indirection so the timer chain always calls the latest closure.
  const generateFnRef = useRef(generate);
  useEffect(() => {
    generateFnRef.current = generate;
  }, [generate]);

  // -----------------------------------------------------------------
  //  Milestone timer chain — armed on capture start, torn down on stop.
  //  The chain self-heals around slow round-trips: the next timeout is
  //  computed from the CURRENT elapsed time, so drift re-aligns to the
  //  10/30/60/90… grid instead of compounding.
  // -----------------------------------------------------------------
  useEffect(() => {
    if (!isCapturing) return;
    startTsRef.current = Date.now();
    setTldr(EMPTY_TLDR);

    const tick = () => {
      void generateFnRef.current().finally(() => {
        const elapsedSec = (Date.now() - startTsRef.current) / 1000;
        const waitSec = nextMilestoneSec(elapsedSec) - elapsedSec;
        timerRef.current = window.setTimeout(tick, Math.max(1, waitSec * 1000));
      });
    };
    timerRef.current = window.setTimeout(tick, FIRST_MILESTONE_SEC * 1000);
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isCapturing]);

  // Transcript cleared (Reset) → drop the stale summary even mid-call.
  useEffect(() => {
    if (transcript.length === 0) setTldr(EMPTY_TLDR);
  }, [transcript.length]);

  return tldr;
}
