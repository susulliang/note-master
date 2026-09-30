import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown, RotateCcw, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROSTER, ROSTER_MONTHS, SHIFT_CATALOG, type RosterAgent } from '@/data/rosterOct2026';

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
  const available = ROSTER_MONTHS[ROSTER_MONTHS.length - 1] ?? { year: 2026, month: 10 };
  const [year, setYear] = useState(available.year);
  const [month, setMonth] = useState(available.month);
  const [agentEn, setAgentEn] = useState('');
  /** Local shift overrides — `${en}|${iso}` → code (never written to Feishu). */
  const [edits, setEdits] = useState<Record<string, string>>({});

  const agent = useMemo(() => ROSTER.find((a) => a.en === agentEn) ?? null, [agentEn]);

  const shiftOf = (a: RosterAgent, iso: string): string =>
    edits[`${a.en}|${iso}`] ?? a.shifts[iso] ?? '';

  const setShift = (en: string, iso: string, code: string) =>
    setEdits((prev) => ({ ...prev, [`${en}|${iso}`]: code }));

  const monthHasData = ROSTER_MONTHS.some((m) => m.year === year && m.month === month);
  const dim = daysInMonth(year, month);
  const dayList = useMemo(
    () => Array.from({ length: dim }, (_, i) => i + 1),
    [dim]
  );
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
        <RosterGrid year={year} month={month} dayList={dayList} shiftOf={shiftOf} setShift={setShift} />
      )}
    </div>
  );
}

/* --------------------------- all-agents roster grid ------------------------- */

function RosterGrid({
  year,
  month,
  dayList,
  shiftOf,
  setShift,
}: {
  year: number;
  month: number;
  dayList: number[];
  shiftOf: (a: RosterAgent, iso: string) => string;
  setShift: (en: string, iso: string, code: string) => void;
}) {
  return (
    <div className="custom-scrollbar min-h-0 flex-1 overflow-auto rounded-xl border border-border/70 bg-card/40">
      <table className="border-separate border-spacing-0 text-[10px]">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="sticky left-0 z-20 min-w-[130px] border-b border-r border-border/70 bg-card/95 px-2 py-1 text-left font-bold backdrop-blur">
              Agent
            </th>
            {dayList.map((d) => {
              const wd = WEEKDAY_SHORT[new Date(year, month - 1, d).getDay()];
              const weekend = wd === 'Sat' || wd === 'Sun';
              return (
                <th
                  key={d}
                  className={cn(
                    'min-w-[34px] border-b border-border/70 bg-card/95 px-0.5 py-1 text-center font-bold backdrop-blur',
                    weekend && 'text-primary/70'
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
                title={s === 'OFF/PH' ? 'OFF（PH不计入）— computed by the source sheet' : `${s} — computed by the source sheet`}
              >
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROSTER.map((a) => (
            <tr key={a.hr} className="group/row">
              <td className="sticky left-0 z-10 border-b border-r border-border/50 bg-card/90 px-2 py-1 backdrop-blur group-hover/row:bg-accent/10">
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
                return (
                  <td key={d} className="border-b border-border/30 p-[2px]">
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
              {[a.offPh, a.bhc, a.phc].map((stat, i) => (
                <td
                  key={i}
                  className="border-b border-l border-border/30 bg-muted/20 px-1 py-1 text-center font-mono text-[9px] text-muted-foreground"
                >
                  {stat}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
