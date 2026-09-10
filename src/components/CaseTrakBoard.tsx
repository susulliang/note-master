import { useState, useMemo, useCallback, useEffect, useRef, type DragEvent } from 'react';
import {
  Plus,
  ExternalLink,
  Link as LinkIcon,
  Copy,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useScopedState } from '@/hooks/use-scoped-state';
import type { ReportCaseRecord, ReportImportMeta } from '@/hooks/use-ccp-extension-bridge';
import { TicketPanelsContext } from './FlowNode';
import { useContext } from 'react';

/** Rotating palette for columns. */
const COLUMN_PALETTE = [
  { accent: 'text-sky-300', dot: 'bg-sky-400' },
  { accent: 'text-amber-300', dot: 'bg-amber-400' },
  { accent: 'text-rose-300', dot: 'bg-rose-400' },
  { accent: 'text-violet-300', dot: 'bg-violet-400' },
  { accent: 'text-emerald-300', dot: 'bg-emerald-400' },
  { accent: 'text-cyan-300', dot: 'bg-cyan-400' },
  { accent: 'text-orange-300', dot: 'bg-orange-400' },
  { accent: 'text-pink-300', dot: 'bg-pink-400' },
];

/** Default team columns. First column is "hoi"; the rest are team-member
 *  names so each agent gets a dedicated column. The board wraps these into
 *  two rows. */
const DEFAULT_COLUMN_NAMES = [
  'hoi',
  'Dagen', 'Ronald', 'Boris', 'Vitto', 'Lynn', 'Jacky', 'TQ', 'Alan',
  'Dezzy', 'Kevin X', 'Laura', 'Jun', 'Kira', 'Pyro', 'Jim', 'Charsan',
  'Patrick', 'Ruby', 'Hawks', 'Yison', 'Jason', 'Jenson', 'Kevin W',
  'Rachel', 'Trent', 'Tony', 'Stanley', 'Jing',
];

/** Default workflow columns, in left-to-right order. Agents can rename,
 *  add, or delete columns (see header controls); choices persist to
 *  localStorage. */
export const DEFAULT_CASE_COLUMNS: BoardColumn[] = DEFAULT_COLUMN_NAMES.map(
  (name, i) => ({
    id: name.toLowerCase().replace(/\s+/g, '_'),
    label: name,
    ...COLUMN_PALETTE[i % COLUMN_PALETTE.length],
  })
);

/** A board column — `id` is stable (used as the case status), `label` is
 *  user-editable. `accent`/`dot` are Tailwind classes picked from a small
 *  palette so custom columns still look on-theme. */
export interface BoardColumn {
  id: string;
  label: string;
  accent: string;
  dot: string;
}

/** Case status is now a free-form string because columns can be added. */
export type CaseStatus = string;

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
  // --- Fields scraped from the Salesforce "[OVER24]" report (extension
  //     popup button "Import Over 24h Report Cases"). Rendered as tiny
  //     label/value rows on the card. ---
  /** Report column "Case Owner" */
  caseOwner?: string | null;
  /** Report column "Status" (raw Salesforce value, e.g. Open / Working) */
  reportStatus?: string | null;
  /** Report column "Date/Time Opened" */
  dateTimeOpened?: string | null;
  /** Report column "Case Last Modified Date" */
  lastModifiedDate?: string | null;
  /** Report column "Customer Last Reply Time" */
  customerLastReplyTime?: string | null;
}

/** One "[OVER24]" report import batch received from the extension. */
export interface CaseReportImportBatch {
  cases: ReportCaseRecord[];
  meta: ReportImportMeta;
  /** Monotonic per-batch id so remounts can tell batches apart. */
  nonce: number;
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

/** Tiny status color for the report-scraped SF status shown on cards. */
function reportStatusColor(status: string): string {
  const s = status.trim().toLowerCase();
  if (s === 'open') return 'text-sky-300';
  if (s === 'working') return 'text-violet-300';
  if (s === 'escalated') return 'text-rose-300';
  if (s === 'pending' || s === 'pending/done') return 'text-amber-300';
  if (s === 'closed') return 'text-emerald-300';
  return 'text-foreground/80';
}

/** Escape a string for safe inclusion in a text/html clipboard payload. */
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STORAGE_KEY = 'ecovacs_case_trak_v1';
const COLUMNS_STORAGE_KEY = 'ecovacs_case_trak_columns_v1';
/** Legacy 24h tracker key — we migrate its cases on first load. */
const LEGACY_KEY = 'ecovacs_ticket_24h_tracker';

/**
 * CASE TRAK — a Jira-style kanban board that replaces the old Over-24h
 * tracker. Cases are cards that the agent drags between five status
 * columns: Open · Pending/Done · Escalated · Working · Closed. Each card
 * shows the case number, customer name (when known), and the
 * last-modified / added timestamp. Data persists in localStorage so a
 * refresh mid-shift keeps the board state.
 *
 * `reportImports` receives "[OVER24]" report batches scraped by the
 * browser extension (popup button "Import Over 24h Report Cases"). New
 * cases land in the Open queue with every scraped label (owner, status,
 * opened / modified / customer-last-reply timestamps) rendered on the
 * card in tiny type; existing cards get their report fields refreshed
 * without touching the agent's chosen board status.
 */
export default function CaseTrakBoard({
  reportImports,
  scrapeOver24,
  connected,
}: {
  reportImports?: CaseReportImportBatch[];
  scrapeOver24?: () => Promise<any>;
  connected?: boolean;
}) {
  const [items, setItems] = useScopedState<CaseTrakItem[]>(STORAGE_KEY, []);
  const [columns, setColumns] = useScopedState<BoardColumn[]>(COLUMNS_STORAGE_KEY, [...DEFAULT_CASE_COLUMNS] as BoardColumn[]);
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [colLabelDraft, setColLabelDraft] = useState('');
  const [scraping, setScraping] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<CaseStatus | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<string | null>(null);
  const [customerDraft, setCustomerDraft] = useState('');
  // Hover tooltip state — bubble appears only after the pointer has stayed on
  // a card for > 1s (matches the "hover for over 1 second" requirement).
  const [hoveredCase, setHoveredCase] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // --- "[OVER24]" report imports (extension popup button) ----------------
  // Merge every not-yet-processed batch into the board. New cases go to
  // the Open queue; existing cards only get their report fields refreshed
  // (the agent's chosen board status is never overwritten). Re-running a
  // batch after a remount is idempotent and toast-free because nothing
  // changes the second time.
  const processedImportRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!reportImports || reportImports.length === 0) return;
    const pending = reportImports.filter(
      (b) => Array.isArray(b.cases) && b.cases.length > 0 && !processedImportRef.current.has(b.nonce)
    );
    if (pending.length === 0) return;
    const now = new Date().toISOString();
    for (const batch of pending) processedImportRef.current.add(batch.nonce);
    setItems((prev) => {
      const next = [...prev];
      const index = new Map(next.map((c, i) => [c.id, i] as const));
      const counts = { added: 0, updated: 0 };
      for (const batch of pending) {
        for (const rc of batch.cases) {
          const caseNumber = String(rc.caseNumber ?? '').trim();
          if (!/\d{5,}/.test(caseNumber)) continue;
          const id = caseKey(caseNumber);
          const caseUrl = rc.caseUrl && isValidLightningCaseUrl(rc.caseUrl) ? rc.caseUrl : null;
          const owner = rc.caseOwner?.trim() || null;
          const reportStatus = rc.status?.trim() || null;
          const opened = rc.dateTimeOpened?.trim() || null;
          const modified = rc.lastModifiedDate?.trim() || null;
          const lastReply = rc.customerLastReplyTime?.trim() || null;
          const customer = rc.contactAccountName?.trim() || null;
          const at = index.get(id);
          if (at === undefined) {
            counts.added += 1;
            index.set(id, next.length);
            next.push({
              id,
              caseNumber,
              customerName: customer,
              status: 'open',
              directCaseUrl: caseUrl,
              caseOwner: owner,
              reportStatus,
              dateTimeOpened: opened,
              lastModifiedDate: modified,
              customerLastReplyTime: lastReply,
              createdAt: now,
              updatedAt: now,
            });
            continue;
          }
          const existing = next[at];
          const merged: CaseTrakItem = { ...existing };
          let changed = false;
          const setIf = <K extends keyof CaseTrakItem>(key: K, value: CaseTrakItem[K]) => {
            if (value && merged[key] !== value) { merged[key] = value; changed = true; }
          };
          setIf('customerName', customer);
          setIf('caseOwner', owner);
          setIf('reportStatus', reportStatus);
          setIf('dateTimeOpened', opened);
          setIf('lastModifiedDate', modified);
          setIf('customerLastReplyTime', lastReply);
          // Never overwrite a saved direct URL — only fill it in.
          if (caseUrl && !merged.directCaseUrl) { merged.directCaseUrl = caseUrl; changed = true; }
          if (changed) {
            merged.updatedAt = now;
            counts.updated += 1;
            next[at] = merged;
          }
        }
      }
      if (counts.added > 0 || counts.updated > 0) {
        const source = pending[0]?.meta?.reportName || 'Over-24h report';
        toast.success(
          `${source}: ${counts.added} new case${counts.added === 1 ? '' : 's'} added, ${counts.updated} refreshed on the board.`
        );
      }
      return counts.added > 0 || counts.updated > 0 ? next : prev;
    });
  }, [reportImports, setItems]);

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
    const firstId = columns[0]?.id ?? 'open';
    for (const col of columns) map.set(col.id, []);
    for (const c of items) {
      const bucket = map.has(c.status) ? c.status : firstId;
      (map.get(bucket) ?? map.get(firstId))!.push(c);
    }
    return map;
  }, [items, columns]);

  const totalCount = items.length;

  /** Export all cases as one "CASE_NUMBER STATUS" line each — the same
   *  flat-text format the old Over-24h Tracker produced for the report. */
  const handleCopyStatus = useCallback(async () => {
    if (items.length === 0) return;

    // Build rich-text output grouped by column (in column order).
    //   <b>Column Name</b>
    //   CASE_NUMBER [Owner Name]
    //   ...
    const htmlParts: string[] = [];
    const plainParts: string[] = [];
    for (const col of columns) {
      const colItems = byStatus.get(col.id) ?? [];
      if (colItems.length === 0) continue;
      htmlParts.push(`<b>${escapeHtml(col.label)}</b>`);
      plainParts.push(`${col.label}:`);
      for (const c of colItems) {
        const owner = c.caseOwner ? ` [${c.caseOwner}]` : '';
        htmlParts.push(`${escapeHtml(c.caseNumber)}${escapeHtml(owner)}`);
        plainParts.push(`${c.caseNumber}${owner}`);
      }
      htmlParts.push('');
      plainParts.push('');
    }
    const html = htmlParts.join('<br>');
    const plain = plainParts.join('\n').trim();

    try {
      // Prefer rich-text copy (ClipboardItem with text/html) so pasting into
      // email/docs keeps the bold column headers. Fall back to plain text.
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([plain], { type: 'text/plain' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      toast.success(`Copied ${items.length} case${items.length === 1 ? '' : 's'} (grouped by column)`);
    } catch {
      // Last-resort fallback: copy the HTML source as text.
      try {
        await navigator.clipboard.writeText(plain);
        toast.success(`Copied ${items.length} case${items.length === 1 ? '' : 's'}`);
      } catch {
        toast.error('Failed to copy. Please select and copy manually.');
      }
    }
  }, [items, columns, byStatus]);

  // --- Column management: rename / add / delete ---------------------------
  const startRenameCol = (col: BoardColumn) => {
    setEditingColId(col.id);
    setColLabelDraft(col.label);
  };
  const commitRenameCol = () => {
    if (editingColId == null) return;
    const label = colLabelDraft.trim();
    if (label) {
      setColumns((prev) => prev.map((c) => (c.id === editingColId ? { ...c, label } : c)));
    }
    setEditingColId(null);
    setColLabelDraft('');
  };
  const cancelRenameCol = () => {
    setEditingColId(null);
    setColLabelDraft('');
  };
  const addColumn = () => {
    const idx = columns.length % COLUMN_PALETTE.length;
    const palette = COLUMN_PALETTE[idx];
    const id = `col_${Date.now().toString(36)}`;
    setColumns((prev) => [...prev, { id, label: 'New Column', ...palette }]);
    toast.info('Added a new column — click its name to rename.');
  };
  const deleteColumn = (colId: string) => {
    setColumns((prev) => {
      if (prev.length <= 1) {
        toast.error('Keep at least one column.');
        return prev;
      }
      const next = prev.filter((c) => c.id !== colId);
      const fallback = next[0]?.id ?? 'open';
      // Move orphaned cases into the first remaining column.
      setItems((its) =>
        its.map((c) => (c.status === colId ? { ...c, status: fallback, updatedAt: new Date().toISOString() } : c))
      );
      toast.info(`Column deleted — its cases moved to "${next[0]?.label}".`);
      return next;
    });
    if (editingColId === colId) cancelRenameCol();
  };

  const resetColumns = () => {
    if (!window.confirm('Reset all columns to the default team layout? Cases stay on the board but orphaned ones move to the first column.')) return;
    const defaults = [...DEFAULT_CASE_COLUMNS];
    const fallback = defaults[0]?.id ?? 'open';
    setColumns(defaults);
    setItems((its) => {
      const validIds = new Set(defaults.map((c) => c.id));
      return its.map((c) =>
        validIds.has(c.status) ? c : { ...c, status: fallback, updatedAt: new Date().toISOString() }
      );
    });
    cancelRenameCol();
    toast.info('Columns reset to default.');
  };

  const handleScrapeOver24 = async () => {
    if (!scrapeOver24) {
      toast.error('Extension bridge not available. Reload the page or re-install the extension.');
      return;
    }
    setScraping(true);
    try {
      const r = await scrapeOver24();
      if (r?.ok) {
        const n = Number(r.count ?? 0);
        const total = r.totalRecords ? ` of ${r.totalRecords}` : '';
        if (r.pushed?.ok) {
          toast.success(`Imported ${n} case${n === 1 ? '' : 's'}${total} → board.`);
        } else {
          toast.warning(`Scraped ${n} case${n === 1 ? '' : 's'}${total}, but the board didn't receive them: ${r.pushed?.error || 'bridge not connected'}.`);
        }
      } else {
        toast.error(r?.error || 'OVER24 scrape failed.');
      }
    } catch (e: any) {
      toast.error(String(e?.message || e));
    } finally {
      setScraping(false);
    }
  };

  // --- Distribute cases across columns ------------------------------------
  // Rules:
  //   - The FIRST column keeps every case whose `caseOwner` matches any
  //     keyword in the first column's name (split on whitespace/slashes/commas).
  //   - All other cases are shuffled and distributed equally (round-robin)
  //     across the REMAINING columns.
  //   - Cases already in the first column because of an owner match stay put.
  const distributeCases = useCallback(() => {
    if (columns.length < 2) {
      toast.error('Need at least 2 columns to distribute.');
      return;
    }
    const firstCol = columns[0];
    const otherCols = columns.slice(1);
    if (otherCols.length === 0) return;

    // Parse the first column's name into lowercased keywords.
    const keywords = firstCol.label
      .toLowerCase()
      .split(/[\s,/|;]+/)
      .map((k) => k.trim())
      .filter(Boolean);

    const now = new Date().toISOString();
    setItems((prev) => {
      // Determine which cases "belong" to the first column (owner match).
      const firstColIds = new Set<string>();
      if (keywords.length > 0) {
        for (const c of prev) {
          const owner = (c.caseOwner || '').toLowerCase();
          if (owner && keywords.some((k) => owner.includes(k))) {
            firstColIds.add(c.id);
          }
        }
      }
      // Shuffle the non-first-column cases.
      const pool = prev
        .filter((c) => !firstColIds.has(c.id))
        .map((c) => ({ c, r: Math.random() }))
        .sort((a, b) => a.r - b.r)
        .map((x) => x.c);

      // Round-robin assign across the other columns.
      const next = prev.map((c) => {
        if (firstColIds.has(c.id)) {
          return c.status === firstCol.id ? c : { ...c, status: firstCol.id, updatedAt: now };
        }
        return c;
      });
      const byId = new Map(next.map((c) => [c.id, c]));
      pool.forEach((c, i) => {
        const target = otherCols[i % otherCols.length].id;
        const cur = byId.get(c.id);
        if (cur && cur.status !== target) byId.set(c.id, { ...cur, status: target, updatedAt: now });
      });
      return Array.from(byId.values());
    });
    toast.info(`Distributed ${items.length} case${items.length === 1 ? '' : 's'} — first column "${firstCol.label}" keeps owner-matched tickets.`);
  }, [columns, items.length]);

  // --- Hover-tooltip handlers ---------------------------------------------
  const startHover = (id: string) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHoveredCase(id), 500);
  };
  const cancelHover = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoveredCase(null);
  };

  return (
    <>
      <style>{`
        @keyframes ct-bubble-in {
          from { opacity: 0; transform: translate(-50%, -4px) scale(0.97); }
          to   { opacity: 1; transform: translate(-50%, 0) scale(1); }
        }
      `}</style>
    <div className="flex h-full min-h-full min-w-0 flex-col gap-3 p-4">
      {/* Single-row toolbar — all controls above the columns. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold text-primary">
          {totalCount} case{totalCount === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          onClick={addColumn}
          className="inline-flex size-5 items-center justify-center rounded-full border border-border/60 bg-card/40 text-foreground transition-colors hover:border-accent/50 hover:text-accent"
          title="Add a new column"
        >
          <Plus className="size-3" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (columns.length <= 1) {
              toast.error('Keep at least one column.');
              return;
            }
            const last = columns[columns.length - 1];
            deleteColumn(last.id);
          }}
          className="inline-flex size-5 items-center justify-center rounded-full border border-border/60 bg-card/40 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          title="Delete the last column"
        >
          <X className="size-3" />
        </button>
        <button
          type="button"
          onClick={resetColumns}
          className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/40 px-2 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
          title="Reset all columns to the default team layout"
        >
          ↺ Reset cols
        </button>

        <span className="mx-1 h-4 w-px bg-border/60" />

        {totalCount > 0 && (
          <button
            type="button"
            onClick={distributeCases}
            className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground transition-colors hover:brightness-110"
            title="Distribute all cases equally across columns (first column keeps tickets whose owner matches its name)"
          >
            ⚖ Distribute
          </button>
        )}
        {totalCount > 0 && (
          <button
            type="button"
            onClick={() => void handleCopyStatus()}
            className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/40 px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:border-accent/50 hover:text-accent"
            title="Copy every case number + its status, one per line"
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

        <span className="mx-1 h-4 w-px bg-border/60" />

        <button
          type="button"
          onClick={() => void handleScrapeOver24()}
          disabled={scraping || !scrapeOver24}
          className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-b from-amber-500/30 to-amber-600/15 px-2.5 py-1 text-[11px] font-bold text-amber-200 ring-1 ring-inset ring-amber-500/40 transition-all hover:from-amber-500/40 hover:to-amber-600/20 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
          title="Scrape the [OVER24] Salesforce report and import every case into the board"
        >
          <span className={scraping ? 'animate-spin' : ''}>📥</span>
          {scraping ? 'Scraping OVER24…' : 'Scrape OVER24'}
        </button>
        <span className="ml-auto text-[10px] leading-snug text-muted-foreground/70">
          {connected ? 'Extension connected' : 'Extension not connected — reload the page after re-enabling.'}
        </span>
      </div>

      {/* Board — columns wrap into two rows (29 columns / ~15 per row). */}
      <div className="custom-scrollbar grid min-h-0 flex-1 auto-rows-fr gap-3 overflow-y-auto pb-2"
           style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
        {columns.map((col) => {
          const colItems = byStatus.get(col.id) ?? [];
          const isOver = dragOverCol === col.id;
          const isEditing = editingColId === col.id;
          return (
            <div
              key={col.id}
              onDragOver={(e) => onDragOverCol(e, col.id)}
              onDragLeave={() => setDragOverCol((prev) => (prev === col.id ? null : prev))}
              onDrop={(e) => onDropCol(e, col.id)}
              className={cn(
                'flex min-h-0 min-w-0 flex-col rounded-xl border transition-colors',
                isOver
                  ? 'border-accent/60 bg-accent/[0.06]'
                  : 'border-border/60 bg-card/20'
              )}
            >
              {/* Column header — click the label to rename. */}
              <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
                <span className={cn('size-2 shrink-0 rounded-full', col.dot)} />
                {isEditing ? (
                  <input
                    autoFocus
                    value={colLabelDraft}
                    onChange={(e) => setColLabelDraft(e.target.value)}
                    onBlur={commitRenameCol}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRenameCol();
                      if (e.key === 'Escape') cancelRenameCol();
                    }}
                    className={cn('min-w-0 flex-1 rounded border border-accent/50 bg-background/60 px-1 py-0.5 text-[11px] font-extrabold uppercase tracking-wider outline-none', col.accent)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => startRenameCol(col)}
                    className={cn('min-w-0 flex-1 truncate text-left text-[11px] font-extrabold uppercase tracking-wider transition-opacity hover:opacity-70', col.accent)}
                    title="Click to rename"
                  >
                    {col.label}
                  </button>
                )}
                <span className="ml-auto shrink-0 rounded-full bg-foreground/10 px-1.5 text-[10px] font-bold text-muted-foreground">
                  {colItems.length}
                </span>
                <button
                  type="button"
                  onClick={() => deleteColumn(col.id)}
                  className="shrink-0 rounded-full p-0.5 text-muted-foreground/50 transition-colors hover:bg-destructive/15 hover:text-destructive"
                  title="Delete this column"
                >
                  <X className="size-3" />
                </button>
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
                      onMouseEnter={() => startHover(c.id)}
                      onMouseLeave={cancelHover}
                      className={cn(
                        'group relative cursor-grab rounded-lg border border-border/50 bg-card/70 p-2.5 shadow-sm backdrop-blur-sm transition-all active:cursor-grabbing',
                        'hover:border-foreground/20 hover:shadow-md',
                        isDragging && 'opacity-40 ring-2 ring-accent/50',
                        hoveredCase === c.id && 'z-40'
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

                      {/* Report-scraped labels — tiny label/value rows in a
                          two-column grid (only when any [OVER24] field exists).
                          Kept minimal: Status, Owner, Last reply. Full info
                          (opened / modified / timestamps) lives in the 1s
                          hover bubble. */}
                      {(c.caseOwner || c.reportStatus || c.customerLastReplyTime) && (
                        <dl className="mt-1.5 grid grid-cols-[auto_1fr] items-baseline gap-x-1.5 gap-y-0.5 text-[9px] leading-tight">
                          {c.reportStatus && (
                            <>
                              <dt className="text-muted-foreground/60">Status</dt>
                              <dd className={cn('truncate font-bold', reportStatusColor(c.reportStatus))}>
                                {c.reportStatus}
                              </dd>
                            </>
                          )}
                          {c.caseOwner && (
                            <>
                              <dt className="text-muted-foreground/60">Owner</dt>
                              <dd className="truncate text-foreground/80">{c.caseOwner}</dd>
                            </>
                          )}
                          {c.customerLastReplyTime && (
                            <>
                              <dt className="text-muted-foreground/60">Last reply</dt>
                              <dd className="truncate text-amber-300/90">{c.customerLastReplyTime}</dd>
                            </>
                          )}
                        </dl>
                      )}

                      {/* Hover bubble — full case info, appears after 1s. */}
                      {hoveredCase === c.id && (
                        <div
                          className="pointer-events-none absolute left-1/2 top-full z-[100] mt-2 w-64 rounded-lg border border-border/70 bg-background/95 p-3 text-[11px] shadow-2xl backdrop-blur-md"
                          style={{ animation: 'ct-bubble-in 0.18s ease-out both' }}
                          onMouseEnter={() => startHover(c.id)}
                          onMouseLeave={cancelHover}
                        >
                          <div className="mb-1.5 flex items-center justify-between border-b border-border/50 pb-1.5">
                            <span className="font-mono font-bold text-foreground">{c.caseNumber}</span>
                            {c.reportStatus && (
                              <span className={cn('text-[10px] font-bold', reportStatusColor(c.reportStatus))}>
                                {c.reportStatus}
                              </span>
                            )}
                          </div>
                          <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-2 gap-y-1">
                            {c.customerName && (
                              <>
                                <dt className="text-muted-foreground/60">Customer</dt>
                                <dd className="break-words text-foreground/90">{c.customerName}</dd>
                              </>
                            )}
                            {c.caseOwner && (
                              <>
                                <dt className="text-muted-foreground/60">Owner</dt>
                                <dd className="break-words text-foreground/90">{c.caseOwner}</dd>
                              </>
                            )}
                            {c.dateTimeOpened && (
                              <>
                                <dt className="text-muted-foreground/60">Opened</dt>
                                <dd className="break-words text-foreground/90">{c.dateTimeOpened}</dd>
                              </>
                            )}
                            {c.lastModifiedDate && (
                              <>
                                <dt className="text-muted-foreground/60">Modified</dt>
                                <dd className="break-words text-foreground/90">{c.lastModifiedDate}</dd>
                              </>
                            )}
                            {c.customerLastReplyTime && (
                              <>
                                <dt className="text-muted-foreground/60">Last reply</dt>
                                <dd className="break-words text-amber-300/90">{c.customerLastReplyTime}</dd>
                              </>
                            )}
                            <dt className="text-muted-foreground/60">Added</dt>
                            <dd className="break-words text-foreground/70">{formatCardTime(c.createdAt)}</dd>
                            {c.updatedAt !== c.createdAt && (
                              <>
                                <dt className="text-muted-foreground/60">Updated</dt>
                                <dd className="break-words text-foreground/70">{formatCardTime(c.updatedAt)}</dd>
                              </>
                            )}
                          </dl>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </>
  );
}
