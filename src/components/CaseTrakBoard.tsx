import { useState, useMemo, useCallback, useEffect, useRef, type DragEvent } from 'react';
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Link as LinkIcon,
  Copy,
  Trash2,
  X,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useScopedState } from '@/hooks/use-scoped-state';
import type { ReportCaseRecord, ReportImportMeta } from '@/hooks/use-ccp-extension-bridge';
import { parseOver24Workbook } from '@/lib/over24-workbook';
import { getRoster, ROSTER_MONTHS } from '@/data/roster-index';
import { fetchRosterMonth, type RosterCell } from '@/lib/roster-sync';
import { DateBelt } from './DateBelt';
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
  /** Upload batches auto-distribute cases to owner columns after merging. */
  distribute?: boolean;
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
 * Routes every case to the column whose label matches the case's Case Owner
 * (each label is split into keywords, the owner is substring-matched, first
 * hit wins). Cases with no matching owner column are spread round-robin so
 * nothing is dropped. Returns a new array, or null when nothing moved.
 */
function routeByOwner(items: CaseTrakItem[], cols: BoardColumn[]): CaseTrakItem[] | null {
  if (cols.length === 0) return null;
  const keywordCols = cols.map((col) => ({
    id: col.id,
    keywords: col.label
      .toLowerCase()
      .split(/[\s,/|;]+/)
      .map((k) => k.trim())
      .filter(Boolean),
  }));
  const now = new Date().toISOString();
  let rr = 0;
  let changedAny = false;
  const next = items.map((c) => {
    const owner = (c.caseOwner || '').toLowerCase();
    let target: string | null = null;
    if (owner) {
      const hit = keywordCols.find(
        (k) => k.keywords.length > 0 && k.keywords.some((w) => owner.includes(w))
      );
      if (hit) target = hit.id;
    }
    if (!target) target = keywordCols[rr++ % keywordCols.length]!.id;
    if (c.status !== target) {
      changedAny = true;
      return { ...c, status: target, updatedAt: now };
    }
    return c;
  });
  return changedAny ? next : null;
}

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
  connected,
}: {
  reportImports?: CaseReportImportBatch[];
  connected?: boolean;
}) {
  const [items, setItems] = useScopedState<CaseTrakItem[]>(STORAGE_KEY, []);
  const [columns, setColumns] = useScopedState<BoardColumn[]>(COLUMNS_STORAGE_KEY, [...DEFAULT_CASE_COLUMNS] as BoardColumn[]);
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [colLabelDraft, setColLabelDraft] = useState('');
  const [uploading, setUploading] = useState(false);
  // Over 24H xlsx uploads — parsed locally, merged through the same
  // import-batch pipeline as extension scrapes, then auto-distributed.
  const [uploadBatch, setUploadBatch] = useState<CaseReportImportBatch | null>(null);
  const uploadNonceRef = useRef(1);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  // Latest columns for the merge effect without re-running it on renames.
  const columnsRef = useRef(columns);
  useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<CaseStatus | null>(null);

  // --- Roster date belt ------------------------------------------------------
  // The board's columns are the agents ON DUTY on the selected roster date
  // (belt defaults to today). Baked roster months read their local table;
  // any other month (and overlay edits for baked months too) is pulled from
  // the D1 roster sync. Changing the date rebuilds the columns and re-routes
  // every case to its owner's column.
  const today = new Date();
  const todayMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const [beltYear, setBeltYear] = useState(() => today.getFullYear());
  const [beltMonth, setBeltMonth] = useState(() => today.getMonth() + 1);
  const [beltDay, setBeltDay] = useState(() => today.getDate());
  const beltDim = new Date(beltYear, beltMonth, 0).getDate();
  const beltDayList = useMemo(
    () => Array.from({ length: beltDim }, (_, i) => i + 1),
    [beltDim]
  );
  const shiftBeltMonth = (delta: number) => {
    let m = beltMonth + delta;
    let y = beltYear;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setBeltYear(y);
    setBeltMonth(m);
    setBeltDay(1);
  };

  // Roster month key currently on the belt.
  const rosterMonthKey = `${beltYear}-${String(beltMonth).padStart(2, '0')}`;

  // Pull the selected month's cells from D1 roster sync (covers months that
  // have no baked local roster, and overlays admin edits on baked months).
  const [d1Cells, setD1Cells] = useState<Record<string, RosterCell[]>>({});
  const fetchedMonthsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (fetchedMonthsRef.current.has(rosterMonthKey)) return;
    fetchedMonthsRef.current.add(rosterMonthKey);
    let alive = true;
    void fetchRosterMonth(rosterMonthKey).then((cells) => {
      if (!alive) return;
      if (cells.length > 0) {
        setD1Cells((prev) => ({ ...prev, [rosterMonthKey]: cells }));
      }
    });
    return () => {
      alive = false;
    };
  }, [rosterMonthKey]);

  /** Columns derived from the selected date's roster: only Call and Chat
   *  agents whose shift code that day marks them on duty (A* shifts or B07 —
   *  the same on-duty rule the SHIFTS counters use, minus the AL edge case).
   *  Agent identity/skill comes from the newest baked roster; the target
   *  month's shift codes come from baked data overlaid with D1 cells. */
  const dutyColumns = useMemo(() => {
    const fallback =
      getRoster(rosterMonthKey) ??
      getRoster(ROSTER_MONTHS[ROSTER_MONTHS.length - 1] ?? '') ??
      [];
    if (fallback.length === 0) return [];
    const iso = `${rosterMonthKey}-${String(beltDay).padStart(2, '0')}`;
    const cellCode = new Map<string, string>();
    for (const c of d1Cells[rosterMonthKey] ?? []) {
      if (c.iso === iso && c.code) cellCode.set(c.en, c.code);
    }
    return fallback
      .filter((a) => a.skill === 'Call' || a.skill === 'Chat')
      .map((a) => ({ a, code: cellCode.get(a.en) ?? a.shifts[iso] ?? '' }))
      .filter(({ code }) => (code.startsWith('A') && code !== 'AL') || code === 'B07')
      .map(({ a }, i) => ({
        id: a.en.toLowerCase().replace(/\s+/g, '_'),
        label: a.en,
        ...COLUMN_PALETTE[i % COLUMN_PALETTE.length],
      }));
  }, [rosterMonthKey, beltDay, d1Cells]);

  // Rebuild the board columns whenever the duty set changes and re-route all
  // cases to owner columns (off-duty agents' cases spread across the duty
  // columns). Months without roster data keep the current columns.
  useEffect(() => {
    if (dutyColumns.length === 0) return;
    setColumns(dutyColumns);
    setItems((prev) => routeByOwner(prev, dutyColumns) ?? prev);
  }, [dutyColumns, setColumns, setItems]);
  // Hover tooltip state — bubble appears only after the pointer has stayed on
  // a card for > 1s (matches the "hover for over 1 second" requirement).
  const [hoveredCase, setHoveredCase] = useState<string | null>(null);
  // Viewport anchor for the portal-rendered hover bubble (fixed positioning).
  const [hoverPos, setHoverPos] = useState<{ left: number; top: number; flip: boolean } | null>(null);
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
    const allBatches = [...(reportImports ?? []), ...(uploadBatch ? [uploadBatch] : [])];
    if (allBatches.length === 0) return;
    const pending = allBatches.filter(
      (b) => Array.isArray(b.cases) && b.cases.length > 0 && !processedImportRef.current.has(b.nonce)
    );
    if (pending.length === 0) return;
    const needsDistribute = pending.some((b) => b.distribute === true);
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
      const changed = counts.added > 0 || counts.updated > 0;
      if (changed) {
        const source = pending[0]?.meta?.reportName || 'Over-24h report';
        toast.success(
          `${source}: ${counts.added} new case${counts.added === 1 ? '' : 's'} added, ${counts.updated} refreshed on the board.${needsDistribute ? ' Routed to owner columns.' : ''}`
        );
      } else if (needsDistribute) {
        toast.info('Upload matched the current board — no new or refreshed cases.');
      }
      if (needsDistribute) {
        setItems((prev) => routeByOwner(prev, columnsRef.current) ?? prev);
      }
      return changed ? next : prev;
    });
  }, [reportImports, uploadBatch, setItems]);

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
    if (!window.confirm('Reset all columns to the current roster day\'s on-duty layout? Cases stay on the board but orphaned ones move to the first column.')) return;
    const defaults = dutyColumns.length > 0 ? [...dutyColumns] : [...DEFAULT_CASE_COLUMNS];
    const fallback = defaults[0]?.id ?? 'open';
    setColumns(defaults);
    setItems((its) => {
      const validIds = new Set(defaults.map((c) => c.id));
      return its.map((c) =>
        validIds.has(c.status) ? c : { ...c, status: fallback, updatedAt: new Date().toISOString() }
      );
    });
    cancelRenameCol();
    toast.info('Columns reset to the roster day layout.');
  };

  // --- Distribute cases across columns ------------------------------------
  // Random reshuffle: every case is re-assigned to a random column
  // (shuffle + round-robin keeps the spread even).
  const distributeCases = useCallback(() => {
    if (columns.length === 0) {
      toast.error('Add at least one column to distribute into.');
      return;
    }
    const now = new Date().toISOString();
    const shuffled = items
      .map((c) => ({ c, r: Math.random() }))
      .sort((a, b) => a.r - b.r)
      .map((x) => x.c);
    const byId = new Map(items.map((c) => [c.id, c]));
    shuffled.forEach((c, i) => {
      const target = columns[i % columns.length].id;
      const cur = byId.get(c.id);
      if (cur && cur.status !== target) byId.set(c.id, { ...cur, status: target, updatedAt: now });
    });
    setItems(Array.from(byId.values()));
    toast.info(
      `Shuffled ${items.length} case${items.length === 1 ? '' : 's'} randomly across ${columns.length} columns.`
    );
  }, [columns, items, setItems]);

  // --- Over 24H xlsx upload ------------------------------------------------
  // Replaces the extension scrape flow: parse the exported report workbook
  // locally and push it through the import-batch pipeline with distribute
  // enabled, so cases land on their owner's column automatically.
  const handleUploadOver24 = async (file: File) => {
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseOver24Workbook(buf, file.name);
      if (parsed.cases.length === 0) {
        toast.error(`No case rows found in ${file.name}.`);
        return;
      }
      setUploadBatch({
        cases: parsed.cases,
        meta: {
          reportName: `Over 24H upload · ${file.name}`,
          totalRecords: parsed.cases.length,
          capturedAt: new Date().toISOString(),
        },
        nonce: uploadNonceRef.current++,
        distribute: true,
      });
    } catch (e: any) {
      toast.error(`Failed to parse ${file.name}: ${String(e?.message || e)}`);
    } finally {
      setUploading(false);
    }
  };

  // --- Hover-tooltip handlers ---------------------------------------------
  // The bubble renders through a portal with position:fixed so it is never
  // clipped by the column's scroll container.
  const startHover = (id: string, el?: HTMLElement) => {
    if (el) {
      const r = el.getBoundingClientRect();
      const flip = r.bottom + 320 > window.innerHeight && r.top > 320;
      setHoverPos({ left: r.left + r.width / 2, top: flip ? r.top - 8 : r.bottom + 8, flip });
    }
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
        @keyframes ct-bubble-in-up {
          from { opacity: 0; transform: translate(-50%, -100%) translateY(4px) scale(0.97); }
          to   { opacity: 1; transform: translate(-50%, -100%) scale(1); }
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

        <input
          ref={uploadInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void handleUploadOver24(f);
          }}
        />
        <button
          type="button"
          onClick={() => uploadInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-b from-amber-500/30 to-amber-600/15 px-2.5 py-1 text-[11px] font-bold text-amber-200 ring-1 ring-inset ring-amber-500/40 transition-all hover:from-amber-500/40 hover:to-amber-600/20 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
          title="Upload the exported Over 24H xlsx — cases merge onto the board and auto-route to their owner's column"
        >
          <span className={uploading ? 'animate-spin' : ''}>📄</span>
          {uploading ? 'Parsing…' : 'Upload Over 24H'}
        </button>
        <span className="ml-auto text-[10px] leading-snug text-muted-foreground/70">
          {connected ? 'Extension connected' : 'Extension not connected — reload the page after re-enabling.'}
        </span>
      </div>

      {/* Roster date belt — the selected day's on-duty agents become the
          columns; drag the belt or click a day to switch. */}
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => shiftBeltMonth(-1)}
          title="Previous month"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-card/40 text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
        >
          <ChevronLeft className="size-3" />
        </button>
        <span className="w-16 shrink-0 text-center font-mono text-[11px] font-bold text-foreground">
          {beltYear}-{String(beltMonth).padStart(2, '0')}
        </span>
        <button
          type="button"
          onClick={() => shiftBeltMonth(1)}
          title="Next month"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-card/40 text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
        >
          <ChevronRight className="size-3" />
        </button>
        <div className="min-w-0 flex-1">
          <DateBelt year={beltYear} month={beltMonth} dayList={beltDayList} selected={beltDay} onSelect={setBeltDay} />
        </div>
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
                      onMouseEnter={(e) => startHover(c.id, e.currentTarget)}
                      onMouseLeave={cancelHover}
                      className={cn(
                        'group relative cursor-grab rounded-md border border-border/50 bg-card/70 px-2 py-1.5 shadow-sm backdrop-blur-sm transition-all active:cursor-grabbing',
                        'hover:border-foreground/20 hover:shadow-md',
                        isDragging && 'opacity-40 ring-2 ring-accent/50',
                        hoveredCase === c.id && 'z-40'
                      )}
                    >
                      {/* Line 1 — case number + status. Hover actions overlay
                          the status (group-hover swaps visibility). */}
                      <div className="flex items-center justify-between gap-1.5">
                        <span
                          className={cn(
                            'truncate font-mono text-[11px] font-bold tabular-nums text-foreground',
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
                            <LinkIcon className="ml-1 inline size-2.5 align-[-2px] text-accent opacity-70" />
                          )}
                        </span>
                        {c.reportStatus && (
                          <span
                            className={cn(
                              'shrink-0 text-[8px] font-bold uppercase tracking-wide group-hover:invisible',
                              reportStatusColor(c.reportStatus)
                            )}
                          >
                            {c.reportStatus}
                          </span>
                        )}
                      </div>

                      {/* Line 2 — owner + last customer reply */}
                      <div className="mt-0.5 flex items-center gap-1.5 text-[9px] leading-tight">
                        {c.caseOwner ? (
                          <span className="truncate text-muted-foreground/80">{c.caseOwner}</span>
                        ) : (
                          <span className="truncate italic text-muted-foreground/40">no owner</span>
                        )}
                        {c.customerLastReplyTime && (
                          <span className="ml-auto shrink-0 truncate font-semibold text-amber-300/90">
                            {c.customerLastReplyTime}
                          </span>
                        )}
                      </div>

                      {/* Hover actions — compact icon row overlaying line 1 */}
                      <div className="absolute right-1 top-1 hidden items-center gap-0.5 rounded bg-card/95 px-0.5 shadow-sm backdrop-blur-sm group-hover:flex">
                        <button
                          type="button"
                          onClick={() => void doOpenOne(c)}
                          className="flex size-4 items-center justify-center rounded-full text-accent/80 transition-colors hover:bg-accent/15 hover:text-accent"
                          aria-label={`Open case ${c.caseNumber} in Salesforce`}
                          title="Open in Salesforce"
                          disabled={!openCase && !c.directCaseUrl}
                        >
                          <ExternalLink className="size-2.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDirectCaseUrl(c.id)}
                          className="flex size-4 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-foreground/10 hover:text-foreground"
                          aria-label={`Paste direct Lightning URL for ${c.caseNumber}`}
                          title={c.directCaseUrl ? 'Update saved direct URL' : 'Paste a direct Lightning Case URL'}
                        >
                          <LinkIcon className="size-2.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeCase(c.id)}
                          className="flex size-4 items-center justify-center rounded-full text-muted-foreground/50 transition-colors hover:bg-destructive/15 hover:text-destructive"
                          aria-label={`Remove case ${c.caseNumber}`}
                          title="Remove case"
                        >
                          <X className="size-2.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {/* Hover bubble — full case info after 1s. Portal-rendered with
          position:fixed so it always sits above every panel, never clipped
          by the column's scroll container. Flips above the card near the
          viewport bottom. */}
      {(() => {
        if (!hoveredCase || !hoverPos) return null;
        const c = items.find((x) => x.id === hoveredCase);
        if (!c) return null;
        return createPortal(
          <div
            className="pointer-events-none fixed z-[9999] w-64 rounded-lg border border-border/70 bg-background/95 p-3 text-[11px] shadow-2xl backdrop-blur-md"
            style={{
              left: hoverPos.left,
              top: hoverPos.top,
              transform: hoverPos.flip ? 'translate(-50%, -100%)' : 'translateX(-50%)',
              animation: `${hoverPos.flip ? 'ct-bubble-in-up' : 'ct-bubble-in'} 0.18s ease-out both`,
            }}
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
          </div>,
          document.body
        );
      })()}
    </div>
    </>
  );
}
