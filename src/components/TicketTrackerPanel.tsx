import { useState, type KeyboardEvent } from 'react';
import { Clock, Copy, ClipboardList, Link as LinkIcon, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useScopedState } from '@/hooks/use-scoped-state';
import { TicketPanelsContext } from './FlowNode';
import { useContext, useCallback, useEffect, useRef } from 'react';

/** Quick statuses for an over-24h case — the chips on each row */
const STATUS_OPTIONS = ['OVER', 'D', 'KO', 'WINNIE', 'DTC', 'WO', 'CLOSED'] as const;
type TrackerStatus = (typeof STATUS_OPTIONS)[number];

/** One tracked case: the number as pasted + its current status +
 *  optional direct Lightning view URL (from a Salesforce Case page).
 *  When a `directCaseUrl` is set, the "Open" button opens EXACTLY that
 *  URL (works the same whether the extension is installed or not, because
 *  the app falls back to `window.open()` for direct URLs).  When null we
 *  ask the extension to do a Console global search on the case number —
 *  requires at least 1 Ecovacs Salesforce tab to be open so the helper
 *  can pick up the org base URL. */
interface TrackedCase {
  /** Stable dedupe key (digits only — leading zeros don't make a new case) */
  key: string;
  /** Case number exactly as pasted (leading zeros preserved for the copy format) */
  number: string;
  status: TrackerStatus;
  directCaseUrl?: string | null;
}

interface TicketTrackerPanelProps {
  /** @deprecated Panel is now a permanent draggable canvas node; close button removed. */
  onClose?: () => void;
}

/** Dedupe key: digits only, so "03741727" and "3741727" are the same case */
function caseKey(token: string): string {
  return token.replace(/\D/g, '').toLowerCase();
}
function isValidLightningCaseUrl(raw: string): boolean {
  if (!/^https?:\/\//i.test(raw)) return false;
  // Allowed hosts: lightning.force.com / salesforce / my.salesforce / force.com / branded console
  return /(^|\.)(lightning\.force\.com|salesforce\.com|my\.salesforce\.com|force\.com)(\/|:|$)/i.test(raw);
}
/** Old chip labels → current labels (persisted rows may predate a rename). */
const STATUS_MIGRATION: Record<string, TrackerStatus> = {
  Over: 'OVER',
  ELMA: 'WINNIE',
};

/**
 * OVER 24H TICKET TRACKER — a side tool toggled by the clock icon in the
 * floating toolbar. The agent pastes a block of case numbers, presses
 * Enter, and every case becomes a row with quick status chips (OVER / D /
 * KO / WINNIE / DTC / WO / CLOSED). "Copy" emits one "CASE STATUS" line per case —
 * the exact format the over-24h report expects — and "Reset" clears the
 * sheet. The list persists in localStorage so a refresh mid-shift keeps
 * the statuses.
 *
 * NEW: every row can now "Open in Salesforce Console" directly from the
 * ticket app.  The call goes through the Ecovacs Note Helper extension:
 * the extension resolves the org base URL (from any open Salesforce tab
 * it has scraped) and either navigates or focuses the tab for you.  Two
 * open strategies:
 *   - case-number search: when NO directCaseUrl is saved, the extension
 *     does a Lightning Console global search scoped to Case records for
 *     that exact 8-digit number → unique matches open the case page.
 *   - direct URL: if the agent "Pastes a Lightning Case URL" on the row,
 *     the extension opens EXACTLY that URL (e.g.
 *     `https://ecovacs2020.lightning.force.com/lightning/r/Case/500aV…/view`
 *     — the 500… record id deep link, which is 100% reliable).  This path
 *     also has a pure-browser `window.open` fallback so it works even
 *     when the extension isn't connected.
 */
export default function TicketTrackerPanel(_props: TicketTrackerPanelProps) {
  const [cases, setCases] = useScopedState<TrackedCase[]>('ecovacs_ticket_24h_tracker', []);
  // One-time migration: persisted rows may carry pre-rename status labels.
  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current) return;
    migratedRef.current = true;
    setCases((prev) =>
      prev.some((c) => c.status in STATUS_MIGRATION)
        ? prev.map((c) => ({ ...c, status: STATUS_MIGRATION[c.status] ?? c.status }))
        : prev
    );
  }, [setCases]);
  const [input, setInput] = useState('');
  const panelsCtx = useContext(TicketPanelsContext);
  const openCase = panelsCtx?.openCase;

  /** Parse the pasted text into new case rows (deduped, order preserved).
   *  Accepts both bare 8-digit case numbers and full lightning Case view
   *  URLs — when a URL is pasted, the 8-digit case (if present) is added
   *  with its `directCaseUrl` pre-assigned so the Open button opens that
   *  exact deep link. */
  const addCases = (raw: string): void => {
    const tokens = raw
      .split(/[\s,;]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && /\d/.test(t));
    if (tokens.length === 0) return;

    const seen = new Set(cases.map((c) => c.key));
    const added: TrackedCase[] = [];
    for (const token of tokens) {
      // Pull out first 8+-digit case number that looks like a display number.
      const cnMatch = token.match(/\b(\d{7,})\b/);
      const looksUrl = /^https?:\/\//i.test(token);
      let caseNumber = cnMatch ? cnMatch[1] : token.replace(/\D/g, '');
      if (!caseNumber || caseNumber.length < 7) continue;
      const key = caseKey(caseNumber);
      if (seen.has(key)) {
        // If the user passed a URL for a case that's already on the list,
        // update its saved URL so they don't have to re-paste.
        if (looksUrl && isValidLightningCaseUrl(token)) {
          setCases((prev) => prev.map((c) => (c.key === key ? { ...c, directCaseUrl: token } : c)));
        }
        continue;
      }
      seen.add(key);
      added.push({
        key,
        number: caseNumber,
        status: 'OVER',
        directCaseUrl: looksUrl && isValidLightningCaseUrl(token) ? token : null,
      });
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

  /** Open one case: prefers directCaseUrl, falls back to Console search via extension. */
  const doOpenOne = useCallback(async (c: TrackedCase, opts: { newTab?: boolean } = {}): Promise<void> => {
    const r = await openCase?.({
      caseNumber: c.number,
      directUrl: c.directCaseUrl ?? undefined,
      newTab: opts.newTab ?? false,
    }) ?? { ok: false, error: 'Open function unavailable.' };
    if (r.ok) {
      toast.success(
        c.directCaseUrl
          ? `Opened ${c.number} (direct URL) · ${r.navigated === 'new' ? 'new tab' : 'reused SF tab'}`
          : `Opened ${c.number} in Console search · ${r.navigated === 'new' ? 'new tab' : 'reused SF tab'}${!c.directCaseUrl ? ' (save a direct Lightning URL for 1-click open next time)' : ''}`
      );
      return;
    }
    toast.error(r.error || `Couldn't open case ${c.number}.`);
  }, [openCase]);

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
    <div className="flex min-h-[340px] flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-foreground/10 px-3 py-2.5">
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
          placeholder="Paste case numbers, or full Lightning Case URLs, press Enter…"
          spellCheck={false}
          className="w-full resize-none rounded-md border border-border/50 bg-foreground/[0.04] px-2 py-1.5 font-mono text-xs text-foreground placeholder:font-sans placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none"
        />
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground/70">
          Numbers can be separated by spaces, commas or new lines — duplicates are skipped.
          Paste a full <code className="rounded bg-foreground/5 px-1 font-mono text-[10px]">/lightning/r/Case/…</code> URL to store the exact deep-link on the row.
        </p>
      </div>

      {/* Case table */}
      {cases.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <ClipboardList className="size-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No cases tracked yet</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground/70">
            Paste your over-24h case list above and press Enter to start tracking statuses.
            Paste a full Case view URL next to a number to get 1-click Console open.
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
              <span
                className={cn(
                  'font-mono text-xs tabular-nums text-foreground',
                  c.directCaseUrl ? 'cursor-pointer hover:underline underline-offset-2' : ''
                )}
                onClick={c.directCaseUrl ? () => void doOpenOne(c) : undefined}
                title={
                  c.directCaseUrl
                    ? `Open ${c.number} via saved direct URL (${c.directCaseUrl})`
                    : openCase
                      ? `Click to do a Console search for ${c.number}. Tip: 🔗 Paste a direct URL for 100% reliable deep-linking.`
                      : 'Save a direct Lightning Case URL or enable the Ecovacs Note Helper extension to open cases from here.'
                }
              >
                {c.number}
                {c.directCaseUrl && <LinkIcon className="ml-1 inline size-2.5 align-[-3px] text-accent opacity-70" />}
              </span>
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
              <div className="flex items-center">
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
