import { useCallback, useRef, useState } from 'react';
import type { ExtractedField, TranscriptEntry } from '@/lib/field-extraction';
import { validateLlmFields } from '@/lib/llm-parser';
import { getApiBase, getStoredToken } from '@/lib/auth-client';
import type { AskModel } from '@shared/ask-models';
import type { CatFormData } from '@/hooks/use-cat-assistant';
import { evidenceFromSourceNames, type SupportEvidence } from '@/lib/support-evidence';
import type { KittyHelpResult, KittyStage } from '@/hooks/use-kitty-help';

interface ResolveResponse {
  mode?: string;
  answer?: unknown;
  fields?: Array<{ fieldId?: unknown; value?: unknown }>;
  tldr?: { en?: unknown; zh?: unknown };
  sources?: unknown;
  evidence?: unknown;
  result?: {
    say_to_customer?: unknown;
    resolution_en?: unknown;
    resolution_zh_tldr?: unknown;
    emotional_support?: unknown;
  };
  error?: string;
}

interface ResolveStreamResult {
  answer: string;
  sources: string[];
  evidence: SupportEvidence[];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validEvidence(value: unknown): SupportEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.filter((source): source is SupportEvidence => (
    !!source &&
    typeof source === 'object' &&
    typeof (source as SupportEvidence).id === 'string' &&
    typeof (source as SupportEvidence).title === 'string' &&
    typeof (source as SupportEvidence).excerpt === 'string'
  ));
}

async function readResolveStream(response: Response): Promise<ResolveStreamResult> {
  if (!response.body) throw new Error('Kitty Help returned an empty response stream.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = 'message';
  let dataLines: string[] = [];
  let answer = '';
  let sources: string[] = [];
  let evidence: SupportEvidence[] = [];
  let streamError = '';

  const dispatch = () => {
    if (!dataLines.length) return;
    try {
      const payload = JSON.parse(dataLines.join('\n')) as {
        text?: unknown;
        error?: unknown;
        sources?: unknown;
        evidence?: unknown;
      };
      if (eventName === 'meta') {
        sources = Array.isArray(payload.sources)
          ? payload.sources.filter((source): source is string => typeof source === 'string')
          : [];
        evidence = validEvidence(payload.evidence);
      } else if (eventName === 'token' && typeof payload.text === 'string') {
        answer += payload.text;
      } else if (eventName === 'error') {
        streamError = typeof payload.error === 'string' ? payload.error : 'Kitty Help response failed.';
      }
    } catch {
      streamError = 'Kitty Help returned an invalid response stream.';
    }
    eventName = 'message';
    dataLines = [];
  };

  const consume = (flush = false) => {
    const lines = buffer.split(/\r?\n/);
    buffer = flush ? '' : (lines.pop() ?? '');
    for (const line of lines) {
      if (!line) dispatch();
      else if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (flush) dispatch();
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      consume();
    }
    buffer += decoder.decode();
    consume(true);
  } finally {
    reader.releaseLock();
  }
  if (streamError) throw new Error(streamError);
  return {
    answer: answer.trim(),
    sources,
    evidence: evidence.length ? evidence : evidenceFromSourceNames(sources),
  };
}

function serverFields(fields: ResolveResponse['fields']): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of fields ?? []) {
    if (typeof field.fieldId === 'string' && typeof field.value === 'string') {
      values[field.fieldId] = field.value;
    }
  }
  return values;
}

export function useKittyResolve(args: {
  transcript: TranscriptEntry[];
  formData: CatFormData;
  notes: string;
  applyOutcome: (fields: ExtractedField[], tldr: { en: string; zh: string }) => void;
}) {
  const { transcript, formData, notes, applyOutcome } = args;
  const [stage, setStage] = useState<KittyStage | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<KittyHelpResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef(false);
  const applyRef = useRef(applyOutcome);
  applyRef.current = applyOutcome;

  const start = useCallback(async (model: AskModel): Promise<void> => {
    if (runRef.current) return;

    const transcriptText = transcript
      .map((entry) => `${entry.speaker === 'agent' ? 'Agent' : entry.speaker === 'recording' ? 'Recording' : 'Customer'}: ${entry.text}`)
      .join('\n')
      .slice(-16_000);
    const formContext = Object.entries(formData)
      .filter(([, value]) => (typeof value === 'string' ? value.trim() : Array.isArray(value) && value.length > 0))
      .map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(' | ') : value}`)
      .slice(0, 32)
      .join('\n');
    const noteContext = [
      notes.trim() ? `Current ticket summary:\n${notes.trim()}` : '',
      formContext ? `All populated ticket fields:\n${formContext}` : '',
    ].filter(Boolean).join('\n\n').slice(0, 7_900);
    if (!transcriptText.trim() && !noteContext.trim()) {
      setError('Capture a call or add ticket notes before generating a resolution.');
      return;
    }

    runRef.current = true;
    setBusy(true);
    setError(null);
    setResult(null);
    const started = performance.now();
    setStage({
      label: transcriptText ? 'Reading the call and ticket…' : 'Reading the ticket notes…',
      detail: 'Extracting confirmed case details',
    });
    try {
      const response = await fetch(`${getApiBase()}/api/ask`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${getStoredToken() ?? ''}`,
        },
        body: JSON.stringify({
          mode: 'resolve',
          notes: noteContext,
          transcript: transcriptText,
          model,
        }),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({})) as ResolveResponse;
        throw new Error(failure.error || `Kitty Help request failed (${response.status}).`);
      }
      let payload: ResolveResponse;
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        const stream = await readResolveStream(response);
        payload = {
          sources: stream.sources,
          evidence: stream.evidence,
          result: { resolution_en: stream.answer },
        };
      } else {
        payload = await response.json().catch(() => ({})) as ResolveResponse;
        if (!payload.result && typeof payload.answer === 'string') {
          payload.result = { resolution_en: payload.answer };
        }
      }

      setStage({ label: 'Grounding the resolution…', detail: 'Searching verified support sources' });
      const fields = validateLlmFields(serverFields(payload.fields));
      const tldr = {
        en: text(payload.tldr?.en),
        zh: text(payload.tldr?.zh),
      };
      applyRef.current(fields, tldr);

      const resultData = payload.result ?? {};
      const sources = Array.isArray(payload.sources)
        ? payload.sources.filter((source): source is string => typeof source === 'string')
        : [];
      const workerEvidence = validEvidence(payload.evidence);
      const evidence = workerEvidence.length
        ? workerEvidence
        : evidenceFromSourceNames(sources);
      setResult({
        sayToCustomer: text(resultData.say_to_customer),
        resolutionEn: text(resultData.resolution_en) || 'No grounded resolution was returned. Please retry before sharing instructions.',
        resolutionZhTldr: text(resultData.resolution_zh_tldr),
        emotionalSupport: text(resultData.emotional_support),
        sources,
        evidence,
        ms: Math.round(performance.now() - started),
        picks: sources.map((source, index) => ({
          id: source.match(/^\[(\d+)\]/)?.[0] ?? `[${index + 1}]`,
          title: source.replace(/^\[\d+\]\s*/, ''),
          reason: 'Retrieved by the shared Kitty Help knowledge search',
        })),
      });
      setStage({ label: 'Resolution ready', detail: `${fields.length} ticket field${fields.length === 1 ? '' : 's'} checked` });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setStage({ label: 'Kitty Help could not finish', detail: message });
    } finally {
      runRef.current = false;
      setBusy(false);
    }
  }, [formData, notes, transcript]);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
    setStage(null);
  }, []);

  return { stage, busy, result, error, start, clearResult };
}
