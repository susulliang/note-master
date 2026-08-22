import { useState } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  MessageSquarePlus,
  History,
  Copy,
  Trash2,
  Inbox,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { QUICK_PHRASES } from '@/data/ticket';
import type { NoteHistoryEntry } from '@/data/ticket';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface QuickReferenceSidebarProps {
  onInsertPhrase: (phrase: string) => void;
  history: NoteHistoryEntry[];
  onDeleteHistory: (id: string) => void;
  onClearHistory: () => void;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function QuickReferenceSidebar({
  onInsertPhrase,
  history,
  onDeleteHistory,
  onClearHistory,
}: QuickReferenceSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>('Greetings');
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  const handleCopyNote = async (noteText: string) => {
    try {
      await navigator.clipboard.writeText(noteText);
      toast.success('Note copied to clipboard!');
    } catch {
      toast.error('Failed to copy. Please select and copy manually.');
    }
  };

  if (isCollapsed) {
    return (
      <div className="flex h-full w-12 flex-col items-center border-l border-border/40 bg-card/50 backdrop-blur-xl py-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(false)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Expand sidebar"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="mt-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground [writing-mode:vertical-rl]">
          Quick Phrases &amp; History
        </div>
      </div>
    );
  }

  return (
    <aside className="flex h-full w-72 flex-col border-l border-border/40 bg-card/30 backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquarePlus className="size-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Reference
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => setIsCollapsed(true)}
          aria-label="Collapse sidebar"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Tabs content */}
      <Tabs defaultValue="phrases" className="flex flex-1 min-h-0 flex-col gap-0">
        <div className="px-2 pt-2">
          <TabsList className="grid w-full grid-cols-2 h-8">
            <TabsTrigger value="phrases" className="text-[11px] gap-1.5">
              <MessageSquarePlus className="size-3.5" />
              Phrases
            </TabsTrigger>
            <TabsTrigger value="history" className="text-[11px] gap-1.5">
              <History className="size-3.5" />
              History
              {history.length > 0 && (
                <span className="ml-0.5 rounded-full bg-primary/20 px-1.5 text-[9px] font-semibold text-primary">
                  {history.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Phrases tab */}
        <TabsContent value="phrases" className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            <div className="space-y-1 p-2">
              {Object.entries(QUICK_PHRASES).map(([category, phrases]) => (
                <div key={category} className="rounded-md">
                  <button
                    onClick={() =>
                      setExpandedCategory(expandedCategory === category ? null : category)
                    }
                    className={cn(
                      'flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium uppercase tracking-wider transition-colors rounded-md',
                      expandedCategory === category
                        ? 'text-foreground bg-accent/10'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/5'
                    )}
                  >
                    {category}
                    <ChevronRight
                      className={cn(
                        'size-3.5 transition-transform',
                        expandedCategory === category && 'rotate-90'
                      )}
                    />
                  </button>
                  {expandedCategory === category && (
                    <div className="mt-1 space-y-1 pl-2">
                      {phrases.map((phrase, idx) => (
                        <button
                          key={idx}
                          onClick={() => onInsertPhrase(phrase)}
                          className="w-full rounded-md border border-border/30 bg-background/40 px-3 py-2 text-left text-[11px] leading-relaxed text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
                        >
                          {phrase}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="border-t border-border/40 px-4 py-2">
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Click any phrase to insert it into the focused input.
            </p>
          </div>
        </TabsContent>

        {/* History tab */}
        <TabsContent value="history" className="flex-1 min-h-0 flex flex-col">
          {history.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
              <Inbox className="size-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">No saved notes yet</p>
              <p className="text-[10px] leading-relaxed text-muted-foreground/70">
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
                          'rounded-md border bg-background/40 transition-all',
                          isExpanded
                            ? 'border-primary/40 bg-primary/5'
                            : 'border-border/30 hover:border-border/60'
                        )}
                      >
                        <button
                          onClick={() =>
                            setExpandedNoteId(isExpanded ? null : entry.id)
                          }
                          className="flex w-full flex-col gap-0.5 px-3 py-2 text-left"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-medium text-foreground">
                              {entry.customerName || 'Unknown customer'}
                            </span>
                            <span className="shrink-0 text-[9px] uppercase tracking-wider text-muted-foreground">
                              {entry.issueType || '—'}
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {formatTimestamp(entry.timestamp)}
                          </span>
                        </button>
                        {isExpanded && (
                          <div className="border-t border-border/30 px-3 py-2">
                            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-muted-foreground custom-scrollbar">
                              {entry.noteText}
                            </pre>
                            <div className="mt-2 flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                                onClick={() => handleCopyNote(entry.noteText)}
                              >
                                <Copy className="size-3" />
                                Copy
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1.5 text-[10px] text-muted-foreground hover:text-destructive"
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
              <div className="border-t border-border/40 px-3 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full gap-1.5 text-[10px] text-muted-foreground hover:text-destructive"
                  onClick={onClearHistory}
                >
                  <Trash2 className="size-3" />
                  Clear all history
                </Button>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </aside>
  );
}
