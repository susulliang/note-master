import { useState } from 'react';
import { History, Copy, Trash2, Inbox, X } from 'lucide-react';
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

/**
 * Floating glass panel with saved ticket-note history, toggled from the
 * top-right controls pill.
 */
export default function HistoryPanel({
  history,
  onDeleteHistory,
  onClearHistory,
  onClose,
}: HistoryPanelProps) {
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  const handleCopyNote = async (noteText: string) => {
    try {
      await navigator.clipboard.writeText(noteText);
      toast.success('Note copied to clipboard!');
    } catch {
      toast.error('Failed to copy. Please select and copy manually.');
    }
  };

  return (
    <div className="flex max-h-[calc(100vh-7rem)] w-[360px] flex-col overflow-hidden rounded-xl border border-foreground/15 bg-card/70 shadow-2xl backdrop-blur-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-foreground/10 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <History className="size-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
            History
          </span>
          {history.length > 0 && (
            <span className="rounded-full bg-primary/20 px-1.5 text-[10px] font-semibold text-primary">
              {history.length}
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
          <ScrollArea className="flex-1">
            <div className="space-y-1.5 p-2">
              {history.map((entry) => {
                const isExpanded = expandedNoteId === entry.id;
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
                      className="flex w-full flex-col gap-0.5 px-3 py-2 text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium text-foreground">
                          {entry.customerName || 'Unknown customer'}
                        </span>
                        <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {entry.issueType || '—'}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {formatTimestamp(entry.timestamp)}
                      </span>
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
