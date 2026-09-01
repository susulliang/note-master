import { useState, type KeyboardEvent } from 'react';
import { Clock, Copy, ClipboardList, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useScopedState } from '@/hooks/use-scoped-state';

/** Quick statuses for an over-24h case — the chips on each row */
const STATUS_OPTIONS = ['Over', 'D', 'KO', 'ELMA', 'DTC', 'WO'] as const;
type TrackerStatus = (typeof STATUS_OPTIONS)[number];

/** One tracked case: the number as pasted + its current status */
interface TrackedCase {
  /** Stable dedupe key (digits only — leading zeros don't make a new case) */
  key: string;
  /** Case number exactly as pasted (leading zeros preserved for the copy format) */
  number: string;
  status: TrackerStatus;
}

interface TicketTrackerPanelProps {
  /** @deprecated Panel is now a permanent draggable canvas node; close button removed. */
  onClose?: () => void;
}

/** Dedupe key: digits only, so "03741727" and "3741727" are the same case */
function caseKey(token: string): string {
  return token.replace(/\D/g, '').toLowerCase();
}

/**
 * OVER 24H TICKET TRACKER — a side tool toggled by the clock icon in the
 * floating toolbar. The agent pastes a block of case numbers, presses
 * Enter, and every case becomes a row with quick status chips (Over / D /
 * KO / ELMA / DTC / WO). "Copy" emits one "CASE STATUS" line per case —
 * the exact format the over-24h report expects — and "Reset" clears the
 * sheet. The list persists in localStorage so a refresh mid-shift keeps
 * the statuses.
 */
export default function TicketTrackerPanel(_props: TicketTrackerPanelProps) {
  const [cases, setCases] = useScopedState<TrackedCase[]>('ecovacs_ticket_24h_tracker', []);
  const [input, setInput] = useState('');

  /** Parse the pasted text into new case rows (deduped, order preserved) */
  const addCases = (raw: string): void => {
    const tokens = raw
      .split(/[\s,;]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && /\d/.test(t));
    if (tokens.length === 0) return;

    const seen = new Set(cases.map((c) => c.key));
    const added: TrackedCase[] = [];
    for (const token of tokens) {
      const key = caseKey(token);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      added.push({ key, number: token, status: 'Over' });
    }
    if (added.length > 0) setCases([...cases, ...added]);
    else toast.info('All cases were already on the list');
  };

  const handleInputKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      addCases(input);
      setInput('');
    }
  };

  const setStatus = (key: string, status: TrackerStatus): void => {
    setCases((prev) => prev.map((c) => (c.key === key ? { ...c, status } : c)));
  };

  const removeCase = (key: string): void => {
    setCases((prev) => prev.filter((c) => c.key !== key));
  };

  const handleCopy = async (): Promise<void> => {
    if (cases.length === 0) return;
    const text = cases.map((c) => `${c.number} ${c.status}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${cases.length} cases to clipboard`);
    } catch {
      toast.error('Failed to copy. Please select and copy manually.');
    }
  };

  const handleReset = (): void => {
    setCases([]);
    setInput('');
  };

  return (
    <div className="glass-panel flex h-full w-full min-h-[340px] flex-col overflow-hidden rounded-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-foreground/10 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Over 24H Tracker
          </span>
          {cases.length > 0 && (
            <span className="rounded-full bg-primary/20 px-1.5 text-[10px] font-semibold text-primary">
              {cases.length}
            </span>
          )}
        </div>
      </div>

      {/* Paste area */}
      <div className="border-b border-foreground/10 p-2.5">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleInputKeyDown}
          rows={2}
          placeholder="Paste case numbers here, then press Enter…"
          spellCheck={false}
          className="w-full resize-none rounded-md border border-border/50 bg-foreground/[0.04] px-2 py-1.5 font-mono text-xs text-foreground placeholder:font-sans placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none"
        />
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground/70">
          Numbers can be separated by spaces, commas or new lines — duplicates are skipped.
        </p>
      </div>

      {/* Case table */}
      {cases.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <ClipboardList className="size-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No cases tracked yet</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground/70">
            Paste your over-24h case list above and press Enter to start tracking statuses.
          </p>
        </div>
      ) : (
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
          {/* Table header */}
          <div className="sticky top-0 z-[1] grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-foreground/10 bg-card/95 px-3 py-1.5 backdrop-blur-sm">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Case #
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Status
            </span>
            <span className="w-4" aria-hidden="true" />
          </div>
          {cases.map((c) => (
            <div
              key={c.key}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-foreground/5 px-3 py-1.5 hover:bg-foreground/[0.03]"
            >
              <span className="font-mono text-xs tabular-nums text-foreground">{c.number}</span>
              <div className="flex items-center gap-0.5">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(c.key, s)}
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none transition-colors',
                      c.status === s
                        ? 'bg-primary/20 text-primary'
                        : 'text-muted-foreground/70 hover:bg-foreground/10 hover:text-foreground'
                    )}
                    title={`Mark ${c.number} as ${s}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => removeCase(c.key)}
                className="flex size-4 items-center justify-center rounded-full text-muted-foreground/50 transition-colors hover:bg-destructive/15 hover:text-destructive"
                aria-label={`Remove case ${c.number}`}
                title={`Remove ${c.number}`}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center gap-2 border-t border-foreground/10 p-2.5">
        <Button
          variant="default"
          size="sm"
          disabled={cases.length === 0}
          onClick={handleCopy}
          className="h-7 flex-1 gap-1.5 rounded-full text-[11px]"
          title="Copy the list as one CASE STATUS line per case"
        >
          <Copy className="size-3.5" />
          Copy
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={cases.length === 0 && input.length === 0}
          onClick={handleReset}
          className="h-7 gap-1.5 rounded-full text-[11px]"
          title="Clear all tracked cases"
        >
          <RotateCcw className="size-3.5" />
          Reset
        </Button>
      </div>
    </div>
  );
}
