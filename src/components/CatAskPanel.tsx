import { useEffect, useRef, useState } from 'react';
import { ChevronDown, PawPrint, Search } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getApiBase, getStoredToken } from '@/lib/auth-client';
import {
  ASK_MODELS,
  DEFAULT_ASK_MODEL,
  isAskModel,
  type AskModel,
} from '@shared/ask-models';

const MODEL_STORAGE_KEY = '__app_shiftc_ask_model';

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

export function CatAskPanel({ onClose, notes }: { onClose: () => void; notes: string }) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchingFromNotes, setSearchingFromNotes] = useState(false);
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [model, setModel] = useState<AskModel>(getStoredAskModel);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [answer, loading, error]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MODEL_STORAGE_KEY, model);
    } catch {
      // Keep the current choice for this panel when storage is unavailable.
    }
  }, [model]);

  const submit = async () => {
    const q = question.trim();
    if (loading) return;
    const fromNotes = !q;
    if (fromNotes && !notes.trim()) {
      setError('No support notes are filled in yet. Add ticket details or type a question.');
      return;
    }
    setLoading(true);
    setError('');
    setAnswer('');
    setSources([]);
    setSearchingFromNotes(fromNotes);
    try {
      const res = await fetch(`${getApiBase()}/api/ask`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${getStoredToken() ?? ''}` },
        body: JSON.stringify({
          question: q,
          notes: fromNotes ? notes : undefined,
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
          setSources,
          (text) => setAnswer((current) => current + text),
        );
        if (!receivedText) setAnswer('(empty answer)');
      } else {
        const payload = (await res.json().catch(() => ({}))) as AskResponse;
        if (payload.error) throw new Error(payload.error);
        setAnswer(payload.answer?.trim() || '(empty answer)');
        setSources(payload.sources ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[14vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Ask the knowledge base"
    >
      {/* Dim + blur backdrop — click dismisses. */}
      <button
        type="button"
        aria-label="Close ask panel"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-sm"
      />
      <div className="glass-panel relative w-full max-w-2xl overflow-visible rounded-2xl border border-white/15 bg-card/85 shadow-[0_24px_80px_rgba(0,0,0,0.6)] ring-1 ring-white/5 backdrop-blur-2xl">
        {/* Question row */}
        <div className="flex items-center gap-3 rounded-t-2xl border-b border-border/50 bg-gradient-to-b from-white/[0.06] to-transparent px-5 py-4">
          <div
            className="relative z-30 shrink-0"
            onMouseEnter={() => {
              if (!loading) setModelMenuOpen(true);
            }}
            onMouseLeave={() => setModelMenuOpen(false)}
            onFocus={() => setModelMenuOpen(true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setModelMenuOpen(false);
              }
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
              <div
                role="menu"
                aria-label="AI Search answer models"
                className="absolute left-0 top-[calc(100%+0.65rem)] z-50 w-80 max-w-[calc(100vw-3rem)] overflow-hidden rounded-xl border border-border/80 bg-card/95 p-1.5 shadow-2xl backdrop-blur-xl"
              >
                <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Answer model
                </p>
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
                    className={`flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky-300 ${
                      model === option.id ? 'bg-sky-400/10 text-sky-200' : 'text-foreground'
                    }`}
                  >
                    <span className="text-xs font-medium">{option.label}</span>
                    <span className="font-mono text-[9px] text-muted-foreground">{option.id}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            ref={inputRef}
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submit();
              } else if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
              }
            }}
            disabled={loading}
            maxLength={1000}
            placeholder={loading
              ? searchingFromNotes ? 'Rewriting ticket notes and searching…' : 'Searching the knowledge base…'
              : 'Ask a question, or press Enter to search these ticket notes…'}
            className="flex-1 bg-transparent text-lg text-foreground outline-none placeholder:text-muted-foreground/70 disabled:opacity-60"
          />
          <kbd className="rounded-md border border-border/60 bg-black/20 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            esc
          </kbd>
        </div>

        {/* Answer area */}
        <div ref={scrollRef} className="max-h-[52vh] overflow-y-auto px-5 py-4">
          {error && <p className="text-sm text-red-400">{error}</p>}
          {loading && !answer && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <PawPrint className="size-4 animate-pulse text-sky-300" />
              <span className="animate-pulse">
                {searchingFromNotes ? 'Rewriting ticket notes and searching…' : 'Searching the knowledge base…'}
              </span>
            </div>
          )}
          {!loading && !error && !answer && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Ask naturally, or leave the search box empty and press Enter to look up this call’s product and issue
              notes. Answers are grounded in the eco-kb AI Search index.
            </p>
          )}
          {answer && (
            <div className="prose prose-sm prose-invert max-w-none break-words text-sm leading-relaxed text-foreground prose-headings:mb-2 prose-headings:mt-4 prose-headings:text-foreground prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-strong:text-foreground prose-a:text-sky-300 prose-code:text-amber-200 prose-pre:overflow-x-auto prose-pre:rounded-lg prose-pre:bg-black/30">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
            </div>
          )}
          {loading && answer && <p className="mt-2 text-xs text-muted-foreground">Writing answer…</p>}
          {sources.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {sources.map((key) => (
                <span
                  key={key}
                  className="rounded-full border border-border/60 bg-black/20 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                >
                  {key}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CatAskPanel;
