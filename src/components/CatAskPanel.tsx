import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Mail, Search, Send, Trash2, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getApiBase, getStoredToken } from '@/lib/auth-client';
import AskEmailModal, { type AskEmailContext } from '@/components/AskEmailModal';
import { evidenceFromSourceNames, type SupportEvidence } from '@/lib/support-evidence';
import type { KittyHelpResult, KittyStage } from '@/hooks/use-kitty-help';
import KittyHelpPanel from '@/components/KittyHelpPanel';
import {
  ASK_MODELS,
  type AskModel,
} from '@shared/ask-models';
import { readStoredAskModel, storeAskModel } from '@/lib/ask-model-preferences';

const CONVERSATION_STORAGE_PREFIX = '__app_shiftc_ask_conversation_v1:';
const EMPTY_ANSWER_NOTICE =
  'The answer model returned no text. The retrieved sources are shown in the Evidence rail; try sending the question again.';

/**
 * Spotlight-style glassy ask panel — opens via long-press on the cat or
 * Shift+C. Searches the eco-kb AI Search index and streams a grounded answer
 * from the selected Workers AI model.
 */

interface AskResponse {
  answer?: string;
  sources?: string[];
  evidence?: SupportEvidence[];
  error?: string;
  text?: string;
}

interface AskTurn extends AskEmailContext {
  id: string;
  sources: string[];
  evidence: SupportEvidence[];
  fromNotes: boolean;
  resolution?: KittyHelpResult;
  resolutionRunId?: string;
  error?: string;
}

function readKittyResult(value: unknown): KittyHelpResult | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const result = value as Partial<KittyHelpResult>;
  if (
    typeof result.sayToCustomer !== 'string' ||
    typeof result.resolutionEn !== 'string' ||
    typeof result.resolutionZhTldr !== 'string' ||
    typeof result.emotionalSupport !== 'string' ||
    !Array.isArray(result.sources) ||
    !Array.isArray(result.picks) ||
    typeof result.ms !== 'number'
  ) return undefined;
  return {
    ...(result as KittyHelpResult),
    evidence: readEvidence(result.evidence),
  };
}

function readEvidence(value: unknown): SupportEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.filter((source): source is SupportEvidence => (
    !!source &&
    typeof source === 'object' &&
    typeof (source as SupportEvidence).id === 'string' &&
    typeof (source as SupportEvidence).title === 'string' &&
    typeof (source as SupportEvidence).excerpt === 'string'
  ));
}

function conversationStorageKey(agentName: string): string {
  const scope = agentName.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_') || 'default';
  return `${CONVERSATION_STORAGE_PREFIX}${scope}`;
}

function readConversation(storageKey: string): AskTurn[] {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((turn): AskTurn[] => {
      if (
        !turn ||
        typeof turn !== 'object' ||
        typeof (turn as AskTurn).id !== 'string' ||
        typeof (turn as AskTurn).question !== 'string' ||
        typeof (turn as AskTurn).answer !== 'string' ||
        !Array.isArray((turn as AskTurn).sources)
      ) return [];
      const saved = turn as AskTurn;
      return [{
        ...saved,
        evidence: readEvidence(saved.evidence),
        resolution: readKittyResult(saved.resolution),
      }];
    });
  } catch {
    return [];
  }
}

async function consumeAskStream(
  response: Response,
  onEvidence: (sources: string[], evidence: SupportEvidence[]) => void,
  onToken: (text: string) => void,
): Promise<boolean> {
  if (!response.body) throw new Error('The answer stream was unavailable. Please try again.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = 'message';
  let dataLines: string[] = [];
  let streamError = '';
  let receivedDone = false;
  let receivedText = false;

  const dispatchEvent = () => {
    if (dataLines.length === 0) {
      eventName = 'message';
      return;
    }
    try {
      const payload = JSON.parse(dataLines.join('\n')) as AskResponse;
      if (eventName === 'meta' && Array.isArray(payload.sources)) {
        const sources = payload.sources.filter((source): source is string => typeof source === 'string');
        const evidence = readEvidence(payload.evidence);
        onEvidence(
          sources,
          evidence.length > 0 ? evidence : evidenceFromSourceNames(sources),
        );
      } else if (eventName === 'token' && typeof payload.text === 'string') {
        receivedText = true;
        onToken(payload.text);
      } else if (eventName === 'error') {
        streamError = payload.error || 'The answer stream was interrupted. Please try again.';
      } else if (eventName === 'done') {
        receivedDone = true;
      }
    } catch {
      streamError = 'The answer stream returned an invalid response.';
    }
    eventName = 'message';
    dataLines = [];
  };

  const consumeLines = (flush = false) => {
    const lines = buffer.split(/\r?\n/);
    buffer = flush ? '' : (lines.pop() ?? '');
    for (const line of lines) {
      if (!line) {
        dispatchEvent();
      } else if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
    if (flush) dispatchEvent();
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      consumeLines();
    }
    buffer += decoder.decode();
    consumeLines(true);
  } finally {
    reader.releaseLock();
  }
  if (streamError) throw new Error(streamError);
  if (!receivedDone) throw new Error('The answer stream ended unexpectedly. Please try again.');
  return receivedText;
}

export function CatAskPanel({
  onClose,
  notes,
  transcript = '',
  customerName = '',
  agentName = '',
  embedded = false,
  selectedModel,
  onModelChange,
  onEvidenceChange,
  onResolveRequest,
  onResolutionTldrChange,
  resolveResult,
  resolveBusy = false,
  resolveStage,
  resolveError,
  autoAskOnMount = false,
  onAutoAskConsumed,
}: {
  onClose: () => void;
  notes: string;
  transcript?: string;
  customerName?: string;
  agentName?: string;
  embedded?: boolean;
  selectedModel?: AskModel;
  onModelChange?: (model: AskModel) => void;
  onEvidenceChange?: (evidence: SupportEvidence[]) => void;
  onResolveRequest?: (question: string) => void;
  onResolutionTldrChange?: (tldr: string) => void;
  resolveResult?: KittyHelpResult | null;
  resolveBusy?: boolean;
  resolveStage?: KittyStage | null;
  resolveError?: string | null;
  autoAskOnMount?: boolean;
  onAutoAskConsumed?: () => void;
}) {
  const storageKey = conversationStorageKey(agentName);
  const [conversation, setConversation] = useState<AskTurn[]>(() => readConversation(storageKey));
  const [loadedStorageKey, setLoadedStorageKey] = useState(storageKey);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchingFromNotes, setSearchingFromNotes] = useState(false);
  const [loadingTurnId, setLoadingTurnId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [localModel, setLocalModel] = useState<AskModel>(readStoredAskModel);
  const model = selectedModel ?? localModel;
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const submitRef = useRef<((runKittyIfEmpty?: boolean) => Promise<void>) | null>(null);
  const autoAskHandledRef = useRef(false);

  useEffect(() => {
    if (loadedStorageKey === storageKey) return;
    setConversation(readConversation(storageKey));
    setLoadedStorageKey(storageKey);
  }, [loadedStorageKey, storageKey]);

  useEffect(() => {
    if (loadedStorageKey !== storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(conversation));
    } catch {
      setError('Conversation could not be saved in this browser.');
    }
  }, [conversation, loadedStorageKey, storageKey]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [conversation, loading]);

  useEffect(() => {
    const latest = conversation[conversation.length - 1];
    const evidence = latest?.evidence ?? [];
    onEvidenceChange?.(evidence.length ? evidence : evidenceFromSourceNames(latest?.sources ?? []));
  }, [conversation, onEvidenceChange]);

  useEffect(() => {
    const latestResolution = [...conversation].reverse().find((turn) => turn.resolution);
    onResolutionTldrChange?.(latestResolution?.resolution?.resolutionZhTldr ?? '');
  }, [conversation, onResolutionTldrChange]);

  useEffect(() => {
    storeAskModel(model);
  }, [model]);

  const changeModel = (nextModel: AskModel) => {
    setLocalModel(nextModel);
    onModelChange?.(nextModel);
  };

  const emailConversation = useMemo(
    () => conversation
      .filter((turn) => turn.answer.trim())
      .map(({ question: turnQuestion, answer: turnAnswer }) => ({
        question: turnQuestion,
        answer: turnAnswer,
      })),
    [conversation],
  );

  const updateTurn = (id: string, update: (turn: AskTurn) => AskTurn) => {
    setConversation((current) => current.map((turn) => (turn.id === id ? update(turn) : turn)));
  };

  useEffect(() => {
    if (loadedStorageKey !== storageKey || !resolveResult) return;
    const resolutionRunId = resolveResult.runId
      || `${resolveResult.ms}-${resolveResult.resolutionEn.slice(0, 48)}`;
    const id = `kitty-${resolutionRunId}`;
    const answer = [
      resolveResult.sayToCustomer ? `Say to the customer:\n${resolveResult.sayToCustomer}` : '',
      resolveResult.resolutionEn,
      resolveResult.resolutionZhTldr ? `Chinese TLDR:\n${resolveResult.resolutionZhTldr}` : '',
      resolveResult.emotionalSupport ? `Empathy:\n${resolveResult.emotionalSupport}` : '',
    ].filter(Boolean).join('\n\n');
    setConversation((current) => {
      if (current.some((turn) => turn.resolutionRunId === resolutionRunId)) return current;
      return [...current, {
        id,
        question: 'Resolve the current ticket with Kitty Help',
        answer,
        sources: resolveResult.sources,
        evidence: resolveResult.evidence ?? [],
        fromNotes: true,
        resolution: resolveResult,
        resolutionRunId,
      }];
    });
  }, [loadedStorageKey, resolveResult, storageKey]);

  const submit = async (runKitty = true) => {
    const q = question.trim();
    if (loading) return;
    const fromNotes = !q;
    if (fromNotes && !notes.trim() && !transcript.trim()) {
      setError('No support notes are filled in yet. Add ticket details or type a question.');
      return;
    }
    if (runKitty) onResolveRequest?.(q);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const turn: AskTurn = {
      id,
      question: q || (notes.trim() ? 'Search current ticket context' : 'Search the current call transcript'),
      answer: '',
      sources: [],
      evidence: [],
      fromNotes,
    };
    const history = conversation
      .filter((item) => item.answer.trim())
      .slice(-5)
      .flatMap((item) => [
        {
          role: 'user' as const,
          content: item.fromNotes ? 'Asked for guidance using the current ticket notes.' : item.question,
        },
        { role: 'assistant' as const, content: item.answer },
      ]);

    setConversation((current) => [...current, turn]);
    setQuestion('');
    setError('');
    setLoading(true);
    setLoadingTurnId(id);
    setSearchingFromNotes(fromNotes);
    try {
      const res = await fetch(`${getApiBase()}/api/ask`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${getStoredToken() ?? ''}` },
        body: JSON.stringify({
          question: q,
          notes: notes || undefined,
          transcript: transcript || undefined,
          history,
          model,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as AskResponse;
        throw new Error(payload.error || `Request failed (${res.status})`);
      }
      if (res.headers.get('content-type')?.includes('text/event-stream')) {
        const receivedText = await consumeAskStream(
          res,
          (sources, evidence) => updateTurn(id, (current) => ({ ...current, sources, evidence })),
          (text) => updateTurn(id, (current) => ({ ...current, answer: current.answer + text })),
        );
        if (!receivedText) {
          updateTurn(id, (current) => ({ ...current, answer: EMPTY_ANSWER_NOTICE }));
        }
      } else {
        const payload = (await res.json().catch(() => ({}))) as AskResponse;
        if (payload.error) throw new Error(payload.error);
        updateTurn(id, (current) => ({
          ...current,
          answer: payload.answer?.trim() || EMPTY_ANSWER_NOTICE,
          sources: payload.sources ?? [],
          evidence: (() => {
            const evidence = readEvidence(payload.evidence);
            return evidence.length > 0 ? evidence : evidenceFromSourceNames(payload.sources ?? []);
          })(),
        }));
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      updateTurn(id, (current) => ({ ...current, error: message }));
    } finally {
      setLoading(false);
      setLoadingTurnId(null);
    }
  };
  submitRef.current = submit;

  useEffect(() => {
    if (!autoAskOnMount) {
      autoAskHandledRef.current = false;
      return;
    }
    if (autoAskHandledRef.current) return;
    autoAskHandledRef.current = true;
    onAutoAskConsumed?.();
    void submitRef.current?.(false);
  }, [autoAskOnMount, onAutoAskConsumed]);

  const clearConversation = () => {
    if (!conversation.length || !window.confirm('Clear this saved Kitty Help conversation? This cannot be undone.')) return;
    setConversation([]);
    setError('');
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // The in-memory conversation is still cleared.
    }
  };

  const canGenerateEmail = emailConversation.length > 0 && !loading;

  return (
    <>
      {!embedded && (
        <button
          type="button"
          aria-label="Close Ask panel"
          onClick={onClose}
          className="fixed inset-0 z-[89] cursor-default bg-background/50 backdrop-blur-md"
        />
      )}
      <section
        className={embedded
          ? 'relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-transparent'
          : 'glass-panel fixed inset-x-2 bottom-2 top-2 z-[90] mx-auto flex min-h-0 w-full max-w-3xl flex-col overflow-visible rounded-2xl bg-card sm:inset-x-5 sm:bottom-[4vh] sm:top-[4vh]'}
        role={embedded ? undefined : 'dialog'}
        aria-modal={embedded ? undefined : true}
        aria-label="Ask the knowledge base"
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-border bg-card/30 px-3 py-2 sm:gap-3 sm:px-4">
          {!embedded && (
          <div
            className="relative z-30 shrink-0"
            onMouseEnter={() => !loading && setModelMenuOpen(true)}
            onMouseLeave={() => setModelMenuOpen(false)}
            onFocus={() => setModelMenuOpen(true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setModelMenuOpen(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setModelMenuOpen(false);
            }}
          >
            <button
              type="button"
              aria-label={`Select answer model. Current model: ${model}`}
              aria-haspopup="menu"
              aria-expanded={modelMenuOpen}
              title="Choose answer model"
              disabled={loading}
              onClick={() => setModelMenuOpen((open) => !open)}
              className="glass-btn flex items-center gap-0.5 rounded-md p-1 text-accent transition hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
            >
              <Search className="size-5" />
              <ChevronDown className="size-3" />
            </button>
            {modelMenuOpen && (
              <div role="menu" aria-label="AI Search answer models" className="absolute left-0 top-[calc(100%+0.65rem)] z-50 w-80 max-w-[calc(100vw-3rem)] overflow-hidden rounded-xl border border-border/80 bg-card/95 p-1.5 shadow-2xl backdrop-blur-xl">
                <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Answer model</p>
                {ASK_MODELS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={model === option.id}
                    onClick={() => {
                      changeModel(option.id);
                      setModelMenuOpen(false);
                      inputRef.current?.focus();
                    }}
                    className={`flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${model === option.id ? 'bg-accent/10 text-accent' : 'text-foreground'}`}
                  >
                    <span className="text-xs font-medium">{option.label}</span>
                    <span className="text-xs text-muted-foreground">{option.id}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          )}
          <div className="min-w-0 flex-1">
            {!embedded && <h2 className="truncate text-sm font-semibold text-foreground">Knowledge assistant</h2>}
          </div>
          {embedded && (
            <label className="shrink-0">
              <select
                value={model}
                onChange={(event) => changeModel(event.target.value as AskModel)}
                disabled={loading || resolveBusy}
                aria-label="AI Search model"
                className="h-8 max-w-36 appearance-none rounded-md border border-border/60 bg-background/40 px-2 text-[10px] text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 sm:max-w-44 sm:text-xs"
              >
                {ASK_MODELS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
          )}
          {conversation.length > 0 && (
            <button type="button" onClick={clearConversation} title="Clear saved conversations" className="glass-btn inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
              <Trash2 aria-hidden="true" className="size-3.5" />
              <span className="sr-only">Clear saved conversations</span>
            </button>
          )}
          {!embedded && (
            <button type="button" aria-label="Close Ask panel" onClick={onClose} className="glass-btn rounded-md p-1.5 text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
              <X className="size-4" />
            </button>
          )}
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-3 sm:space-y-5 sm:px-5 sm:py-4">
          {conversation.length === 0 && (
            <p className="rounded-xl border border-border bg-card/40 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
              Submit a question to run AI Search and Kitty Help together. Leave the box empty to run both on the current ticket notes and call transcript.
            </p>
          )}
          {resolveBusy && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
              <span className="size-2 shrink-0 animate-pulse rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
              <span>{resolveStage?.label ?? 'Kitty Help is selecting sources and preparing a resolution…'}</span>
            </div>
          )}
          {resolveError && !resolveBusy && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Kitty Help: {resolveError}
            </p>
          )}
          {conversation.map((turn) => (
            <article key={turn.id} className="space-y-3">
              <div className="ml-auto max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-sm border border-accent/25 bg-accent/10 px-4 py-2.5 text-sm text-foreground">
                {turn.question}
              </div>
              <div className="flex items-start gap-2.5">
                <div className="min-w-0 flex-1">
                  {turn.resolution ? (
                    <KittyHelpPanel result={turn.resolution} onClose={() => {}} embedded inline />
                  ) : turn.answer ? (
                    <div className="prose prose-sm max-w-none break-words text-sm leading-relaxed text-foreground prose-headings:mb-2 prose-headings:mt-4 prose-headings:text-foreground prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-strong:text-foreground prose-a:text-accent prose-code:text-warning prose-pre:overflow-x-auto prose-pre:rounded-lg prose-pre:bg-muted/60">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.answer}</ReactMarkdown>
                    </div>
                  ) : loadingTurnId === turn.id ? (
                    <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
                      <span className="size-2 shrink-0 animate-pulse rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
                      <span className="animate-pulse">{searchingFromNotes ? 'Rewriting ticket notes and searching…' : 'Searching and writing a grounded answer…'}</span>
                    </div>
                  ) : null}
                  {turn.error && <p className="mt-2 text-sm text-destructive">{turn.error}</p>}
                  {turn.answer && loadingTurnId === turn.id && <p className="mt-2 text-xs text-muted-foreground">Writing answer…</p>}
                  {!turn.resolution && turn.sources.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {turn.sources.map((source) => (
                        <span key={source} className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">{source}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
          {error && !conversation.some((turn) => turn.error === error) && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>

        <footer className="shrink-0 border-t border-border bg-card/30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-3">
          <textarea
            ref={inputRef}
            value={question}
            onChange={(event) => {
              setQuestion(event.target.value);
              setError('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void submit();
              } else if (event.key === 'Escape') {
                event.stopPropagation();
                onClose();
              }
            }}
            disabled={loading}
            maxLength={1000}
            rows={2}
            placeholder={loading ? 'Searching and resolving…' : 'Ask a question to run AI Search + Kitty Help…'}
            className="max-h-32 min-h-14 w-full resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-base text-foreground outline-none placeholder:text-sm placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:opacity-60 sm:text-sm"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">Enter runs AI Search + Kitty Help · Shift+Enter adds a line</span>
            <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
              <button
                type="button"
                onClick={() => setEmailOpen(true)}
                disabled={!canGenerateEmail || loading}
                className="glass-btn inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-foreground transition disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 sm:flex-none sm:px-3"
              >
                <Mail className="size-3.5" />
                Generate Email
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={loading || (!question.trim() && !notes.trim() && !transcript.trim())}
                className="glass-btn glass-btn-primary inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 sm:flex-none sm:px-3.5"
              >
                <Send className="size-3.5" />
                {loading ? 'Working…' : 'Ask + Kitty Help'}
              </button>
            </div>
          </div>
        </footer>
      </section>
      {emailOpen && (
        <AskEmailModal
          notes={notes}
          transcript={transcript}
          conversation={emailConversation}
          customerName={customerName}
          agentName={agentName}
          onClose={() => setEmailOpen(false)}
        />
      )}
    </>
  );
}

export default CatAskPanel;
