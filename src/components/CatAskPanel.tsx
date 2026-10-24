import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Mail, PawPrint, Search, Send, Trash2, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getApiBase, getStoredToken } from '@/lib/auth-client';
import AskEmailModal, { type AskEmailContext } from '@/components/AskEmailModal';
import {
  ASK_MODELS,
  DEFAULT_ASK_MODEL,
  isAskModel,
  type AskModel,
} from '@shared/ask-models';

const MODEL_STORAGE_KEY = '__app_shiftc_ask_model';
const CONVERSATION_STORAGE_PREFIX = '__app_shiftc_ask_conversation_v1:';

/**
 * Spotlight-style glassy ask panel — opens via long-press on the cat or
 * Shift+C. Searches the eco-kb AI Search index and streams a grounded answer
 * from the selected Workers AI model.
 */

interface AskResponse {
  answer?: string;
  sources?: string[];
  error?: string;
  text?: string;
}

interface AskTurn extends AskEmailContext {
  id: string;
  sources: string[];
  fromNotes: boolean;
  error?: string;
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
    return parsed.filter((turn): turn is AskTurn => (
      !!turn &&
      typeof turn === 'object' &&
      typeof (turn as AskTurn).id === 'string' &&
      typeof (turn as AskTurn).question === 'string' &&
      typeof (turn as AskTurn).answer === 'string' &&
      Array.isArray((turn as AskTurn).sources)
    ));
  } catch {
    return [];
  }
}

function getStoredAskModel(): AskModel {
  try {
    const stored = window.localStorage.getItem(MODEL_STORAGE_KEY);
    return isAskModel(stored) ? stored : DEFAULT_ASK_MODEL;
  } catch {
    return DEFAULT_ASK_MODEL;
  }
}

async function consumeAskStream(
  response: Response,
  onSources: (sources: string[]) => void,
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
        onSources(payload.sources.filter((source): source is string => typeof source === 'string'));
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
}: {
  onClose: () => void;
  notes: string;
  transcript?: string;
  customerName?: string;
  agentName?: string;
}) {
  const storageKey = conversationStorageKey(agentName);
  const [conversation, setConversation] = useState<AskTurn[]>(() => readConversation(storageKey));
  const [loadedStorageKey, setLoadedStorageKey] = useState(storageKey);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchingFromNotes, setSearchingFromNotes] = useState(false);
  const [loadingTurnId, setLoadingTurnId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [model, setModel] = useState<AskModel>(getStoredAskModel);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
    try {
      window.localStorage.setItem(MODEL_STORAGE_KEY, model);
    } catch {
      // Keep the current choice for this panel when storage is unavailable.
    }
  }, [model]);

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

  const submit = async () => {
    const q = question.trim();
    if (loading) return;
    const fromNotes = !q;
    if (fromNotes && !notes.trim()) {
      setError('No support notes are filled in yet. Add ticket details or type a question.');
      return;
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const turn: AskTurn = {
      id,
      question: q || 'Search current ticket notes',
      answer: '',
      sources: [],
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
          (sources) => updateTurn(id, (current) => ({ ...current, sources })),
          (text) => updateTurn(id, (current) => ({ ...current, answer: current.answer + text })),
        );
        if (!receivedText) updateTurn(id, (current) => ({ ...current, answer: '(empty answer)' }));
      } else {
        const payload = (await res.json().catch(() => ({}))) as AskResponse;
        if (payload.error) throw new Error(payload.error);
        updateTurn(id, (current) => ({
          ...current,
          answer: payload.answer?.trim() || '(empty answer)',
          sources: payload.sources ?? [],
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

  const clearConversation = () => {
    if (!conversation.length || !window.confirm('Clear this saved SHIFT+C conversation? This cannot be undone.')) return;
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
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-5" role="dialog" aria-modal="true" aria-label="Ask the knowledge base">
      <button type="button" aria-label="Close Ask panel" onClick={onClose} className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm" />
      <section className="glass-panel relative flex max-h-[calc(100dvh-1rem)] min-h-0 w-full max-w-3xl flex-col overflow-visible rounded-xl border border-white/15 bg-card/90 shadow-[0_24px_80px_rgba(0,0,0,0.65)] ring-1 ring-white/5 backdrop-blur-2xl sm:max-h-[92dvh] sm:rounded-2xl">
        <header className="flex shrink-0 items-center gap-2 rounded-t-xl border-b border-border/60 bg-gradient-to-b from-white/[0.06] to-transparent px-3 py-2.5 sm:gap-3 sm:rounded-t-2xl sm:px-5 sm:py-3">
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
              className="flex items-center gap-0.5 rounded-md p-1 text-sky-300/90 transition hover:bg-white/10 hover:text-sky-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:opacity-50"
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
                      setModel(option.id);
                      setModelMenuOpen(false);
                      inputRef.current?.focus();
                    }}
                    className={`flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky-300 ${model === option.id ? 'bg-sky-400/10 text-sky-200' : 'text-foreground'}`}
                  >
                    <span className="text-xs font-medium">{option.label}</span>
                    <span className="font-mono text-[9px] text-muted-foreground">{option.id}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-foreground">Knowledge assistant</h2>
            <p className="truncate text-[10px] text-muted-foreground">
              {conversation.length ? `${conversation.length} saved ${conversation.length === 1 ? 'exchange' : 'exchanges'} · ${model}` : `Grounded answers · ${model}`}
            </p>
          </div>
          {conversation.length > 0 && (
            <button type="button" onClick={clearConversation} title="Clear saved conversations" className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-red-500/10 hover:text-red-300 focus-visible:outline-2 focus-visible:outline-sky-300">
              <Trash2 className="size-3.5" />
              <span className="hidden sm:inline">Clear conversations</span>
            </button>
          )}
          <button type="button" aria-label="Close Ask panel" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-sky-300">
            <X className="size-4" />
          </button>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-3 sm:space-y-5 sm:px-5 sm:py-4">
          {conversation.length === 0 && (
            <p className="rounded-xl border border-border/50 bg-black/10 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
              Ask about a support issue, or leave the box below empty to search these ticket notes. Follow-up questions will stay grounded in the support sources.
            </p>
          )}
          {conversation.map((turn) => (
            <article key={turn.id} className="space-y-3">
              <div className="ml-auto max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-sm border border-sky-400/20 bg-sky-400/10 px-4 py-2.5 text-sm text-foreground">
                {turn.question}
              </div>
              <div className="flex items-start gap-2.5">
                <PawPrint className="mt-1 size-4 shrink-0 text-sky-300" />
                <div className="min-w-0 flex-1">
                  {turn.answer ? (
                    <div className="prose prose-sm prose-invert max-w-none break-words text-sm leading-relaxed text-foreground prose-headings:mb-2 prose-headings:mt-4 prose-headings:text-foreground prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-strong:text-foreground prose-a:text-sky-300 prose-code:text-amber-200 prose-pre:overflow-x-auto prose-pre:rounded-lg prose-pre:bg-black/30">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.answer}</ReactMarkdown>
                    </div>
                  ) : loadingTurnId === turn.id ? (
                    <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
                      <PawPrint className="size-4 animate-pulse text-sky-300" />
                      <span className="animate-pulse">{searchingFromNotes ? 'Rewriting ticket notes and searching…' : 'Searching and writing a grounded answer…'}</span>
                    </div>
                  ) : null}
                  {turn.error && <p className="mt-2 text-sm text-red-400">{turn.error}</p>}
                  {turn.answer && loadingTurnId === turn.id && <p className="mt-2 text-xs text-muted-foreground">Writing answer…</p>}
                  {turn.sources.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {turn.sources.map((source) => (
                        <span key={source} className="rounded-full border border-border/60 bg-black/20 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">{source}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
          {error && !conversation.some((turn) => turn.error === error) && <p role="alert" className="text-sm text-red-400">{error}</p>}
        </div>

        <footer className="shrink-0 border-t border-border/60 bg-black/10 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-3">
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
            placeholder={loading ? 'Searching and streaming your answer…' : 'Ask a follow-up, or press Enter to search current ticket notes…'}
            className="max-h-32 min-h-14 w-full resize-y rounded-xl border border-border/70 bg-background/70 px-3 py-2.5 text-base text-foreground outline-none placeholder:text-sm placeholder:text-muted-foreground/70 focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/20 disabled:opacity-60 sm:text-sm"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="hidden text-[10px] text-muted-foreground sm:inline">Enter to send · Shift+Enter for a new line</span>
            <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
              <button
                type="button"
                onClick={() => setEmailOpen(true)}
                disabled={!canGenerateEmail || loading}
                className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/70 bg-white/[0.04] px-2 py-2 text-xs font-medium text-foreground transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-sky-300 sm:flex-none sm:px-3"
              >
                <Mail className="size-3.5" />
                Generate Email
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={loading || (!question.trim() && !notes.trim())}
                className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 sm:flex-none sm:px-3.5"
              >
                <Send className="size-3.5" />
                {loading ? 'Working…' : 'Send'}
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
    </div>
  );
}

export default CatAskPanel;
