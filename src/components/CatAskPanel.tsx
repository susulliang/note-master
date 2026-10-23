import { useEffect, useRef, useState } from 'react';
import { PawPrint, Search } from 'lucide-react';
import { getApiBase, getStoredToken } from '@/lib/auth-client';

/**
 * Spotlight-style glassy ask panel — opens via long-press on the cat or
 * Shift+C. Sends the question to /api/ask (AI Search over the eco-kb R2
 * bucket, answered by streamed Qwen3-30B-A3B) and shows the grounded answer with
 * its source files.
 */

interface AskResponse {
  answer?: string;
  sources?: string[];
  error?: string;
  text?: string;
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

export function CatAskPanel({ onClose }: { onClose: () => void }) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<string[]>([]);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [answer, loading, error]);

  const submit = async () => {
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setError('');
    setAnswer('');
    setSources([]);
    try {
      const res = await fetch(`${getApiBase()}/api/ask`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${getStoredToken() ?? ''}` },
        body: JSON.stringify({ question: q }),
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
      <div className="glass-panel relative w-full max-w-2xl overflow-hidden rounded-2xl border border-white/15 bg-card/85 shadow-[0_24px_80px_rgba(0,0,0,0.6)] ring-1 ring-white/5 backdrop-blur-2xl">
        {/* Question row */}
        <div className="flex items-center gap-3 border-b border-border/50 bg-gradient-to-b from-white/[0.06] to-transparent px-5 py-4">
          <Search className="size-5 shrink-0 text-sky-300/90" />
          <input
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
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
            placeholder={loading ? 'Searching the knowledge base…' : 'Ask the knowledge base…'}
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
              <span className="animate-pulse">Searching the knowledge base…</span>
            </div>
          )}
          {!loading && !error && !answer && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Ask naturally — answers are grounded in the eco-kb AI Search index: FAQ, product sheets, error codes, app
              &amp; firmware updates, the SOP handbook and AMR templates.
            </p>
          )}
          {answer && (
            <>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{answer}</p>
            </>
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
