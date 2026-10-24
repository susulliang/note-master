import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExtractedField, TranscriptEntry } from '@/lib/field-extraction';
import type {
  ChatMsg,
  KittyCandidate,
} from '@/lib/kitty-help';
import {
  buildParsePrompt,
  extractJsonLoose,
  extractTldr,
  validateLlmFields,
} from '@/lib/llm-parser';
import type { SupportEvidence } from '@/lib/support-evidence';
import type { CatFormData } from '@/hooks/use-cat-assistant';

/**
 * Kitty Help orchestrator — double-click the cat to run the routine:
 *
 *   Stage 1 "Filling notes"  → persistent conversation starts with the Fill
 *     Notes extraction prompt (fields are applied through the same
 *     authoritative path as an explicit cloud Parse).
 *   Stage 2 "Picking sources" → ≤50 pre-selected knowledge titles go to the
 *     model; it picks up to 12.
 *   Stage 3 "Reading sources" → the picked sources' full content is appended;
 *     the model writes the final bilingual resolution.
 *
 * The conversation lives in a ref and PERSISTS across invocations within a
 * session: a later double-click appends new turns (updated transcript, new
 * picks) instead of starting over, so the unchanged prefix keeps hitting the
 * provider KV cache. The conversation resets when a new call starts.
 */

export interface KittyHelpResult {
  /** Ready-to-read English script for the agent. */
  sayToCustomer: string;
  /** Detailed step-by-step resolution (English). */
  resolutionEn: string;
  /** Short Chinese TLDR of the resolution. */
  resolutionZhTldr: string;
  /** Empathetic lines to use when the customer is frustrated. */
  emotionalSupport: string;
  /** Cited source titles. */
  sources: string[];
  /** Canonical source excerpts returned by the shared Worker retrieval. */
  evidence?: SupportEvidence[];
  /** Identifies one completed custom Kitty run for chat de-duplication. */
  runId?: string;
  /** Wall time of the whole routine (ms). */
  ms: number;
  /** The picks the model made (id + title + reason) for transparency. */
  picks: Array<{ id: string; title: string; reason: string }>;
}

/** What the stage bubble above the cat shows while the routine runs. */
export interface KittyStage {
  label: string;
  detail?: string;
}

/** Stable system prompt — written once per conversation, never mutated.
 *  Task-specific contracts (extraction JSON, note-draft fields) ride in the
 *  USER turn of each task, so the system prefix stays byte-identical across
 *  runs and modes — the best possible setup for provider KV caching. */
function buildKittySystem(): string {
  return [
    'You are Kitty Help, the Ecovacs NA support workspace assistant living inside the cat mascot.',
    'You help a customer-service agent during a live or just-finished support call.',
    'You always answer with ONLY the JSON object the current task asks for — no prose, no markdown fences.',
    '',
    '## Task 1 — FILL NOTES',
    'Given a call transcript (or, when no transcript exists, the agent\'s drafted ticket notes), extract/confirm',
    'ticket fields and a bilingual whole-call TLDR. The exact JSON contract travels inside the Task 1 user message.',
    '',
    '## Task 2 — PICK KNOWLEDGE SOURCES',
    'Given numbered candidate knowledge titles (id [KIND · ORIGIN] title), pick the 1–12 sources most likely',
    'needed to resolve THIS customer\'s issue. Reply ONLY: {"picks":[{"id":"K07","reason":"short why"}]}',
    '',
    '## Task 3 — FINAL RESOLUTION',
    'Given the full content of the picked sources, write the best resolution for the current conversation.',
    'Reply ONLY: {"say_to_customer":"ready-to-read English script for the agent",',
    '"resolution_en":"detailed step-by-step resolution in English",',
    '"resolution_zh_tldr":"简短中文TLDR版解决方法",',
    '"emotional_support":"1–2 empathetic sentences to use if the customer is frustrated",',
    '"sources":["K01", …]}',
    'Ground the resolution in the provided full source contents; do not invent policies or steps.',
    'Cite factual claims inline with the exact selected source id (for example [K01]). Return only ids from sources you were given.',
    'Never wrap the JSON in a quoted string — emit the raw object.',
  ].join('\n');
}

/** Cap per-source content again at prompt-build time (defense in depth). */
function buildSourceBlock(contents: Array<{ candidate: KittyCandidate; content: string }>): string {
  return contents
    .map(({ candidate, content }) => `[${candidate.id}] ${content}`)
    .join('\n\n');
}

export function useKittyHelp(args: {
  transcript: TranscriptEntry[];
  formData: CatFormData;
  isCapturing: boolean;
  /** Stage-1 fields + TLDR land through the same path as a cloud Parse. */
  applyOutcome: (fields: ExtractedField[], tldr: { en: string; zh: string }) => void;
}) {
  const { transcript, formData, isCapturing, applyOutcome } = args;

  const [stage, setStage] = useState<KittyStage | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<KittyHelpResult | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** The persistent conversation — append-only across runs. */
  const messagesRef = useRef<ChatMsg[]>([]);
  const runRef = useRef(false);
  const wasCapturingRef = useRef(isCapturing);
  const applyRef = useRef(applyOutcome);
  applyRef.current = applyOutcome;

  /** New call ⇒ fresh conversation (old prefix would poison the cache). */
  useEffect(() => {
    if (isCapturing && !wasCapturingRef.current) {
      messagesRef.current = [];
      setResult(null);
      setError(null);
    }
    wasCapturingRef.current = isCapturing;
  }, [isCapturing]);

  const reset = useCallback(() => {
    messagesRef.current = [];
    setResult(null);
    setError(null);
    setStage(null);
  }, []);

  /**
   * Transcript → one text blob. Mirrors how the Fill Notes prompt feeds
   * entries, but we also append a small form-context tail so the source
   * preselection knows the model/SKU/issue even if the ASR garbled them.
   * When no transcript exists the form tail IS the context (note-draft mode).
   */
  const buildQueryContext = useCallback((): {
    entries: TranscriptEntry[];
    transcriptText: string;
    formTail: string;
    query: string;
  } => {
    const formTail = Object.entries(formData)
      .filter(([, v]) => (typeof v === 'string' ? v.trim() : (v as string[])?.length > 0))
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' | ') : v}`)
      .slice(0, 24)
      .join('\n');
    const transcriptText = transcript
      .map((e) => `${e.speaker === 'agent' ? 'Agent' : e.speaker === 'recording' ? 'Recording' : 'Customer'}: ${e.text}`)
      .join('\n')
      .slice(-4000);
    return { entries: transcript, transcriptText, formTail, query: `${transcriptText}\n\n${formTail}`.trim() };
  }, [transcript, formData]);

  const start = useCallback(async (askQuestion = ''): Promise<void> => {
    if (runRef.current) return;
    const { entries, transcriptText, formTail, query } = buildQueryContext();
    const specificQuestion = askQuestion.trim();
    const ticketContext = [
      specificQuestion ? `Agent's question: ${specificQuestion}` : '',
      query,
    ].filter(Boolean).join('\n\n');
    // Kitty Help activates on EITHER a live transcript OR enough drafted
    // ticket-note content — the notes are fed to the LLM as the Task-1
    // source when the transcript is empty.
    const hasTranscript = transcriptText.trim().length > 0;
    const hasNotes = formTail.trim().length >= 120 || specificQuestion.length > 0;
    if (!hasTranscript && !hasNotes) {
      setError('Need a transcript or a filled ticket note to help with.');
      setStage({ label: 'Nothing to help with yet', detail: 'Capture a call or fill some ticket notes first.' });
      window.setTimeout(() => setStage(null), 4000);
      return;
    }

    runRef.current = true;
    setBusy(true);
    setError(null);
    setResult(null);
    setPanelOpen(true);
    const started = performance.now();
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      const {
        collectKittyCandidates,
        fetchKittySourceContent,
        kittyChat,
        KITTY_FIELD_IDS,
        kittyModelGuidance,
        parseResolutionReply,
      } = await import('@/lib/kitty-help');

      // ---------------------------------------------------------------
      // Stage 1 — Fill Notes (seeds the persistent conversation).
      // Transcript path: the standard Fill Notes extraction prompt. Note-
      // draft path (no transcript): the drafted ticket fields themselves
      // are the source. Either way the JSON contract travels in the USER
      // message so the system prompt stays byte-identical across runs.
      // ---------------------------------------------------------------
      setStage({
        label: hasTranscript ? 'Reading the transcript…' : 'Reading the ticket notes…',
        detail: 'Filling ticket notes',
      });
      const messages = messagesRef.current;
      if (messages.length === 0) {
        messages.push({ role: 'system', content: buildKittySystem() });
      }

      let task1User: string;
      if (hasTranscript) {
        const { system: parseSystem, user: parseUser } = buildParsePrompt(
          entries,
          [],
          undefined,
          /* strict= */ false,
          /* format= */ 'simple',
          /* maxChars= */ 16_000,
          'full',
          /* includeTldr= */ true
        );
        task1User = [
          'TASK 1 — FILL NOTES',
          '',
          '[EXTRACTION CONTRACT]',
          parseSystem,
          '',
          '[TRANSCRIPT]',
          parseUser,
          specificQuestion ? `\n[AGENT QUESTION]\n${specificQuestion}` : '',
        ].join('\n');
      } else {
        task1User = [
          'TASK 1 — FILL NOTES',
          '',
          'No live transcript exists. The agent already drafted the ticket notes below (field: value lines).',
          'Confirm the fields from this draft and enrich anything you can infer from them.',
          `Reply ONLY: {"fields":[{"fieldId":"…","value":"…"},…],"tldr":{"en":"…","zh":"…"}}`,
          `Valid fieldIds: ${KITTY_FIELD_IDS.join(', ')}. Omit fields the draft does not mention.`,
          '',
          '[TICKET NOTE DRAFT]',
          [formTail, specificQuestion ? `Agent question: ${specificQuestion}` : ''].filter(Boolean).join('\n\n'),
        ].join('\n');
      }
      messages.push({ role: 'user', content: task1User });

      const reply1 = await kittyChat(messages, 2048);
      messages.push({ role: 'assistant', content: reply1 });
      const parsed1 = extractJsonLoose(reply1);
      const fields = parsed1 ? validateLlmFields(parsed1) : [];
      const tldr = extractTldr(reply1);
      applyRef.current(fields, tldr);

      // ---------------------------------------------------------------
      // Stage 2 — preselect ≤50 knowledge titles, model picks ≤12.
      // ---------------------------------------------------------------
      setStage({ label: 'Scanning knowledge sources…', detail: 'Spec sheets · FAQs · News · Error codes · SOP' });
      const candidates = await collectKittyCandidates(ticketContext, 50);
      if (candidates.length === 0) {
        messages.push({ role: 'user', content: 'TASK 2 — no candidate knowledge sources matched. Reply ONLY: {"picks":[]}' });
        const emptyReply = await kittyChat(messages, 64);
        messages.push({ role: 'assistant', content: emptyReply });
        setResult({
          sayToCustomer: '',
          resolutionEn: 'No matched knowledge sources were available for this issue.',
          resolutionZhTldr: '没有匹配到可用的知识库资料。',
          emotionalSupport: '',
          sources: [],
          evidence: [],
          runId,
          picks: [],
          ms: Math.round(performance.now() - started),
        });
        setPanelOpen(true);
        return;
      }

      const candidateBlock = candidates
        .map((c) => `${c.id} [${c.kind.toUpperCase()} · ${c.origin}] ${c.title}`)
        .join('\n');
      messages.push({
        role: 'user',
        content: [
          'TASK 2 — PICK KNOWLEDGE SOURCES',
          `Candidate sources (${candidates.length}):`,
          candidateBlock,
          'Pick the up-to-12 sources most likely needed for THIS conversation. Prefer AMR email templates when they match the issue. Reply ONLY: {"picks":[{"id":"K07","reason":"short why"}]}',
        ].join('\n'),
      });
      const reply2 = await kittyChat(messages, 768);
      messages.push({ role: 'assistant', content: reply2 });

      const parsed2 = extractJsonLoose(reply2) as { picks?: Array<{ id?: string; reason?: string }> } | null;
      const pickedIds = (parsed2?.picks ?? [])
        .map((p) => (typeof p?.id === 'string' ? p.id.trim().toUpperCase() : ''))
        .filter(Boolean)
        .slice(0, 12);
      const picked = pickedIds
        .map((id) => candidates.find((c) => c.id === id))
        .filter((c): c is KittyCandidate => Boolean(c));
      const pickReasons = new Map(
        (parsed2?.picks ?? []).map((p) => [String(p?.id ?? '').toUpperCase(), String(p?.reason ?? '')])
      );

      // ---------------------------------------------------------------
      // Stage 3 — full source contents → final bilingual resolution.
      // ---------------------------------------------------------------
      setStage({
        label: picked.length > 0 ? `Reading ${picked.length} source${picked.length > 1 ? 's' : ''}…` : 'Writing the resolution…',
        detail: picked.length > 0 ? 'Composing the best resolution' : 'No sources picked — answering directly',
      });
      let sourceBlock = '(no matched sources were available — do not provide model-specific instructions; ask for one detail to improve the search)';
      let evidence: SupportEvidence[] = [];
      if (picked.length > 0) {
        const contents = await Promise.all(
          picked.map(async (c) => ({ candidate: c, content: await fetchKittySourceContent(c) }))
        );
        sourceBlock = buildSourceBlock(contents);
        evidence = contents.map(({ candidate, content }) => ({
          id: `[${candidate.id}]`,
          title: candidate.title,
          excerpt: content.slice(0, 1_200),
        }));
      }
      messages.push({
        role: 'user',
        content: [
          'TASK 3 — FINAL RESOLUTION',
          kittyModelGuidance(ticketContext),
          'Full content of the selected sources:',
          sourceBlock,
          '',
          'Write the best resolution for the current conversation using these sources and cite factual claims inline with their [Kxx] ids.',
          'Reply ONLY the JSON object specified in your system contract',
          '({"say_to_customer","resolution_en","resolution_zh_tldr","emotional_support","sources"}).',
        ].join('\n'),
      });
      const reply3 = await kittyChat(messages, 2500);
      messages.push({ role: 'assistant', content: reply3 });

      // Hardened parse: direct/fenced/brace-slice JSON, line salvage, then a
      // salvage pass for double-encoded replies. The model answers with
      // snake_case keys (per the contract), so read those FIRST — reading
      // camelCase-only keys was why the panel used to fall back to dumping
      // the raw JSON into the Resolution section.
      const parsed3 = parseResolutionReply(reply3);
      const readStr = (...keys: string[]): string => {
        for (const key of keys) {
          const value = parsed3?.[key];
          if (typeof value === 'string' && value.trim()) return value.trim();
        }
        return '';
      };
      const citedIds = new Set<string>([
        ...(Array.isArray(parsed3?.sources)
          ? (parsed3.sources as unknown[]).filter((s): s is string => typeof s === 'string')
          : []),
        ...(reply3.match(/\bK\d{2}\b/g) ?? []),
      ].flatMap((value) => value.match(/\bK\d{2}\b/g) ?? []));
      const citedPicks = picked.filter((candidate) => citedIds.has(candidate.id));
      const finalPicks = citedPicks.length ? citedPicks : picked;
      const finalEvidence = evidence.filter((source) =>
        finalPicks.some((candidate) => `[${candidate.id}]` === source.id)
      );
      const resolutionEn = readStr('resolution_en', 'resolutionEn') || reply3.trim();
      const citationLine = finalPicks.map((candidate) => `[${candidate.id}]`).join(', ');
      const finalResult: KittyHelpResult = {
        runId,
        sayToCustomer: readStr('say_to_customer', 'sayToCustomer'),
        resolutionEn: citationLine && !/\[K\d{2}\]/.test(resolutionEn)
          ? `${resolutionEn}\n\nSources: ${citationLine}`
          : resolutionEn,
        resolutionZhTldr: readStr('resolution_zh_tldr', 'resolutionZhTldr', 'resolution_zh', 'zh_tldr'),
        emotionalSupport: readStr('emotional_support', 'emotionalSupport'),
        sources: finalPicks.map((candidate) => `[${candidate.id}] ${candidate.title}`),
        evidence: finalEvidence,
        picks: finalPicks.map((c) => ({ id: c.id, title: c.title, reason: pickReasons.get(c.id) ?? '' })),
        ms: Math.round(performance.now() - started),
      };
      setResult(finalResult);
      setPanelOpen(true);
    } catch (err) {
      const message = (err as Error).message || 'Kitty Help failed.';
      setError(message);
      setStage({ label: 'Kitty Help failed', detail: message.slice(0, 80) });
      window.setTimeout(() => setStage(null), 6000);
    } finally {
      runRef.current = false;
      setBusy(false);
      // The success path keeps the last stage bubble until the panel opens;
      // clear it shortly either way so the cat never stays "busy".
      window.setTimeout(() => setStage(null), 1500);
    }
  }, [buildQueryContext]);

  return {
    /** Current routine stage for the cat's thinking bubble (null when idle). */
    stage,
    busy,
    result,
    panelOpen,
    setPanelOpen,
    error,
    start,
    reset,
    /** True when a conversation already exists (cache warm). */
    hasConversation: messagesRef.current.length > 0,
  };
}
