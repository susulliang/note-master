import { useState, useMemo, useCallback, useEffect, useRef, type DragEvent, type KeyboardEvent } from 'react';
import {
  Plus,
  ExternalLink,
  Link as LinkIcon,
  Copy,
  Trash2,
  Clock,
  User,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useScopedState } from '@/hooks/use-scoped-state';
import { TicketPanelsContext } from './FlowNode';
import { useContext } from 'react';

/** The five workflow columns, in left-to-right order as specified. */
export const CASE_STATUS_COLUMNS = [
  { id: 'open', label: 'Open', accent: 'text-sky-300', dot: 'bg-sky-400' },
  { id: 'pending', label: 'Pending / Done', accent: 'text-amber-300', dot: 'bg-amber-400' },
  { id: 'escalated', label: 'Escalated', accent: 'text-rose-300', dot: 'bg-rose-400' },
  { id: 'working', label: 'Working', accent: 'text-violet-300', dot: 'bg-violet-400' },
  { id: 'closed', label: 'Closed', accent: 'text-emerald-300', dot: 'bg-emerald-400' },
] as const;

export type CaseStatus = (typeof CASE_STATUS_COLUMNS)[number]['id'];

export interface CaseTrakItem {
  /** Stable dedupe key (digits only — leading zeros don't make a new case) */
  id: string;
  /** Case number exactly as pasted (leading zeros preserved for display) */
  caseNumber: string;
  /** Optional customer name — shown on the card when available */
  customerName?: string | null;
  status: CaseStatus;
  /** Optional direct Salesforce Lightning Case view URL for 1-click open */
  directCaseUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Dedupe key: digits only, so "03741727" and "3741727" are the same case */
function caseKey(token: string): string {
  return token.replace(/\D/g, '').toLowerCase();
}

function isValidLightningCaseUrl(raw: string): boolean {
  if (!/^https?:\/\//i.test(raw)) return false;
  return /(^|\.)(lightning\.force\.com|salesforce\.com|my\.salesforce\.com|force\.com)(\/|:|$)/i.test(raw);
}

/** Format an ISO timestamp for card display: "Sep 3, 14:22" */
function formatCardTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const m = d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${m} ${hh}:${mm}`;
  } catch {
    return '';
  }
}

const STORAGE_KEY = 'ecovacs_case_trak_v1';
/** Legacy 24h tracker key — we migrate its cases on first load. */
const LEGACY_KEY = 'ecovacs_ticket_24h_tracker';

/**
 * CASE TRAK — a Jira-style kanban board that replaces the old Over-24h
 * tracker. Cases are cards that the agent drags between five status
 * columns: Open · Pending/Done · Escalated · Working · Closed. Each card
 * shows the case number, customer name (when known), and the
 * last-modified / added timestamp. Data persists in localStorage so a
 * refresh mid-shift keeps the board state.
 */
export default function CaseTrakBoard() {
  const [items, setItems] = useScopedState<CaseTrakItem[]>(STORAGE_KEY, []);
  const [input, setInput] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<CaseStatus | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<string | null>(null);
  const [customerDraft, setCustomerDraft] = useState('');
  const panelsCtx = useContext(TicketPanelsContext);
  const openCase = panelsCtx?.openCase;
  const hasMigratedRef = useRef(false);

  // Migrate legacy 24h-tracker cases into the new board (one-time, on mount).
  useEffect(() => {
    if (hasMigratedRef.current) return;
    hasMigratedRef.current = true;
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      if (!raw) return;
      const legacy = JSON.parse(raw) as Array<{
        key: string; number: string; status: string; directCaseUrl?: string | null;
      }>;
      if (!Array.isArray(legacy) || legacy.length === 0) return;
      setItems((prev) => {
        const existing = new Set(prev.map((c) => c.id));
        const now = new Date().toISOString();
        const migrated = legacy
          .filter((c) => c?.number && !existing.has(caseKey(c.number)))
          .map((c) => ({
            id: caseKey(c.number),
            caseNumber: c.number,
            customerName: null,
            status: 'open' as CaseStatus,
            directCaseUrl: c.directCaseUrl ?? null,
            createdAt: now,
            updatedAt: now,
          }));
        if (migrated.length === 0) return prev;
        toast.success(`Migrated ${migrated.length} case${migrated.length === 1 ? '' : 's'} from the old 24h tracker.`);
        return [...prev, ...migrated];
      });
    } catch {
      /* ignore malformed legacy data */
    }
  }, [setItems]);

  const addCases = useCallback((raw: string) => {
    const tokens = raw
      .split(/[\s,;]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && /\d/.test(t));
    if (tokens.length === 0) return;

    setItems((prev) => {
      const seen = new Set(prev.map((c) => c.id));
      const now = new Date().toISOString();
      const added: CaseTrakItem[] = [];
      for (const token of tokens) {
        const cnMatch = token.match(/\b(\d{7,})\b/);
        const looksUrl = /^https?:\/\//i.test(token);
        const caseNumber = cnMatch ? cnMatch[1] : token.replace(/\D/g, '');
        if (!caseNumber || caseNumber.length < 7) continue;
        const id = caseKey(caseNumber);
        if (seen.has(id)) {
          if (looksUrl && isValidLightningCaseUrl(token)) {
            return prev.map((c) =>
              c.id === id ? { ...c, directCaseUrl: token, updatedAt: now } : c
            );
          }
          continue;
        }
        seen.add(id);
        added.push({
          id,
          caseNumber,
          customerName: null,
          status: 'open',
          directCaseUrl: looksUrl && isValidLightningCaseUrl(token) ? token : null,
          createdAt: now,
          updatedAt: now,
        });
      }
      if (added.length === 0) {
        toast.info('All cases were already on the board');
        return prev;
      }
      return [...prev, ...added];
    });
  }, [setItems]);

  const handleInputKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      addCases(input);
      setInput('');
    }
  };

  const moveCase = useCallback((id: string, status: CaseStatus) => {
    setItems((prev) =>
      prev.map((c) =>
        c.id === id && c.status !== status
          ? { ...c, status, updatedAt: new Date().toISOString() }
          : c
      )
    );
  }, [setItems]);

  const removeCase = useCallback((id: string) => {
    setItems((prev) => prev.filter((c) => c.id !== id));
  }, [setItems]);

  const setCustomerName = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    setItems((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, customerName: trimmed || null, updatedAt: new Date().toISOString() }
          : c
      )
    );
  }, [setItems]);

  const setDirectCaseUrl = useCallback((id: string) => {
    setItems((prev) => {
      const c = prev.find((x) => x.id === id);
      if (!c) return prev;
      const result = window.prompt(
        `Paste the full Salesforce Lightning Case URL for ${c.caseNumber}.\nExample: https://ecovacs2020.lightning.force.com/lightning/r/Case/500aV…/view`,
        c.directCaseUrl || ''
      );
      if (result == null) return prev;
      const trimmed = result.trim();
      if (!trimmed) {
        toast.info(`Cleared URL for ${c.caseNumber}`);
        return prev.map((x) => (x.id === id ? { ...x, directCaseUrl: null, updatedAt: new Date().toISOString() } : x));
      }
      if (!isValidLightningCaseUrl(trimmed)) {
        toast.error('That URL does not look like a Salesforce/Lightning org.');
        return prev;
      }
      toast.success(`Saved direct URL for ${c.caseNumber}`);
      return prev.map((x) => (x.id === id ? { ...x, directCaseUrl: trimmed, updatedAt: new Date().toISOString() } : x));
    });
  }, [setItems]);

  const doOpenOne = useCallback(async (c: CaseTrakItem, opts: { newTab?: boolean } = {}) => {
    const r = await openCase?.({
      caseNumber: c.caseNumber,
      directUrl: c.directCaseUrl ?? undefined,
      newTab: opts.newTab ?? false,
    }) ?? { ok: false, error: 'Open function unavailable.' };
    if (r.ok) {
      toast.success(
        c.directCaseUrl
          ? `Opened ${c.caseNumber} (direct URL) · ${r.navigated === 'new' ? 'new tab' : 'reused SF tab'}`
          : `Opened ${c.caseNumber} in Console search · ${r.navigated === 'new' ? 'new tab' : 'reused SF tab'}${!c.directCaseUrl ? ' (save a direct Lightning URL for 1-click open next time)' : ''}`
      );
      return;
    }
    toast.error(r.error || `Couldn't open case ${c.caseNumber}.`);
  }, [openCase]);

  // --- Drag handlers -------------------------------------------------------
  const onDragStart = (e: DragEvent<HTMLDivElement>, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };
  const onDragEnd = () => {
    setDragId(null);
    setDragOverCol(null);
  };
  const onDragOverCol = (e: DragEvent<HTMLDivElement>, col: CaseStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(col);
  };
  const onDropCol = (e: DragEvent<HTMLDivElement>, col: CaseStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || dragId;
    if (id) moveCase(id, col);
    setDragId(null);
    setDragOverCol(null);
  };

  const byStatus = useMemo(() => {
    const map = new Map<CaseStatus, CaseTrakItem[]>();
    for (const col of CASE_STATUS_COLUMNS) map.set(col.id, []);
    for (const c of items) (map.get(c.status) ?? map.get('open'))!.push(c);
    return map;
  }, [items]);

  const totalCount = items.length;

  /** Export all cases as one "CASE_NUMBER STATUS" line each — the same
   *  flat-text format the old Over-24h Tracker produced for the report. */
  const handleCopyStatus = useCallback(async () => {
    if (items.length === 0) return;
    const labelFor = (s: CaseStatus) =>
      CASE_STATUS_COLUMNS.find((c) => c.id === s)?.label ?? s;
    const text = items
      .map((c) => `${c.caseNumber} ${labelFor(c.status)}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${items.length} case statuses to clipboard`);
    } catch {
      toast.error('Failed to copy. Please select and copy manually.');
    }
  }, [items]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      {/* Header — no page title (the left-edge pill already says Case Trak).
          Just a count badge + Copy status + Clear board actions. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold text-primary">
          {totalCount} case{totalCount === 1 ? '' : 's'}
        </span>
        <div className="flex items-center gap-2">
          {totalCount > 0 && (
            <button
              type="button"
              onClick={() => void handleCopyStatus()}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/40 px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:border-accent/50 hover:text-accent"
              title="Copy every case number + its status, one per line (same format as the old 24h tracker)"
            >
              <Copy className="size-3" />
              Copy status
            </button>
          )}
          {totalCount > 0 && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Clear all ${totalCount} cases from the board?`)) {
                  setItems([]);
                }
              }}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3" />
              Clear board
            </button>
          )}
        </div>
      </div>

      {/* Paste / add area */}
      <div className="rounded-lg border border-border/60 bg-card/40 p-2.5 backdrop-blur-sm">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            rows={2}
            placeholder="Paste case numbers or Lightning Case URLs, press Enter…"
            spellCheck={false}
            className="min-h-0 flex-1 resize-none rounded-md border border-border/50 bg-foreground/[0.04] px-2 py-1.5 font-mono text-xs text-foreground placeholder:font-sans placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              addCases(input);
              setInput('');
            }}
            disabled={!input.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="size-3.5" />
            Add
          </button>
        </div>
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground/70">
          Numbers can be separated by spaces, commas or new lines — duplicates are skipped.
          Drag a card between columns to change its status.
        </p>
      </div>

      {/* Board — 5 columns, horizontally scrollable */}
      <div className="custom-scrollbar flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
        {CASE_STATUS_COLUMNS.map((col) => {
          const colItems = byStatus.get(col.id) ?? [];
          const isOver = dragOverCol === col.id;
          return (
            <div
              key={col.id}
              onDragOver={(e) => onDragOverCol(e, col.id)}
              onDragLeave={() => setDragOverCol((prev) => (prev === col.id ? null : prev))}
              onDrop={(e) => onDropCol(e, col.id)}
              className={cn(
                'flex min-h-0 w-[280px] shrink-0 flex-col rounded-xl border transition-colors',
                isOver
                  ? 'border-accent/60 bg-accent/[0.06]'
                  : 'border-border/60 bg-card/20'
              )}
            >
              {/* Column header */}
              <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
                <span className={cn('size-2 rounded-full', col.dot)} />
                <span className={cn('text-[11px] font-extrabold uppercase tracking-wider', col.accent)}>
                  {col.label}
                </span>
                <span className="ml-auto rounded-full bg-foreground/10 px-1.5 text-[10px] font-bold text-muted-foreground">
                  {colItems.length}
                </span>
              </div>

              {/* Cards */}
              <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
                {colItems.length === 0 && (
                  <div className="flex flex-1 items-center justify-center py-6 text-center">
                    <p className="text-[10px] text-muted-foreground/50">
                      {isOver ? 'Drop here' : 'No cases'}
                    </p>
                  </div>
                )}
                {colItems.map((c) => {
                  const isDragging = dragId === c.id;
                  return (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, c.id)}
                      onDragEnd={onDragEnd}
                      className={cn(
                        'group cursor-grab rounded-lg border border-border/50 bg-card/70 p-2.5 shadow-sm backdrop-blur-sm transition-all active:cursor-grabbing',
                        'hover:border-foreground/20 hover:shadow-md',
                        isDragging && 'opacity-40 ring-2 ring-accent/50'
                      )}
                    >
                      {/* Case number */}
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            'font-mono text-sm font-bold tabular-nums text-foreground',
                            c.directCaseUrl ? 'cursor-pointer hover:underline underline-offset-2' : ''
                          )}
                          onClick={c.directCaseUrl ? () => void doOpenOne(c) : undefined}
                          title={
                            c.directCaseUrl
                              ? `Open ${c.caseNumber} via saved direct URL`
                              : openCase
                                ? `Open ${c.caseNumber} in Salesforce Console`
                                : 'Save a direct Lightning URL or enable the extension to open cases.'
                          }
                        >
                          {c.caseNumber}
                          {c.directCaseUrl && (
                            <LinkIcon className="ml-1 inline size-2.5 align-[-3px] text-accent opacity-70" />
                          )}
                        </span>
                        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => void doOpenOne(c)}
                            className="flex size-5 items-center justify-center rounded-full text-accent/80 transition-colors hover:bg-accent/15 hover:text-accent"
                            aria-label={`Open case ${c.caseNumber} in Salesforce`}
                            title="Open in Salesforce"
                            disabled={!openCase && !c.directCaseUrl}
                          >
                            <ExternalLink className="size-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDirectCaseUrl(c.id)}
                            className="flex size-5 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-foreground/10 hover:text-foreground"
                            aria-label={`Paste direct Lightning URL for ${c.caseNumber}`}
                            title={c.directCaseUrl ? 'Update saved direct URL' : 'Paste a direct Lightning Case URL'}
                          >
                            <LinkIcon className="size-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeCase(c.id)}
                            className="flex size-5 items-center justify-center rounded-full text-muted-foreground/50 transition-colors hover:bg-destructive/15 hover:text-destructive"
                            aria-label={`Remove case ${c.caseNumber}`}
                            title="Remove case"
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      </div>

                      {/* Customer name — editable inline */}
                      <div className="mt-1.5">
                        {editingCustomer === c.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              autoFocus
                              value={customerDraft}
                              onChange={(e) => setCustomerDraft(e.target.value)}
                              onBlur={() => {
                                setCustomerName(c.id, customerDraft);
                                setEditingCustomer(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  setCustomerName(c.id, customerDraft);
                                  setEditingCustomer(null);
                                } else if (e.key === 'Escape') {
                                  setEditingCustomer(null);
                                }
                              }}
                              placeholder="Customer name…"
                              className="h-6 w-full rounded border border-accent/50 bg-foreground/[0.04] px-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                            />
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setCustomerDraft(c.customerName || '');
                              setEditingCustomer(c.id);
                            }}
                            className="flex w-full items-center gap-1 text-left"
                            title="Click to set customer name"
                          >
                            <User className="size-3 shrink-0 text-muted-foreground/50" />
                            <span className={cn(
                              'truncate text-[11px]',
                              c.customerName ? 'font-semibold text-foreground/90' : 'italic text-muted-foreground/50'
                            )}>
                              {c.customerName || 'Add customer name'}
                            </span>
                          </button>
                        )}
                      </div>

                      {/* Timestamp */}
                      <div className="mt-1.5 flex items-center gap-1 text-[9px] text-muted-foreground/60">
                        <Clock className="size-2.5" />
                        <span>
                          {c.updatedAt !== c.createdAt ? 'Updated ' : 'Added '}
                          {formatCardTime(c.updatedAt)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
