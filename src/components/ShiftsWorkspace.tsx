import { useMemo, useRef, useState, useEffect } from 'react';
import { CalendarDays, Check, ChevronDown, CloudUpload, Download, RotateCcw, Search, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import { getRoster } from '@/data/roster-index';
import type { RosterAgent, DayTotalRow } from '@/data/roster';
import { ROSTER_MONTHS, SHIFT_CATALOG } from '@/data/shifts';
import { useAuth } from '@/lib/auth-context';
import { fetchRosterMonth, pushRosterCell, pushRosterFull, subscribeRosterMonth } from '@/lib/roster-sync';
import type { RosterCell } from '@/lib/roster-sync';
import { DateBelt } from './DateBelt';

/**
 * Shifts workspace (v0.2.2) — 3rd work-view canvas beside Notes / Trak,
 * tracking the GZ-OPS Ecovacs NA service-agent roster baked from the Feishu
 * "GZ-OPS-Ecovacs NA Roster October 2026 - V0921." spreadsheet.
 *
 * • Top bar: month + year selectors and an agent filter dropdown (English
 *   names only, per the sheet's EN column).
 * • All-agents view: roster grid — one row per agent, one column per day of
 *   the selected month, with the sheet's own computed stat columns
 *   (OFF/PH · BHC · PHC) preserved at the end.
 * • Single-agent view (agent picked in the filter): the calendar flips to a
 *   monthly view with each WEEK as one column (Mon–Sun rows).
 * • Shift cells are editable from the shift-code list (PH / OFF / A21 /
 *   A22 / A23 / A00 / …) — edits are LOCAL to this app session and never
 *   write back to the Feishu sheet (its internal calculations stay intact).
 * • Shift categories get distinct hues from a pleasing palette.
 */

/* ------------------------------ shift colors ----------------------------- */

/** Exact-code hues (night shifts get their own shade of the indigo family). */
const CODE_COLORS: Record<string, string> = {
  A21: '#6366f1',
  A22: '#7c3aed',
  A23: '#9333ea',
  A00: '#0ea5e9',
  A01: '#38bdf8',
  A02: '#38bdf8',
  A05: '#f59e0b',
  A06: '#f97316',
  B06: '#eab308',
  A07: '#eab308',
  A075: '#eab308',
  A08: '#10b981',
  A0830: '#10b981',
  A83: '#10b981',
  A930: '#10b981',
  A945: '#10b981',
  A09: '#10b981',
  A10: '#10b981',
  A105: '#10b981',
  P09: '#34d399',
  P13: '#34d399',
  A11: '#14b8a6',
  A12: '#14b8a6',
  A14: '#0d9488',
  A15: '#0d9488',
  OFF: '#64748b',
  PH: '#f43f5e',
  AL: '#06b6d4',
  调休: '#fb923c',
};

function colorForCode(code: string): string {
  if (CODE_COLORS[code]) return CODE_COLORS[code];
  if (code.startsWith('TR')) return '#84cc16';
  if (code.startsWith('B')) return '#d946ef';
  return '#94a3b8';
}

function hexAlpha(hex: string, alpha: string): string {
  return `${hex}${alpha}`;
}

/* ------------------------------- date helpers ------------------------------ */

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isoOf(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Monday (ISO week start) of the week containing the given date. */
function mondayOf(year: number, month: number, day: number): Date {
  const d = new Date(year, month - 1, day);
  const wd = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - wd);
  return d;
}

/* ------------------------------- shift picker ------------------------------ */

/** Floating shift-code picker opened from any editable shift cell. */
function ShiftPicker({
  code,
  onPick,
  onClose,
}: {
  code: string;
  onPick: (next: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute left-1/2 top-full z-50 mt-1 max-h-[300px] w-[150px] -translate-x-1/2 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-xl"
    >
      {SHIFT_CATALOG.map((s) => {
        const active = s.code === code;
        const color = colorForCode(s.code);
        return (
          <button
            key={s.code}
            type="button"
            onClick={() => {
              onPick(s.code);
              onClose();
            }}
            className={cn(
              'flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[10px] transition-colors',
              active ? 'bg-primary/15' : 'hover:bg-accent/20'
            )}
          >
            <span
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: hexAlpha(color, '55'), border: `1px solid ${color}` }}
            />
            <span className="min-w-0 flex-1 truncate font-mono font-bold">{s.code}</span>
            <span className="max-w-[70px] shrink-0 truncate text-[8px] text-muted-foreground">
              {s.time}
            </span>
            {active && <Check className="size-2.5 shrink-0 text-primary" />}
          </button>
        );
      })}
    </div>
  );
}

/** One editable shift cell — colored chip, click to open the picker. */
function ShiftCell({
  code,
  onPick,
  className,
}: {
  code: string;
  onPick?: (next: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const color = colorForCode(code);
  const editable = Boolean(onPick);
  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        disabled={!editable}
        onClick={() => editable && setOpen((o) => !o)}
        className={cn(
          'flex h-full w-full items-center justify-center rounded-[5px] border px-0.5 py-[3px] text-[9px] font-bold leading-none transition-transform',
          editable && 'hover:scale-[1.06] active:scale-95 cursor-pointer'
        )}
        style={{
          backgroundColor: hexAlpha(color, '26'),
          borderColor: hexAlpha(color, '55'),
          color,
        }}
        title={code}
      >
        <span className="truncate font-mono">{code}</span>
      </button>
      {open && onPick && (
        <ShiftPicker code={code} onPick={onPick} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

/* ------------------------------ agent dropdown ----------------------------- */

function AgentFilter({
  agents,
  value,
  onChange,
}: {
  agents: RosterAgent[];
  value: string;
  onChange: (en: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(
      (a) => a.en.toLowerCase().includes(q) || a.zh.includes(query.trim()) || a.skill.toLowerCase() === q
    );
  }, [agents, query]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card/80 px-2.5 text-[11px] font-semibold shadow-sm transition-colors hover:border-primary/40"
      >
        <Search className="size-3.5 text-primary" />
        <span className={cn(value ? 'text-foreground' : 'text-muted-foreground')}>
          {value || 'All Agents'}
        </span>
        {value && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            className="ml-0.5 rounded p-0.5 text-muted-foreground hover:bg-accent/30 hover:text-foreground"
          >
            <X className="size-3" />
          </span>
        )}
        <ChevronDown className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-[190px] rounded-lg border border-border bg-popover p-1 shadow-xl">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agent…"
            className="mb-1 w-full rounded-md border border-border bg-background px-2 py-1 text-[11px] outline-none focus:border-primary/50"
          />
          <div className="max-h-[260px] overflow-y-auto">
            {filtered.map((a) => (
              <button
                key={a.hr}
                type="button"
                onClick={() => {
                  onChange(a.en);
                  setOpen(false);
                  setQuery('');
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] transition-colors',
                  value === a.en ? 'bg-primary/15' : 'hover:bg-accent/20'
                )}
              >
                <span className="min-w-0 flex-1 truncate font-semibold">{a.en}</span>
                <span className="shrink-0 text-[9px] text-muted-foreground">{a.skill}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-3 text-center text-[10px] text-muted-foreground">
                No agent found.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ month selector ----------------------------- */

function MonthYearSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  options: { value: number; label: string; available?: boolean }[];
  label: string;
}) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 appearance-none rounded-lg border border-border bg-card/80 pl-7 pr-6 text-[11px] font-semibold shadow-sm outline-none transition-colors hover:border-primary/40 focus:border-primary/50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
            {o.available === false ? ' · no data' : ''}
          </option>
        ))}
      </select>
      <CalendarDays className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-primary" />
      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

/* ------------------------------ the workspace ------------------------------ */

export default function ShiftsWorkspace() {
  const available = ROSTER_MONTHS[ROSTER_MONTHS.length - 1] ?? { year: 2026, month: 11 };
  const [year, setYear] = useState(available.year);
  const [month, setMonth] = useState(available.month);
  const [agentEn, setAgentEn] = useState('');
  /** Local shift overrides — `${en}|${iso}` → code (never written to Feishu). */
  const [edits, setEdits] = useState<Record<string, string>>({});

  /** Month-scoped roster (day-total stat rows are computed LIVE so local
   *  edits re-flow the counters, matching the sheet's COUNTIF behavior).
   *  D1 cells fetched live from the worker are layered over the baked
   *  snapshot so every logged-in user sees the current database state. */
  const ROSTER = useMemo(
    () => getRoster(`${year}-${String(month).padStart(2, '0')}`) ?? [],
    [year, month]
  );
  /** Live D1 overlay — `${en}|${iso}` → code fetched from roster_cells. */
  const [d1Overlay, setD1Overlay] = useState<Record<string, string>>({});

  const agent = useMemo(() => ROSTER.find((a) => a.en === agentEn) ?? null, [ROSTER, agentEn]);

  const shiftOf = (a: RosterAgent, iso: string): string =>
    edits[`${a.en}|${iso}`] ?? d1Overlay[`${a.en}|${iso}`] ?? a.shifts[iso] ?? '';

  /* ---------------- D1 backup (admin logins) ----------------
   * The first edit of a month uploads the entire table to the eco-data D1
   * (roster_cells); every later edit upserts just the changed cell. Edits
   * land in the per-month RosterRoom Durable Object first (its SQLite) and
   * are broadcast live to every logged-in viewer of that month; D1 is the
   * backup mirror. */
  const { user: authUser } = useAuth();
  const [d1Status, setD1Status] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  const d1MonthRef = useRef<Map<string, boolean>>(new Map());
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const dim = daysInMonth(year, month);
  const dayList = useMemo(() => Array.from({ length: dim }, (_, i) => i + 1), [dim]);

  useEffect(() => {
    if (!authUser) return;
    let alive = true;
    void fetchRosterMonth(monthKey).then((cells) => {
      if (!alive) return;
      d1MonthRef.current.set(monthKey, cells.length > 0);
      if (cells.length > 0) {
        // Layer the live database state over the baked snapshot.
        setD1Overlay((prev) => {
          const next = { ...prev };
          for (const cell of cells) next[`${cell.en}|${cell.iso}`] = cell.code;
          return next;
        });
      }
    });
    // Live edits — the RosterRoom DO pushes every admin change to all viewers.
    const mergeCells = (cells: RosterCell[]) => {
      if (!alive) return;
      setD1Overlay((prev) => {
        const next = { ...prev };
        for (const cell of cells) next[`${cell.en}|${cell.iso}`] = cell.code;
        return next;
      });
    };
    const unsubscribe = subscribeRosterMonth(monthKey, {
      onCell: (cell) => mergeCells([cell]),
      onCells: mergeCells,
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [monthKey, authUser]);

  const setShift = (en: string, iso: string, code: string) => {
    setEdits((prev) => ({ ...prev, [`${en}|${iso}`]: code }));
    if (!authUser?.canAccessAdmin || ROSTER.length === 0) return;
    if (d1MonthRef.current.get(monthKey) === false) {
      // First submit for this month → upload the entire table.
      setD1Status('syncing');
      const agents = ROSTER.map((a) => ({
        en: a.en,
        shifts: Object.fromEntries(
          dayList.map((d) => {
            const key = isoOf(year, month, d);
            return [key, d === Number(iso.slice(-2)) && a.en === en ? code : edits[`${a.en}|${key}`] ?? a.shifts[key] ?? ''];
          })
        ),
      }));
      void pushRosterFull(monthKey, agents).then((ok) => {
        if (ok) d1MonthRef.current.set(monthKey, true);
        setD1Status(ok ? 'ok' : 'error');
      });
    } else {
      setD1Status('syncing');
      void pushRosterCell(monthKey, en, iso, code).then((ok) => setD1Status(ok ? 'ok' : 'error'));
    }
  };

  /* ---------------- XLSX export ---------------- */
  const downloadXlsx = () => {
    const totals = computeDayTotals(ROSTER, shiftOf, year, month, dayList);
    const wdRow = ['Agent · Skill', ...dayList.map((d) => WEEKDAY_SHORT[new Date(year, month - 1, d).getDay()])];
    const dayRow = ['Day', ...dayList.map(String)];
    const body = ROSTER.map((a) => [
      `${a.en} (${a.skill})`,
      ...dayList.map((d) => shiftOf(a, isoOf(year, month, d))),
    ]);
    const totalRows = totals.map((t) => [
      t.label,
      ...dayList.map((d) => String(t.values[isoOf(year, month, d)] ?? '')),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([wdRow, dayRow, ...body, [], ...totalRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Roster ${monthKey}`);
    XLSX.writeFile(wb, `roster-${monthKey}.xlsx`);
  };

  const monthHasData = ROSTER_MONTHS.some((m) => m.year === year && m.month === month);
  const editCount = Object.keys(edits).length;

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        return {
          value: m,
          label: new Date(2000, m - 1, 1).toLocaleString('en-US', { month: 'short' }),
          available: ROSTER_MONTHS.some((r) => r.year === year && r.month === m),
        };
      }),
    [year]
  );
  const yearOptions = useMemo(() => {
    const yrs = Array.from(new Set(ROSTER_MONTHS.map((m) => m.year)));
    const min = Math.min(...yrs) - 1;
    const max = Math.max(...yrs) + 1;
    return Array.from({ length: max - min + 1 }, (_, i) => ({
      value: min + i,
      label: String(min + i),
      available: yrs.includes(min + i),
    }));
  }, []);

  return (
    <div className="flex h-full min-h-full w-full flex-col gap-2 p-3">
      {/* Top bar — month / year selectors + agent filter. */}
      <div className="flex flex-wrap items-center gap-2">
        <MonthYearSelect
          label="Year"
          value={year}
          onChange={setYear}
          options={yearOptions}
        />
        <MonthYearSelect
          label="Month"
          value={month}
          onChange={setMonth}
          options={monthOptions}
        />
        <AgentFilter agents={ROSTER} value={agentEn} onChange={setAgentEn} />
        <button
          type="button"
          onClick={downloadXlsx}
          disabled={!monthHasData}
          title="Download this month's roster as .xlsx"
          className="flex h-8 items-center gap-1 rounded-lg border border-border bg-card/80 px-2 text-[10px] font-semibold text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-40"
        >
          <Download className="size-3" />
          XLSX
        </button>
        {authUser?.canAccessAdmin && (
          <span
            className={cn(
              'flex h-8 items-center gap-1 rounded-lg border px-2 text-[10px] font-semibold',
              d1Status === 'ok' && 'border-emerald-400/50 bg-emerald-500/10 text-emerald-300',
              d1Status === 'syncing' && 'border-sky-400/50 bg-sky-400/10 text-sky-300',
              d1Status === 'error' && 'border-rose-400/50 bg-rose-500/10 text-rose-300',
              d1Status === 'idle' && 'border-border bg-card/80 text-muted-foreground'
            )}
            title="Admin edits are backed up to the eco-data D1 database (full table on the month's first edit, single cells after)"
          >
            <CloudUpload className="size-3" />
            {d1Status === 'ok' ? 'D1 synced' : d1Status === 'syncing' ? 'D1 syncing' : d1Status === 'error' ? 'D1 failed' : 'D1 backup'}
          </span>
        )}
        {editCount > 0 && (
          <button
            type="button"
            onClick={() => setEdits({})}
            className="flex h-8 items-center gap-1 rounded-lg border border-border bg-card/80 px-2 text-[10px] font-semibold text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-foreground"
            title="Clear local edits"
          >
            <RotateCcw className="size-3" />
            {editCount} local edit{editCount > 1 ? 's' : ''}
          </button>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground/70">
          {monthHasData
            ? `${ROSTER.length} agents · GZ-OPS NA roster · edits are local only`
            : 'No roster data for this month'}
        </span>
      </div>

      {!monthHasData ? (
        <div className="flex flex-1 items-center justify-center text-[12px] text-muted-foreground">
          The baked roster only covers{' '}
          {ROSTER_MONTHS.map((m) => `${new Date(2000, m.month - 1, 1).toLocaleString('en-US', { month: 'short' })} ${m.year}`).join(' and ')}.
        </div>
      ) : agent ? (
        <AgentMonthView agent={agent} year={year} month={month} shiftOf={shiftOf} setShift={setShift} />
      ) : (
        <RosterGrid year={year} month={month} dayList={dayList} shiftOf={shiftOf} setShift={setShift} agents={ROSTER} />
      )}
    </div>
  );
}

/* --------------------------- all-agents roster grid ------------------------- */

/** Shift code → category (off / ph / leave / …) for the live stat formulas. */
const CODE_CATEGORY = new Map(SHIFT_CATALOG.map((s) => [s.code, s.category]));

/** LIVE day-total stat rows — the app-side twin of the sheet's COUNTIF
 *  block. Recomputed from the current roster + local edits on every render,
 *  so the bottom counter rows update immediately when a cell changes. */
function computeDayTotals(
  agents: RosterAgent[],
  shiftOf: (a: RosterAgent, iso: string) => string,
  year: number,
  month: number,
  dayList: number[]
): DayTotalRow[] {
  const iso = (d: number) => isoOf(year, month, d);
  const onDuty = (a: RosterAgent, d: number) => {
    const c = shiftOf(a, iso(d));
    return c.includes('A') || c.includes('B07');
  };
  const frontLine = (a: RosterAgent) => ['Chat', 'Call', 'FR Call'].includes(a.skill);
  const rows: DayTotalRow[] = [];
  const row = (label: string, fn: (d: number) => number) =>
    rows.push({ label, values: Object.fromEntries(dayList.map((d) => [iso(d), fn(d)])) });
  row('上班总人数', (d) => agents.filter((a) => a.skill !== 'DTC' && onDuty(a, d)).length);
  row('OM人数', (d) => agents.filter((a) => a.skill === 'SV' && onDuty(a, d)).length);
  row('TL人数', (d) => agents.filter((a) => a.skill === 'TL' && onDuty(a, d)).length);
  row('T2人数', (d) => agents.filter((a) => a.skill === 'T2' && onDuty(a, d)).length);
  row('T3人数', (d) => agents.filter((a) => a.skill === 'T3' && onDuty(a, d)).length);
  for (const code of ['A06', 'A09', 'A21', 'A22', 'A23', 'A00', 'A01']) {
    row(`${code}一线人数`, (d) => agents.filter((a) => frontLine(a) && shiftOf(a, iso(d)) === code).length);
  }
  row('Trainee人数', (d) => agents.filter((a) => (shiftOf(a, iso(d)) ?? '').startsWith('TR')).length);
  row('Total Chat', (d) => agents.filter((a) => a.skill === 'Chat' && onDuty(a, d)).length);
  row('Total Call', (d) => agents.filter((a) => (a.skill === 'Call' || a.skill === 'FR Call') && onDuty(a, d)).length);
  return rows;
}

function RosterGrid({
  year,
  month,
  dayList,
  shiftOf,
  setShift,
  agents,
}: {
  year: number;
  month: number;
  dayList: number[];
  shiftOf: (a: RosterAgent, iso: string) => string;
  setShift: (en: string, iso: string, code: string) => void;
  agents: RosterAgent[];
}) {
  /** LIVE day totals — recomputed from the (locally edited) roster so the
   *  counter rows stay in sync with every change, like the sheet formulas. */
  const totals = useMemo(
    () => computeDayTotals(agents, shiftOf, year, month, dayList),
    [agents, shiftOf, year, month, dayList]
  );

  /** LIVE per-agent OFF/PH counter — the app-side twin of the sheet's
   *  COUNTIF formula: counts the agent's OFF/rest days + public holidays
   *  for the month, re-derived on every local edit. */
  const offPhCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of agents) {
      let n = 0;
      for (const d of dayList) {
        const cat = CODE_CATEGORY.get(shiftOf(a, isoOf(year, month, d)));
        if (cat === 'off' || cat === 'ph') n += 1;
      }
      m.set(a.en, n);
    }
    return m;
  }, [agents, shiftOf, year, month, dayList]);

  /* Click agent name → scroll their row to the top of the grid; click the
   * same agent again → restore the previous scroll position. */
  const scrollRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<{ en: string; scrollTop: number } | null>(null);
  const onAgentClick = (en: string, row: HTMLTableRowElement | null) => {
    const container = scrollRef.current;
    if (!container || !row) return;
    if (anchorRef.current?.en === en) {
      container.scrollTop = anchorRef.current.scrollTop;
      anchorRef.current = null;
      return;
    }
    anchorRef.current = { en, scrollTop: container.scrollTop };
    // Land the row just below the sticky header — measure the real header
    // height (two-line weekday/day cells) instead of a hardcoded guess.
    const thead = row.closest('table')?.querySelector('thead');
    container.scrollTop = row.offsetTop - (thead?.offsetHeight ?? 0);
  };

  /* Selected day for the night-coverage chart — defaults to today when the
   * viewed month is the current one, else the 1st; clamped on month change. */
  const [selDay, setSelDay] = useState(() => {
    const now = new Date();
    return year === now.getFullYear() && month === now.getMonth() + 1 ? now.getDate() : dayList[0];
  });
  useEffect(() => {
    setSelDay((d) => (dayList.includes(d) ? d : dayList[0]));
  }, [dayList]);

  /* Break time scheduler — the auto-suggested plan is derived per selected
   * day; manual drags override it per agent+day (session-local, like edits).
   * Double-clicking the coverage chart toggles the panel. */
  const [breakPanelOpen, setBreakPanelOpen] = useState(false);
  const [userBreaks, setUserBreaks] = useState<Record<string, BreakPlan>>({});
  const isoSel = isoOf(year, month, selDay);
  const suggestedBreaks = useMemo(
    () => computeSuggestedBreaks(agents, shiftOf, year, month, selDay),
    [agents, shiftOf, year, month, selDay]
  );
  const breakPlans = useMemo(() => {
    const out: Record<string, BreakPlan> = {};
    for (const a of agents) {
      const p = userBreaks[`${a.en}|${isoSel}`] ?? suggestedBreaks[a.en];
      if (p) out[a.en] = p;
    }
    return out;
  }, [agents, userBreaks, suggestedBreaks, isoSel]);
  const breakStarts = useMemo(
    () => Object.fromEntries(Object.entries(breakPlans).map(([en, p]) => [en, p.start])),
    [breakPlans]
  );
  const setBreak = (en: string, p: BreakPlan) =>
    setUserBreaks((m) => ({ ...m, [`${en}|${isoSel}`]: p }));
  const resetBreaks = () =>
    setUserBreaks((m) => Object.fromEntries(Object.entries(m).filter(([k]) => !k.endsWith(`|${isoSel}`))));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <NightCoverageChart
        agents={agents}
        shiftOf={shiftOf}
        year={year}
        month={month}
        day={selDay}
        breakStarts={breakStarts}
        onToggleBreakPanel={() => setBreakPanelOpen((o) => !o)}
      />
      <DateBelt year={year} month={month} dayList={dayList} selected={selDay} onSelect={setSelDay} />
      {breakPanelOpen && (
        <BreakScheduler
          agents={agents}
          shiftOf={shiftOf}
          year={year}
          month={month}
          day={selDay}
          plans={breakPlans}
          onDrag={setBreak}
          onReset={resetBreaks}
        />
      )}
      <div ref={scrollRef} className="custom-scrollbar relative min-h-0 flex-1 overflow-auto rounded-xl border border-border/70 bg-card/40">
      <table className="w-full border-separate border-spacing-0 text-[10px]">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-30 min-w-[130px] border-b border-r border-border/70 bg-card/95 px-2 py-1 text-left font-bold backdrop-blur">
              Agent
            </th>
            {dayList.map((d) => {
              const wd = WEEKDAY_SHORT[new Date(year, month - 1, d).getDay()];
              const weekend = wd === 'Sat' || wd === 'Sun';
              return (
                <th
                  key={d}
                  className={cn(
                    'sticky top-0 z-10 min-w-[34px] border-b border-border/70 bg-card/95 px-0.5 py-1 text-center font-bold backdrop-blur',
                    weekend && 'bg-white/[0.04] text-primary/80'
                  )}
                >
                  <div className="text-[8px] font-medium uppercase text-muted-foreground">{wd}</div>
                  <div>{d}</div>
                </th>
              );
            })}
            {['OFF/PH', 'BHC', 'PHC'].map((s) => (
              <th
                key={s}
                className="min-w-[42px] border-b border-l border-border/70 bg-card/95 px-1 py-1 text-center text-[8px] font-bold uppercase text-muted-foreground backdrop-blur"
                title={s === 'OFF/PH' ? 'OFF + PH — live count of the agent\'s off days + public holidays (updates on every edit)' : `${s} — computed by the source sheet`}
              >
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => (
            <tr key={a.hr} className="group/row">
              <td
                onClick={(e) => onAgentClick(a.en, e.currentTarget.closest('tr'))}
                title="Click to pin this agent's row to the top (click again to restore)"
                className="sticky left-0 z-10 cursor-pointer border-b border-r border-border/50 bg-card/90 px-2 py-1 backdrop-blur group-hover/row:bg-accent/10"
              >
                <div className="flex items-baseline gap-1.5">
                  <span className="truncate text-[11px] font-bold">{a.en}</span>
                  <span className="shrink-0 rounded bg-primary/15 px-1 text-[8px] font-bold text-primary">
                    {a.skill}
                  </span>
                </div>
                <span className="text-[9px] text-muted-foreground">{a.zh}</span>
              </td>
              {dayList.map((d) => {
                const iso = isoOf(year, month, d);
                const code = shiftOf(a, iso);
                const weekend = [0, 6].includes(new Date(year, month - 1, d).getDay());
                return (
                  <td key={d} className={cn('border-b border-border/30 p-[2px]', weekend && 'bg-white/[0.02]')}>
                    {code ? (
                      <ShiftCell
                        code={code}
                        onPick={(next) => setShift(a.en, iso, next)}
                      />
                    ) : (
                      <div className="h-[22px]" />
                    )}
                  </td>
                );
              })}
              {[String(offPhCounts.get(a.en) ?? 0), a.bhc, a.phc].map((stat, i) => (
                <td
                  key={i}
                  className="border-b border-l border-border/30 bg-muted/20 px-1 py-1 text-center font-mono text-[9px] text-muted-foreground"
                >
                  {stat}
                </td>
              ))}
            </tr>
          ))}

          {/* Day-total stat rows — replicate the sheet's COUNTIF block.
              "Total Chat" / "Total Call" (the 2 requested headcount rows)
              get emphasized styling. */}
          {totals.length > 0 && (
            <>
              <tr>
                <td colSpan={dayList.length + 4} className="border-y-2 border-border/70 bg-muted/30 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                  Day totals — source-sheet formulas
                </td>
              </tr>
              {totals.map((row) => {
                const emphasized = row.label === 'Total Chat' || row.label === 'Total Call';
                return (
                  <tr key={row.label} className={cn(emulatedRowClass(emphasized))}>
                    <td
                      className={cn(
                        'sticky left-0 z-10 border-b border-r border-border/50 px-2 py-1 backdrop-blur',
                        emphasized ? 'bg-primary/20 font-bold text-primary' : 'bg-card/90 text-muted-foreground'
                      )}
                    >
                      <span className="text-[10px]">{row.label}</span>
                    </td>
                    {dayList.map((d) => {
                      const iso = isoOf(year, month, d);
                      const v = row.values[iso];
                      const weekend = [0, 6].includes(new Date(year, month - 1, d).getDay());
                      return (
                        <td
                          key={d}
                          className={cn(
                            'border-b border-border/30 px-0.5 py-1 text-center font-mono text-[9px]',
                            emphasized ? 'bg-primary/10 font-bold text-primary' : 'text-muted-foreground',
                            weekend && 'bg-white/[0.02]'
                          )}
                        >
                          {v ?? ''}
                        </td>
                      );
                    })}
                    <td colSpan={3} className="border-b border-l border-border/30 bg-muted/20" />
                  </tr>
                );
              })}
            </>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/** Class helper for the total stat rows. */
function emulatedRowClass(emphasized: boolean): string {
  return emphasized ? 'bg-primary/5' : '';
}

/* ------------------- night-coverage chart + date belt ---------------------- */

const CHAT_COLOR = '#34d399';
const CALL_COLOR = '#818cf8';
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parse 'HH:MM–HH:MM' (en-dash, per SHIFT_CATALOG) → [startMin, endMin];
 *  null for non-working codes (OFF / PH / '—' …). */
function parseShiftRange(time: string): [number, number] | null {
  const m = /^(\d{1,2}):(\d{2})–(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return null;
  return [Number(m[1]) * 60 + Number(m[2]), Number(m[3]) * 60 + Number(m[4])];
}

/** Does a shift range cover the given clock time (minutes 0–1439)?
 *  Ranges crossing midnight (start ≥ end, e.g. A21 21:00–06:00) wrap. */
function rangeCovers([s, e]: [number, number], clock: number): boolean {
  return s < e ? clock >= s && clock < e : clock >= s || clock < e;
}

/** Shift code → [startMin, endMin], cached. B-codes fall back to their
 *  A-equivalent time range (B07 → A07) since some B codes are absent
 *  from the catalog. */
const RANGE_CACHE = new Map<string, [number, number] | null>();
function shiftRange(code: string): [number, number] | null {
  const hit = RANGE_CACHE.get(code);
  if (hit !== undefined || RANGE_CACHE.has(code)) return hit ?? null;
  let r: [number, number] | null = null;
  const def =
    SHIFT_CATALOG.find((s) => s.code === code) ??
    (code.startsWith('B') ? SHIFT_CATALOG.find((s) => s.code === `A${code.slice(1)}`) : undefined);
  if (def) r = parseShiftRange(def.time);
  RANGE_CACHE.set(code, r);
  return r;
}

/** Rounded step path through the points — coverage is piecewise-constant
 *  per 30-min slot, so each value holds flat across its slot and jumps at
 *  the slot boundary with a small S-curve corner (accurate AND smooth). */
function stepPath(pts: Array<[number, number]>): string {
  if (pts.length === 0) return '';
  const f = (v: number) => v.toFixed(2);
  if (pts.length === 1) return `M ${f(pts[0][0])} ${f(pts[0][1])}`;
  const slotX = 100 / (pts.length - 1);
  let d = `M ${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const x = pts[i][0];
    const py = pts[i - 1][1];
    const y = pts[i][1];
    if (Math.abs(y - py) < 0.01) {
      d += ` L ${f(x)} ${f(py)}`;
      continue;
    }
    const rr = Math.min(1.1, Math.abs(y - py) / 2, slotX / 2, 100 - x);
    d += ` L ${f(x - rr)} ${f(py)}`;
    d += ` C ${f(x - rr * 0.45)} ${f(py)}, ${f(x + rr * 0.45)} ${f(y)}, ${f(x + rr)} ${f(y)}`;
  }
  return d;
}

/** Night-coverage line chart — for the selected day, plots the sum of
 *  working people (Chat / Call lines) across the night window from that
 *  day's 21:00 to the next day's 09:00, in 30-min steps. A slot is covered
 *  when the agent's shift on day D (for 21:00–24:00) or day D+1 (for
 *  00:00–09:00) covers the clock time — minus agents currently on break.
 *  Hand-rolled SVG — no chart lib. Double-click toggles the break panel. */
function NightCoverageChart({
  agents,
  shiftOf,
  year,
  month,
  day,
  breakStarts,
  onToggleBreakPanel,
}: {
  agents: RosterAgent[];
  shiftOf: (a: RosterAgent, iso: string) => string;
  year: number;
  month: number;
  day: number;
  breakStarts: Record<string, number>;
  onToggleBreakPanel: () => void;
}) {
  const { chat, call, yMax } = useMemo(() => {
    const isoD = isoOf(year, month, day);
    const nd = new Date(year, month - 1, day + 1);
    const isoD1 = isoOf(nd.getFullYear(), nd.getMonth() + 1, nd.getDate());
    const chat: number[] = [];
    const call: number[] = [];
    for (let m = 21 * 60; m <= 34 * 60; m += 30) {
      // 21:00 day D → 10:00 day D+1; m ≥ 1440 belongs to the next day's shifts
      const clock = m % 1440;
      const winMin = m - 21 * 60; // minutes into the night window (for breaks)
      const iso = m < 1440 ? isoD : isoD1;
      let c = 0;
      let k = 0;
      for (const a of agents) {
        const r = shiftRange(shiftOf(a, iso));
        if (!r || !rangeCovers(r, clock)) continue;
        const b = breakStarts[a.en];
        if (b !== undefined && winMin >= b && winMin < b + 60) continue; // on break
        if (a.skill === 'Chat') c += 1;
        else if (a.skill === 'Call' || a.skill === 'FR Call') k += 1;
      }
      chat.push(c);
      call.push(k);
    }
    const max = Math.max(4, ...chat, ...call);
    return { chat, call, yMax: Math.ceil(max / 2) * 2 };
  }, [agents, shiftOf, year, month, day, breakStarts]);

  const n = chat.length;
  const xy = (arr: number[]): Array<[number, number]> =>
    arr.map((v, i) => [(i / (n - 1)) * 100, 100 - (v / yMax) * 100]);
  const lineD = (arr: number[]) => stepPath(xy(arr));
  const areaD = (arr: number[]) => `${lineD(arr)} L 100 100 L 0 100 Z`;
  const hourLabels = Array.from({ length: 14 }, (_, i) => String((21 + i) % 24).padStart(2, '0') + ':00');
  const wd = WEEKDAY_SHORT[new Date(year, month - 1, day).getDay()];
  const etOff = etOffsetHours(year, month, day);

  /* Hover probe — nearest 30-min slot under the cursor, with headcounts. */
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const onPlotMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const frac = (e.clientX - rect.left) / rect.width;
    setHoverIdx(Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1)))));
  };

  return (
    <div
      className="shrink-0 cursor-default rounded-xl border border-border/70 bg-card/40 p-2.5"
      onDoubleClick={onToggleBreakPanel}
      title="Double-click to open / collapse the break time scheduler"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Night coverage · 21:00 → 10:00 · {MONTH_SHORT[month - 1]} {day} ({wd})
        </div>
        <div className="flex items-center gap-3 text-[9px] font-semibold">
          <span className="hidden text-[8px] font-medium text-muted-foreground/70 sm:inline">
            2× click → breaks
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ backgroundColor: CHAT_COLOR }} />
            Chat
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ backgroundColor: CALL_COLOR }} />
            Call
          </span>
        </div>
      </div>
      <div className="flex items-stretch gap-1.5">
        <div className="flex h-20 w-7 shrink-0 flex-col items-end justify-between font-mono text-[8px] leading-none text-muted-foreground">
          <span>{yMax}</span>
          <span>{yMax / 2}</span>
          <span>0</span>
        </div>
        <div
          className="relative min-w-0 flex-1"
          onMouseMove={onPlotMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-20 w-full">
            {[0, 25, 50, 75, 100].map((t) => (
              <line
                key={t}
                x1="0"
                x2="100"
                y1={t}
                y2={t}
                stroke="currentColor"
                className="text-border/40"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {/* Dotted vertical guides at every hour tick */}
            {hourLabels.map((h, i) => (
              <line
                key={h}
                x1={((i * 2) / (n - 1)) * 100}
                x2={((i * 2) / (n - 1)) * 100}
                y1="0"
                y2="100"
                stroke="currentColor"
                className="text-border/35"
                strokeWidth={1}
                strokeDasharray="2 3"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path d={areaD(chat)} fill={CHAT_COLOR} opacity={0.12} />
            <path d={areaD(call)} fill={CALL_COLOR} opacity={0.12} />
            <path
              d={lineD(chat)}
              fill="none"
              stroke={CHAT_COLOR}
              strokeWidth={2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={lineD(call)}
              fill="none"
              stroke={CALL_COLOR}
              strokeWidth={2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {/* Hover probe: indicator line + headcount tooltip */}
          {hoverIdx !== null && (
            <>
              <div
                className="pointer-events-none absolute inset-y-0 z-10 w-px bg-foreground/40"
                style={{ left: `${((hoverIdx / (n - 1)) * 100).toFixed(3)}%` }}
              />
              <div
                className="pointer-events-none absolute top-1 z-20 min-w-[92px] -translate-x-1/2 rounded-md border border-border bg-popover px-1.5 py-1 text-[9px] leading-4 shadow-lg"
                style={{
                  left: `${Math.max(9, Math.min(91, (hoverIdx / (n - 1)) * 100)).toFixed(3)}%`,
                }}
              >
                <div className="flex items-center justify-between gap-2 font-mono font-bold text-foreground">
                  <span>{fmtWindowMin(hoverIdx * 30)}</span>
                  <span className="font-semibold text-amber-400">{etLabel(21 * 60 + hoverIdx * 30, etOff)}</span>
                </div>
                <div className="flex items-center gap-2 font-semibold">
                  <span className="flex items-center gap-1" style={{ color: CHAT_COLOR }}>
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: CHAT_COLOR }} />
                    {chat[hoverIdx]}
                  </span>
                  <span className="flex items-center gap-1" style={{ color: CALL_COLOR }}>
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: CALL_COLOR }} />
                    {call[hoverIdx]}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {/* Hour labels — absolutely positioned at the exact x of their data
          points (slot i*2 of n), so ticks and points are vertically aligned.
          GMT+8 row on top, ET/EST row in amber underneath. */}
      <div className="relative ml-[34px] mt-1 h-6">
        {hourLabels.map((h, i) => (
          <span
            key={h}
            className="absolute top-0 -translate-x-1/2 font-mono text-[10px] leading-3 text-muted-foreground"
            style={{ left: `${(((i * 2) / (n - 1)) * 100).toFixed(3)}%` }}
          >
            {h}
          </span>
        ))}
        {hourLabels.map((h, i) => (
          <span
            key={`et-${h}`}
            className="absolute top-3 -translate-x-1/2 font-mono text-[8px] font-semibold leading-3 text-amber-400/90"
            style={{ left: `${(((i * 2) / (n - 1)) * 100).toFixed(3)}%` }}
          >
            {etLabel((21 + i) * 60, etOff)}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------ break time scheduler ----------------------------- */

/** A break assignment: `start` = minutes into the night window (0 = 21:00,
 *  30-min steps, 60-min duration), `lane` = row index inside the skill group. */
interface BreakPlan {
  start: number;
  lane: number;
}

/** Break preference per shift family — the allowed break-START range in
 *  hours into the agent's own shift, distilled from the Feishu break sheets
 *  (A21 → hours 0-3, A22 → 2:30-4:30, A23 → 3-4, A00 → 3-6, trainees → 0-1). */
const BREAK_PREFS: Record<string, [number, number]> = {
  A21: [0, 2],
  B21: [0, 2],
  A22: [2.5, 3.5],
  B22: [2.5, 3.5],
  A23: [3, 3],
  B23: [3, 3],
  A00: [3, 5],
  B00: [3, 5],
  A01: [3, 5],
  A02: [3, 5],
};

/** Skill rows of the scheduler — FR Call 1 lane, Chat 1 lane, Call/Call PS 3.
 *  DTC (and SV/TL/T2/T3 leads) are not scheduled for frontline breaks. */
const BREAK_GROUPS = [
  { id: 'fr', label: 'FR Call', lanes: 1, color: '#22d3ee', match: (a: RosterAgent) => a.skill === 'FR Call' },
  { id: 'chat', label: 'Chat', lanes: 1, color: CHAT_COLOR, match: (a: RosterAgent) => a.skill === 'Chat' },
  {
    id: 'call',
    label: 'Call',
    lanes: 3,
    color: CALL_COLOR,
    match: (a: RosterAgent) => a.skill === 'Call' || a.skill === 'Call PS',
  },
];

/** Max simultaneous breaks per group per 30-min slot — equals the group's
 *  lane count, so no two cards ever overlap on the timeline (1 person on
 *  FR Call / chat at a time, up to 3 on call — one per lane). */
const BREAK_CAP: Record<string, number> = { fr: 1, chat: 1, call: 3 };

/** The agent's shift relevant to this night window (a day-D shift starting
 *  21:00–23:00, else a day-D+1 shift starting 00:00–02:00) → the window
 *  minutes where their break may start: from shift start until 1h before
 *  the 9h shift ends (clamped to the window). */
function shiftWindowFor(
  a: RosterAgent,
  shiftOf: (a: RosterAgent, iso: string) => string,
  isoD: string,
  isoD1: string
): [number, number] | null {
  const startWinOf = (s: number) => (s - 21 * 60 + 2880) % 1440;
  const rD = shiftRange(shiftOf(a, isoD));
  if (rD && startWinOf(rD[0]) <= 120) {
    const w = startWinOf(rD[0]);
    return [w, Math.min(720, w + 480)];
  }
  const rD1 = shiftRange(shiftOf(a, isoD1));
  if (rD1) {
    const w = startWinOf(rD1[0]);
    if (w >= 180 && w <= 300) return [w, Math.min(720, w + 480)];
  }
  return null;
}

/** Allowed break-START range (window minutes) per the shift's preference
 *  profile, clamped to the agent's own shift — used by the auto algorithm. */
function breakRangeFor(
  a: RosterAgent,
  shiftOf: (a: RosterAgent, iso: string) => string,
  isoD: string,
  isoD1: string
): [number, number] | null {
  const win = shiftWindowFor(a, shiftOf, isoD, isoD1);
  if (!win) return null;
  const snap = (v: number) => Math.round(v / 30) * 30;
  const pref = BREAK_PREFS[shiftOf(a, isoD).slice(0, 3)] ?? BREAK_PREFS[shiftOf(a, isoD1).slice(0, 3)];
  if (!pref) return null;
  const lo = snap(Math.max(win[0], win[0] + pref[0] * 60));
  const hi = snap(Math.min(win[1], win[0] + pref[1] * 60));
  return lo <= hi ? [lo, hi] : null;
}

/** Suggested break plan — staggers agents evenly across their preference
 *  range within each (group, shift-family) subgroup (mirroring the sheet's
 *  "0-1 / 1-2 / 2-3" pattern), then enforces the per-group concurrency cap
 *  by nudging +30min, and packs agents into the group's lanes greedily. */
function computeSuggestedBreaks(
  agents: RosterAgent[],
  shiftOf: (a: RosterAgent, iso: string) => string,
  year: number,
  month: number,
  day: number
): Record<string, BreakPlan> {
  const isoD = isoOf(year, month, day);
  const nd = new Date(year, month - 1, day + 1);
  const isoD1 = isoOf(nd.getFullYear(), nd.getMonth() + 1, nd.getDate());

  type Entry = { en: string; groupId: string; lo: number; hi: number; maxStart: number };
  const entries: Entry[] = [];
  for (const a of agents) {
    const g = BREAK_GROUPS.find((grp) => grp.match(a));
    if (!g) continue;
    const range = breakRangeFor(a, shiftOf, isoD, isoD1);
    const win = shiftWindowFor(a, shiftOf, isoD, isoD1);
    if (!range || !win) continue;
    entries.push({ en: a.en, groupId: g.id, lo: range[0], hi: range[1], maxStart: win[1] });
  }

  // 1. even stagger within each (group, preference-range) subgroup
  const plans: Record<string, BreakPlan> = {};
  const subgroups = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = `${e.groupId}|${e.lo}|${e.hi}`;
    (subgroups.get(key) ?? subgroups.set(key, []).get(key)!).push(e);
  }
  const snap = (v: number) => Math.round(v / 30) * 30;
  for (const list of subgroups.values()) {
    list.sort((x, y) => x.en.localeCompare(y.en));
    const k = list.length;
    list.forEach((e, i) => {
      const t = k > 1 ? i / (k - 1) : 0;
      plans[e.en] = { start: snap(e.lo + (e.hi - e.lo) * t), lane: 0 };
    });
  }

  // 2. concurrency cap — nudge overlaps later (within the agent's own shift)
  //    until every 30-min slot is under the group's cap
  for (const g of BREAK_GROUPS) {
    const cap = BREAK_CAP[g.id] ?? 3;
    const list = entries
      .filter((e) => e.groupId === g.id)
      .map((e) => ({ p: plans[e.en], maxStart: e.maxStart }))
      .sort((x, y) => x.p.start - y.p.start);
    const counts = new Map<number, number>();
    for (const { p, maxStart } of list) {
      let start = p.start;
      let guard = 0;
      while (
        guard++ < 24 &&
        start < maxStart &&
        ((counts.get(start) ?? 0) >= cap || (counts.get(start + 30) ?? 0) >= cap)
      ) {
        start = Math.min(start + 30, maxStart);
      }
      if (start !== p.start) p.start = start;
      counts.set(start, (counts.get(start) ?? 0) + 1);
      counts.set(start + 30, (counts.get(start + 30) ?? 0) + 1);
    }
  }

  // 3. lane packing — greedy interval scheduling across the group's lanes
  for (const g of BREAK_GROUPS) {
    const laneEnd = new Array<number>(g.lanes).fill(-1);
    const list = entries
      .filter((e) => e.groupId === g.id)
      .sort((x, y) => plans[x.en].start - plans[y.en].start);
    for (const e of list) {
      const s = plans[e.en].start;
      let lane = laneEnd.findIndex((end) => end <= s);
      if (lane < 0) lane = laneEnd.indexOf(Math.min(...laneEnd));
      laneEnd[lane] = s + 60;
      plans[e.en].lane = lane;
    }
  }
  return plans;
}

/** Window minute → clock label (21:00 + w). */
function fmtWindowMin(w: number): string {
  const t = (21 * 60 + w) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** US Eastern offset from GMT+8 for the given date: 12h during EDT
 *  (second Sunday of March → first Sunday of November), else 13h (EST).
 *  A night window never straddles the 2am-ET switch, so the start-day
 *  regime applies to the whole window. */
function etOffsetHours(year: number, month: number, day: number): number {
  const firstSunday = (y: number, m: number) => {
    const d = new Date(y, m - 1, 1);
    return 1 + ((7 - d.getDay()) % 7);
  };
  if (month === 11) return day < firstSunday(year, 11) ? 12 : 13;
  if (month === 3) return day >= firstSunday(year, 3) + 7 ? 12 : 13;
  return month >= 4 && month <= 10 ? 12 : 13;
}

/** ET/EST clock label for a GMT+8 clock time (minutes 0–1439). */
function etLabel(clockMin: number, offset: number): string {
  const t = (clockMin - offset * 60 + 2880) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** Break time scheduler panel — a 21:00→10:00 timeline with 30-min steps,
 *  one card per agent that they can drag (30-min snap) across their group's
 *  lanes. The coverage chart above dips live while cards move. */
function BreakScheduler({
  agents,
  shiftOf,
  year,
  month,
  day,
  plans,
  onDrag,
  onReset,
}: {
  agents: RosterAgent[];
  shiftOf: (a: RosterAgent, iso: string) => string;
  year: number;
  month: number;
  day: number;
  plans: Record<string, BreakPlan>;
  onDrag: (en: string, plan: BreakPlan) => void;
  onReset: () => void;
}) {
  const hourLabels = Array.from({ length: 14 }, (_, i) => String((21 + i) % 24).padStart(2, '0') + ':00');
  const etOff = etOffsetHours(year, month, day);

  // Drag clamp per agent — anywhere inside their own 9h shift (the preference
  // windows only steer the AUTO plan; manual drags are free within the shift)
  const clampMap = useMemo(() => {
    const isoD = isoOf(year, month, day);
    const nd = new Date(year, month - 1, day + 1);
    const isoD1 = isoOf(nd.getFullYear(), nd.getMonth() + 1, nd.getDate());
    const m: Record<string, [number, number]> = {};
    for (const a of agents) {
      const r = shiftWindowFor(a, shiftOf, isoD, isoD1);
      if (r) m[a.en] = r;
    }
    return m;
  }, [agents, shiftOf, year, month, day]);

  const dragRef = useRef<{ en: string; groupId: string; lo: number; hi: number; lanes: number } | null>(null);
  const lanesRef = useRef<Record<string, HTMLDivElement | null>>({});

  const planFromPointer = (clientX: number, clientY: number): BreakPlan | null => {
    const d = dragRef.current;
    if (!d) return null;
    const el = lanesRef.current[d.groupId];
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const raw = ((clientX - rect.left) / rect.width) * 780;
    const start = Math.max(d.lo, Math.min(d.hi, Math.round(raw / 30) * 30));
    const lane = Math.max(0, Math.min(d.lanes - 1, Math.floor(((clientY - rect.top) / rect.height) * d.lanes)));
    return { start, lane };
  };

  /** Snap the desired (start, lane) to the nearest placement that doesn't
   *  overlap another card in the same group — same start other lane first,
   *  then nearest ±30-min starts within the agent's shift bounds. */
  const resolveFree = (desired: BreakPlan): BreakPlan => {
    const d = dragRef.current;
    if (!d) return desired;
    const g = BREAK_GROUPS.find((grp) => grp.id === d.groupId);
    if (!g) return desired;
    const busy = agents
      .filter((a) => a.en !== d.en && g.match(a) && plans[a.en])
      .map((a) => plans[a.en]);
    const overlaps = (p: BreakPlan) =>
      busy.some((b) => b.lane === p.lane && p.start < b.start + 60 && b.start < p.start + 60);
    if (!overlaps(desired)) return desired;
    for (let lane = 0; lane < g.lanes; lane++) {
      const p = { start: desired.start, lane };
      if (!overlaps(p)) return p;
    }
    for (let delta = 30; delta <= 720; delta += 30) {
      for (const s of [desired.start - delta, desired.start + delta]) {
        if (s < d.lo || s > d.hi) continue;
        for (let lane = 0; lane < g.lanes; lane++) {
          const p = { start: s, lane };
          if (!overlaps(p)) return p;
        }
      }
    }
    return desired;
  };

  const onCardPointerDown = (e: React.PointerEvent, en: string, groupId: string) => {
    const clamp = clampMap[en];
    if (!clamp) return;
    const g = BREAK_GROUPS.find((grp) => grp.id === groupId);
    dragRef.current = { en, groupId, lo: clamp[0], hi: clamp[1], lanes: g?.lanes ?? 1 };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // synthetic / already-released pointer — drag still works via move events
    }
  };
  const onCardPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = planFromPointer(e.clientX, e.clientY);
    if (!p) return;
    const free = resolveFree(p);
    const cur = plans[d.en];
    if (cur && (free.start !== cur.start || free.lane !== cur.lane)) onDrag(d.en, free);
  };
  const onCardPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div className="shrink-0 animate-in fade-in slide-in-from-top-2 rounded-xl border border-border/70 bg-card/40 p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Break time scheduler · 1h per agent · drag cards to reschedule
        </div>
        <button
          type="button"
          onClick={onReset}
          title="Reset this day's breaks to the auto-suggested plan"
          className="flex items-center gap-1 rounded-md border border-border/70 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground"
        >
          <RotateCcw className="size-3" />
          Auto
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {BREAK_GROUPS.map((g) => {
          const members = agents.filter((a) => g.match(a) && plans[a.en]);
          if (members.length === 0) return null;
          return (
            <div key={g.id} className="flex items-stretch gap-1.5">
              <div className="flex w-7 shrink-0 items-center justify-center">
                <span className="rotate-180 text-[8px] font-bold uppercase tracking-wider text-muted-foreground [writing-mode:vertical-rl]">
                  {g.label}
                  {g.lanes > 1 ? ` ×${g.lanes}` : ''}
                </span>
              </div>
              <div
                ref={(el) => {
                  lanesRef.current[g.id] = el;
                }}
                className="relative min-w-0 flex-1 rounded-lg bg-white/[0.02]"
              >
                {Array.from({ length: 14 }, (_, i) => (
                  <div
                    key={i}
                    className="absolute inset-y-0 w-px"
                    style={{
                      left: `${((i / 13) * 100).toFixed(3)}%`,
                      borderLeft: '1px dotted rgb(255 255 255 / 0.14)',
                    }}
                  />
                ))}
                {Array.from({ length: g.lanes }, (_, lane) => (
                  <div key={lane} className={cn('relative h-7', lane > 0 && 'border-t border-border/15')}>
                    {members
                      .filter((a) => plans[a.en].lane === lane)
                      .map((a) => {
                        const p = plans[a.en];
                        return (
                          <div
                            key={a.en}
                            onPointerDown={(e) => onCardPointerDown(e, a.en, g.id)}
                            onPointerMove={onCardPointerMove}
                            onPointerUp={onCardPointerUp}
                            onPointerCancel={onCardPointerUp}
                            title={`${a.zh} · break ${fmtWindowMin(p.start)}–${fmtWindowMin(p.start + 60)} (drag to move)`}
                            className="absolute inset-y-[2px] z-10 flex cursor-grab touch-none select-none items-center justify-center rounded-md border text-[9px] font-bold shadow-sm transition-colors hover:brightness-125 active:cursor-grabbing"
                            style={{
                              left: `${((p.start / 780) * 100).toFixed(3)}%`,
                              width: `${((60 / 780) * 100).toFixed(3)}%`,
                              backgroundColor: hexAlpha(g.color, '26'),
                              borderColor: hexAlpha(g.color, '66'),
                              color: g.color,
                            }}
                          >
                            <span className="truncate px-0.5">{a.en}</span>
                          </div>
                        );
                      })}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {/* Hour labels — same 34px offset as the chart, so timelines line up.
          GMT+8 row on top, ET/EST row in amber underneath. */}
      <div className="relative ml-[34px] mt-1 h-6">
        {hourLabels.map((h, i) => (
          <span
            key={h}
            className="absolute top-0 -translate-x-1/2 font-mono text-[10px] leading-3 text-muted-foreground"
            style={{ left: `${((i / 13) * 100).toFixed(3)}%` }}
          >
            {h}
          </span>
        ))}
        {hourLabels.map((h, i) => (
          <span
            key={`et-${h}`}
            className="absolute top-3 -translate-x-1/2 font-mono text-[8px] font-semibold leading-3 text-amber-400/90"
            style={{ left: `${((i / 13) * 100).toFixed(3)}%` }}
          >
            {etLabel((21 + i) * 60, etOff)}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------- single-agent month view (week columns) ---------------- */

function AgentMonthView({
  agent,
  year,
  month,
  shiftOf,
  setShift,
}: {
  agent: RosterAgent;
  year: number;
  month: number;
  shiftOf: (a: RosterAgent, iso: string) => string;
  setShift: (en: string, iso: string, code: string) => void;
}) {
  // Weeks of the month — each column is one ISO week (Mon–Sun rows).
  const weeks = useMemo(() => {
    const dim = daysInMonth(year, month);
    const map = new Map<string, number[]>();
    for (let d = 1; d <= dim; d++) {
      const mon = mondayOf(year, month, d);
      const key = `${mon.getFullYear()}-${mon.getMonth()}-${mon.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return Array.from(map.entries()).map(([key, days]) => {
      const [y, m, dd] = key.split('-').map(Number);
      return { monday: new Date(y, m, dd), days };
    });
  }, [year, month]);

  const monthName = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long' });

  return (
    <div className="custom-scrollbar min-h-0 flex-1 overflow-auto rounded-xl border border-border/70 bg-card/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[13px] font-bold">{agent.en}</span>
        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold text-primary">
          {agent.skill}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {agent.zh} · {monthName} {year}
        </span>
      </div>
      <div className="flex gap-2">
        {weeks.map(({ monday, days }) => {
          const rangeEnd = new Date(monday);
          rangeEnd.setDate(rangeEnd.getDate() + 6);
          return (
            <div key={monday.toISOString()} className="flex min-w-[86px] flex-1 flex-col">
              <div className="mb-1 rounded-md bg-primary/10 px-1 py-0.5 text-center text-[8px] font-bold uppercase tracking-wide text-primary">
                {monday.toLocaleString('en-US', { month: 'short', day: 'numeric' })} –{' '}
                {rangeEnd.toLocaleString('en-US', { month: 'short', day: 'numeric' })}
              </div>
              {Array.from({ length: 7 }, (_, i) => {
                const date = new Date(monday);
                date.setDate(date.getDate() + i);
                const inMonth = date.getMonth() + 1 === month;
                const iso = isoOf(date.getFullYear(), date.getMonth() + 1, date.getDate());
                const code = inMonth ? shiftOf(agent, iso) : '';
                const wd = WEEKDAY_SHORT[date.getDay()];
                const weekend = wd === 'Sat' || wd === 'Sun';
                return (
                  <div key={iso} className="mb-1">
                    {inMonth ? (
                      <div
                        className={cn(
                          'flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/60 px-1.5 py-1',
                          weekend && 'border-primary/25'
                        )}
                      >
                        <div className="w-6 shrink-0 text-right">
                          <div className="text-[8px] font-medium uppercase text-muted-foreground">
                            {wd}
                          </div>
                          <div className={cn('text-[10px] font-bold', weekend && 'text-primary')}>
                            {date.getDate()}
                          </div>
                        </div>
                        {code ? (
                          <ShiftCell
                            code={code}
                            className="min-w-0 flex-1"
                            onPick={(next) => setShift(agent.en, iso, next)}
                          />
                        ) : (
                          <span className="flex-1 text-[9px] italic text-muted-foreground/50">
                            —
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="h-[38px] rounded-lg border border-dashed border-border/30" />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
