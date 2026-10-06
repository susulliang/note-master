import { useMemo, useState } from 'react';
import { History, Copy, Trash2, Inbox, X, Search, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { NoteHistoryEntry } from '@/data/ticket';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface HistoryPanelProps {
  history: NoteHistoryEntry[];
  onDeleteHistory: (id: string) => void;
  onClearHistory: () => void;
  onClose: () => void;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/** Relative "time ago" label — newest first scans faster than raw dates. */
function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return formatTimestamp(ts);
}

/** Deterministic hue per issue-type string → colored badge. */
function issueHue(issue: string): number {
  let h = 0;
  for (let i = 0; i < issue.length; i++) h = (h * 31 + issue.charCodeAt(i)) % 360;
  return h;
}

/**
 * Floating glass panel with saved ticket-note history, toggled from the
 * left rail. Redesigned (v0.3.x) for fast lookup: a live search filters by
 * customer name / issue type / note text, entries lay out in TWO columns
 * on wider screens, and each card leads with the customer name + a
 * color-coded issue-type badge + relative timestamp.
 */
export default function HistoryPanel({
  history,
  onDeleteHistory,
  onClearHistory,
  onClose,
}: HistoryPanelProps) {
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return history;
    return history.filter(
      (e) =>
        e.customerName.toLowerCase().includes(q) ||
        e.issueType.toLowerCase().includes(q) ||
        e.noteText.toLowerCase().includes(q)
    );
  }, [history, query]);

  const handleCopyNote = async (noteText: string) => {
    try {
      await navigator.clipboard.writeText(noteText);
      toast.success('Note copied to clipboard!');
    } catch {
      toast.error('Failed to copy. Please select and copy manually.');
    }
  };

  return (
    <div className="glass-panel flex max-h-[calc(100vh-7rem)] w-[380px] max-w-[calc(100vw-7rem)] flex-col overflow-hidden rounded-xl transition-[width] duration-300 xl:w-[780px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-foreground/10 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <History className="size-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
            History
          </span>
          {history.length > 0 && (
            <span className="rounded-full bg-primary/20 px-1.5 text-[10px] font-semibold text-primary">
              {query.trim() ? `${filtered.length}/${history.length}` : history.length}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          onClick={onClose}
          aria-label="Close history"
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* Body */}
      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <Inbox className="size-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No saved notes yet</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground/70">
            Generated ticket notes will appear here after you hang up.
          </p>
        </div>
      ) : (
        <>
          {/* Search row — filter by customer name, issue type or note text */}
          <div className="border-b border-foreground/10 px-2.5 py-2">
            <div className="flex items-center gap-2 rounded-lg border border-foreground/15 bg-foreground/[0.04] px-2.5 py-1.5 transition-colors focus-within:border-primary/50">
              <Search className="size-3.5 shrink-0 text-muted-foreground/70" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by customer name or issue type…"
                className="w-full bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground/50"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="shrink-0 rounded-full px-1 text-[10px] font-semibold text-muted-foreground/70 transition hover:bg-foreground/10 hover:text-foreground"
                  aria-label="Clear search"
                >
                  clear
                </button>
              )}
            </div>
          </div>

          <ScrollArea className="h-0 min-h-0 flex-1">
            {filtered.length === 0 ? (
              <p className="px-4 py-8 text-center text-[11px] text-muted-foreground">
                No calls match “{query}”.
              </p>
            ) : (
              /* Two columns on wide screens (xl), single column otherwise. */
              <div className="grid grid-cols-1 gap-1.5 p-2 xl:grid-cols-2">
                {filtered.map((entry) => {
                  const isExpanded = expandedNoteId === entry.id;
                  const hue = issueHue(entry.issueType || '—');
                  return (
                    <div
                      key={entry.id}
                      className={cn(
                        'rounded-md border bg-foreground/5 backdrop-blur-sm transition-all',
                        isExpanded
                          ? 'border-primary/40 bg-primary/10'
                          : 'border-foreground/10 hover:border-foreground/25'
                      )}
                    >
                      <button
                        onClick={() => setExpandedNoteId(isExpanded ? null : entry.id)}
                        className="flex w-full flex-col gap-1 px-3 py-2 text-left"
                      >
                        {/* Line 1 — customer name (prominent) + issue badge */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[13px] font-semibold text-foreground">
                            {entry.customerName || 'Unknown customer'}
                          </span>
                          <span
                            className="shrink-0 rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wide"
                            style={{
                              color: `hsl(${hue} 60% 45%)`,
                              backgroundColor: `hsl(${hue} 60% 45% / 0.14)`,
                            }}
                          >
                            {entry.issueType || '—'}
                          </span>
                        </div>
                        {/* Line 2 — relative + absolute timestamp */}
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <CalendarClock className="size-3 shrink-0 text-muted-foreground/60" />
                          <span className="font-medium">{timeAgo(entry.timestamp)}</span>
                          <span className="text-muted-foreground/50">
                            · {formatTimestamp(entry.timestamp)}
                          </span>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-foreground/10 px-3 py-2">
                          <pre className="custom-scrollbar max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground">
                            {entry.noteText}
                          </pre>
                          <div className="mt-2 flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                              onClick={() => handleCopyNote(entry.noteText)}
                            >
                              <Copy className="size-3" />
                              Copy
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1.5 text-[11px] text-muted-foreground hover:text-destructive"
                              onClick={() => {
                                onDeleteHistory(entry.id);
                                setExpandedNoteId(null);
                              }}
                            >
                              <Trash2 className="size-3" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
          <div className="border-t border-foreground/10 px-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-1.5 text-[11px] text-muted-foreground hover:text-destructive"
              onClick={onClearHistory}
            >
              <Trash2 className="size-3" />
              Clear all history
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
