import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  LabelList,
} from 'recharts';
import {
  AlertTriangle,
  RefreshCw,
  Activity,
  Trophy,
  Wallet,
  Target,
  GripVertical,
  Filter,
  Mail,
  MessageSquare,
  Phone,
  Users,
  Zap,
  Clock,
  Smile,
  ThumbsDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * AMR Contact Center — 周度 KPI Dashboard.
 *
 * Re-visualises the Salesforce "周度KPI看板" dashboard (18 widgets in 9 metric
 * groups). ONLY data points actually exposed by the dashboard DOM snapshot
 * ("As of Oct 8, 2026, 9:18 PM") are rendered — the source canvas charts
 * publish one tooltip/anchor per widget, so each widget here shows exactly
 * those real points, never interpolated or invented values. Widgets are
 * draggable and positions persist to localStorage. The "Show Abnormal"
 * toggle filters by-agent / by-channel breakdowns to points that crossed
 * the KPI threshold (from the Money Go High matrix).
 */

const REFRESHED_AT = 'Oct 8, 2026, 9:18 PM';
const POSITIONS_KEY = '__app_ecovacs_dash_widget_order';

// ---------------------------------------------------------------------------
// Thresholds — sourced from the KPI Money Go High matrix (threshold column).
// direction: 'higher' means value must be >= threshold to be healthy.
// ---------------------------------------------------------------------------

type Direction = 'higher' | 'lower';

interface MetricThreshold {
  value: number;
  direction: Direction;
}

const THRESHOLDS: Record<string, MetricThreshold> = {
  csat: { value: 85, direction: 'higher' }, // CSAT threshold 85%
  csatMtd: { value: 95, direction: 'higher' }, // CSAT MTD (excluding DTC + OR) threshold 95%
  oneTouch: { value: 68, direction: 'higher' }, // One-touch threshold 68%
  chatResponse: { value: 26, direction: 'lower' }, // Chat avg response ≤ 26s
  emailFirstResponse: { value: 8, direction: 'lower' }, // Email first reply ≤ 8h
  emailAvgResponse: { value: 10, direction: 'lower' }, // Email avg reply ≤ 10h
};

function isAbnormal(metric: string, value: number): boolean {
  const t = THRESHOLDS[metric];
  if (!t) return false;
  return t.direction === 'higher' ? value < t.value : value > t.value;
}

// ---------------------------------------------------------------------------
// Widget data model — every point below is verbatim from the dashboard DOM
// (aria-label tooltip captured in the scrape, e.g.
//  "Case Owner Alan, Date/Time Opened 9/6/2026 - 9/12/2026, Record Count 58,
//   15.59% of 372 for Alan").
// ---------------------------------------------------------------------------

interface DataPoint {
  /** Agent / channel / series label (e.g. "Alan", "Email", "Manual"). */
  label: string;
  value: number;
  /** Source week range, e.g. "9/6-9/12". */
  week: string;
  /** Share context string from the tooltip, e.g. "15.59% of 372 for Alan". */
  share?: string;
}

interface WidgetDef {
  id: string;
  title: string;
  icon: typeof Activity;
  /** Key into THRESHOLDS, or '' for pure-volume metrics (no threshold). */
  metric: string;
  unit: string;
  kind: 'team' | 'breakdown';
  /** Breakdown grouping description (e.g. "by agent", "by channel"). */
  groupBy?: string;
  decimals?: number;
  points: DataPoint[];
}

const WIDGETS: WidgetDef[] = [
  // -- Inquiry volume ------------------------------------------------------
  {
    id: 'inquiry-team',
    title: 'AMR 咨询量趋势 - 周度',
    icon: Activity,
    metric: '',
    unit: '',
    kind: 'team',
    points: [{ label: '总进线量', value: 549, week: '8/30-9/5', share: '15.36% of 3.6k' }],
  },
  {
    id: 'inquiry-by-agent',
    title: 'AMR 咨询量趋势 - 周度/人',
    icon: Users,
    metric: '',
    unit: '',
    kind: 'breakdown',
    groupBy: 'by agent',
    points: [{ label: 'Alan', value: 58, week: '9/6-9/12', share: '15.59% of 372 for Alan' }],
  },
  {
    id: 'inquiry-by-channel',
    title: 'AMR 咨询量趋势 - 周度（分渠道）',
    icon: Phone,
    metric: '',
    unit: '',
    kind: 'breakdown',
    groupBy: 'by channel',
    points: [{ label: 'Email', value: 462, week: '8/30-9/5', share: '84.15% of 549' }],
  },
  // -- CSAT ----------------------------------------------------------------
  {
    id: 'csat-team',
    title: 'AMR CSAT KPI report 周度',
    icon: Smile,
    metric: 'csat',
    unit: '%',
    decimals: 1,
    kind: 'team',
    points: [{ label: 'personal CSAT', value: 98.2, week: '8/9-8/15' }],
  },
  {
    id: 'csat-by-agent',
    title: 'AMR CSAT KPI report (by agent) - Weekly',
    icon: Smile,
    metric: 'csat',
    unit: '%',
    decimals: 0,
    kind: 'breakdown',
    groupBy: 'by agent',
    points: [{ label: 'Alan', value: 100, week: '9/6-9/12' }],
  },
  {
    id: 'csat-by-channel',
    title: 'AMR CSAT KPI report (by 渠道) - Weekly',
    icon: Smile,
    metric: 'csat',
    unit: '%',
    decimals: 0,
    kind: 'breakdown',
    groupBy: 'by channel',
    points: [{ label: 'Manual', value: 50, week: '9/20-9/26' }],
  },
  // -- One touch -----------------------------------------------------------
  {
    id: 'one-touch-team',
    title: 'AMR One Touch Rate 周度',
    icon: Zap,
    metric: 'oneTouch',
    unit: '%',
    decimals: 1,
    kind: 'team',
    points: [{ label: 'One-touch Closed Rate', value: 72.3, week: '8/9-8/15' }],
  },
  {
    id: 'one-touch-by-agent',
    title: 'AMR One touch rate (by agent) - Weekly',
    icon: Zap,
    metric: 'oneTouch',
    unit: '%',
    decimals: 1,
    kind: 'breakdown',
    groupBy: 'by agent',
    points: [{ label: 'Alan', value: 83.3, week: '9/6-9/12' }],
  },
  // -- Chat response time ---------------------------------------------------
  {
    id: 'chat-response-team',
    title: 'AMR Chat平均回复时长监测 - 周度',
    icon: MessageSquare,
    metric: 'chatResponse',
    unit: 's',
    decimals: 1,
    kind: 'team',
    points: [{ label: 'Avg Response Time', value: 22.6, week: '8/9-8/15', share: '11.47% of 197.41' }],
  },
  {
    id: 'chat-response-by-agent',
    title: 'AMR Chat平均回复时长监测 - 周度/人',
    icon: MessageSquare,
    metric: 'chatResponse',
    unit: 's',
    decimals: 1,
    kind: 'breakdown',
    groupBy: 'by agent',
    points: [{ label: 'Alan', value: 13.3, week: '8/16-8/22', share: '100% of 13.3 for Alan' }],
  },
  // -- Chat volume -----------------------------------------------------------
  {
    id: 'chat-volume-team',
    title: 'AMR 接Chat量 - 周度',
    icon: MessageSquare,
    metric: '',
    unit: '',
    kind: 'team',
    points: [{ label: 'Record Count', value: 507, week: '8/9-8/15', share: '9.52% of 5.3k' }],
  },
  {
    id: 'chat-volume-by-agent',
    title: 'AMR Agent接Chat量 - 周度',
    icon: Users,
    metric: '',
    unit: '',
    kind: 'breakdown',
    groupBy: 'by agent',
    points: [{ label: 'Steven', value: 2, week: '9/6-9/12', share: '100% of 2 for Steven' }],
  },
  // -- Email volume -----------------------------------------------------------
  {
    id: 'email-volume-team',
    title: 'AMR Email处理量 - 周度',
    icon: Mail,
    metric: '',
    unit: '',
    kind: 'team',
    points: [{ label: 'Record Count', value: 3005, week: '8/9-8/15', share: '10.02% of 30k' }],
  },
  {
    id: 'email-volume-by-agent',
    title: 'AMR Email处理量 (by agent) - Weekly',
    icon: Users,
    metric: '',
    unit: '',
    kind: 'breakdown',
    groupBy: 'by agent',
    points: [{ label: 'Alan', value: 65, week: '9/6-9/12', share: '13.68% of 475 for Alan' }],
  },
  // -- Email first response ---------------------------------------------------
  {
    id: 'email-first-response-team',
    title: 'AMR Email首回平均时长 - 周度',
    icon: Clock,
    metric: 'emailFirstResponse',
    unit: 'h',
    decimals: 1,
    kind: 'team',
    points: [{ label: 'Avg First Response Time', value: 5, week: '8/9-8/15', share: '20.53% of 24.4' }],
  },
  {
    id: 'email-first-response-by-agent',
    title: 'AMR Email首回平均时长监测 - 周度/人',
    icon: Clock,
    metric: 'emailFirstResponse',
    unit: 'h',
    decimals: 1,
    kind: 'breakdown',
    groupBy: 'by agent',
    points: [{ label: 'Alan', value: 1.5, week: '9/6-9/12', share: '9.92% of 15.4 for Alan' }],
  },
  // -- Email avg response ------------------------------------------------------
  {
    id: 'email-avg-response-team',
    title: 'AMR Email平均回复时长 - 周度',
    icon: Clock,
    metric: 'emailAvgResponse',
    unit: 'h',
    decimals: 1,
    kind: 'team',
    points: [{ label: 'Avg Response Time', value: 5.9, week: '8/9-8/15', share: '19.26% of 30.7' }],
  },
  {
    id: 'email-avg-response-by-agent',
    title: 'AMR Email平均回复时长监测 - 周度/人',
    icon: Clock,
    metric: 'emailAvgResponse',
    unit: 'h',
    decimals: 1,
    kind: 'breakdown',
    groupBy: 'by agent',
    points: [{ label: 'Alan', value: 3.9, week: '9/6-9/12', share: '16.81% of 23 for Alan' }],
  },
];

// ---------------------------------------------------------------------------
// CSAT MTD (month-to-date) — Salesforce report "CSAT excluding DTC + OR",
// scraped from the report DOM snapshot. Overall summary + per-owner subtotals
// that the snapshot actually rendered (the report virtualizes rows, so only
// the first owners' subtotals are present; Boris Z.'s 25 cases were listed
// but his subtotal was not loaded).
// ---------------------------------------------------------------------------

const CSAT_MTD_THRESHOLD = 95; // user-specified MTD threshold

const CSAT_MTD = {
  /** Summary widget totals, verbatim from the report's summary panel. */
  summary: {
    csat: 94.76, // "CSAT 94.76%"
    totalRecords: 382, // "Total Records 382"
    goodCases: 362, // "Total AMR Is Good Satisfaction Case 362"
    badCases: 20, // "Total Is Bad Satisfaction Case 20"
  },
  /** Per-owner subtotals rendered by the snapshot, verbatim. */
  agents: [
    { name: 'Alan', cases: 6, good: 6, bad: 0, csat: 100.0 },
    { name: 'Alex Wilson', cases: 3, good: 2, bad: 1, csat: 66.67 },
    { name: 'Aurora', cases: 16, good: 16, bad: 0, csat: 100.0 },
  ],
  /** Group headers visible but whose subtotals were virtualized away. */
  notLoaded: [{ name: 'Boris Z.', cases: 25 }],
};

// ---------------------------------------------------------------------------
// Money Go High scoring matrix (Feishu "KPI Money Go High!" — Crazy New 2.0,
// sheet RuKJzV, A1:H14, scraped Oct 2026).
// ---------------------------------------------------------------------------

interface MoneyKpi {
  category: string;
  name: string;
  challenge: string;
  target: string;
  threshold: string;
  weight: number;
  achievement: string;
  score: number;
  direction: Direction;
}

const MONEY_KPIS: MoneyKpi[] = [
  { category: 'Quality', name: 'CSAT', challenge: '95%', target: '90%', threshold: '85%', weight: 20, achievement: '96%', score: 22.05, direction: 'higher' },
  { category: 'Quality', name: 'One-touch Rate', challenge: '76%', target: '72%', threshold: '68%', weight: 15, achievement: '71.86%', score: 16.5, direction: 'higher' },
  { category: 'Quality', name: 'Bad Reviews on AMZ', challenge: '8%', target: '10%', threshold: '12%', weight: 10, achievement: '11.11%', score: 11.0, direction: 'lower' },
  { category: 'Efficiency', name: 'Daily replies per agent', challenge: '60', target: '50', threshold: '45', weight: 10, achievement: '45', score: 11.0, direction: 'higher' },
  { category: 'Efficiency', name: '20s SLA', challenge: '92%', target: '88%', threshold: '84%', weight: 10, achievement: '95.06%', score: 11.0, direction: 'higher' },
  { category: 'Efficiency', name: 'First Response Time – Email (h)', challenge: '2', target: '4', threshold: '8', weight: 5, achievement: '1.66', score: 5.5, direction: 'lower' },
  { category: 'Efficiency', name: 'Avg Response Time – Email (h)', challenge: '4', target: '6', threshold: '10', weight: 10, achievement: '1.95', score: 11.0, direction: 'lower' },
  { category: 'Efficiency', name: 'Avg Response Time – Chat (s)', challenge: '20', target: '23', threshold: '26', weight: 5, achievement: '19.93', score: 5.5, direction: 'lower' },
  { category: 'Team Attrition', name: 'Attrition Rate', challenge: '2.50%', target: '5%', threshold: '7.50%', weight: 5, achievement: '0.00%', score: 5.5, direction: 'lower' },
];

const MONEY_TOTAL_SCORE = MONEY_KPIS.reduce((s, k) => s + k.score, 0).toFixed(2);
const MONEY_SETTLEMENT_COEFFICIENT = 1;

type Band = 'challenge' | 'target' | 'threshold' | 'below';

function parseNum(s: string): number {
  return parseFloat(s.replace(/[^0-9.]/g, ''));
}

function kpiBand(k: MoneyKpi): Band {
  const a = parseNum(k.achievement);
  const c = parseNum(k.challenge);
  const t = parseNum(k.target);
  const th = parseNum(k.threshold);
  if (k.direction === 'higher') {
    if (a >= c) return 'challenge';
    if (a >= t) return 'target';
    if (a >= th) return 'threshold';
    return 'below';
  }
  if (a <= c) return 'challenge';
  if (a <= t) return 'target';
  if (a <= th) return 'threshold';
  return 'below';
}

const BAND_META: Record<Band, { label: string; color: string; ring: string }> = {
  challenge: { label: 'Challenge', color: 'text-emerald-300 bg-emerald-500/15', ring: 'ring-emerald-500/40' },
  target: { label: 'Target', color: 'text-sky-300 bg-sky-500/15', ring: 'ring-sky-500/40' },
  threshold: { label: 'Threshold', color: 'text-amber-300 bg-amber-500/15', ring: 'ring-amber-500/40' },
  below: { label: 'Below', color: 'text-rose-300 bg-rose-500/15', ring: 'ring-rose-500/40' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatValue(v: number, unit: string, decimals = 0): string {
  const num = decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString();
  return `${num}${unit}`;
}

function abnormalPoints(w: WidgetDef): DataPoint[] {
  if (!w.metric) return [];
  return w.points.filter((p) => isAbnormal(w.metric, p.value));
}

// ---------------------------------------------------------------------------
// Widget card
// ---------------------------------------------------------------------------

interface WidgetCardProps {
  widget: WidgetDef;
  showAbnormal: boolean;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}

function WidgetCard({ widget, showAbnormal, onDragStart, onDragOver, onDragEnd, isDragging }: WidgetCardProps) {
  const Icon = widget.icon;
  const t = THRESHOLDS[widget.metric];
  const abn = abnormalPoints(widget);

  const visiblePoints = useMemo(() => {
    if (widget.kind === 'team') return widget.points;
    if (showAbnormal && widget.metric) return abn;
    return widget.points;
  }, [widget, showAbnormal, abn]);

  return (
    <div
      draggable
      onDragStart={() => onDragStart(widget.id)}
      onDragOver={(e) => onDragOver(e, widget.id)}
      onDragEnd={onDragEnd}
      className={cn(
        'group cursor-grab rounded-2xl border border-border/60 bg-card/40 backdrop-blur-md transition-opacity active:cursor-grabbing',
        isDragging && 'opacity-40'
      )}
    >
      <header className="flex items-center gap-1.5 border-b border-border/40 px-2.5 py-2">
        <GripVertical className="size-3.5 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground" />
        <Icon className="size-3.5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[11px] font-semibold text-foreground" title={widget.title}>
            {widget.title}
          </h3>
          {widget.groupBy && <p className="text-[10px] text-muted-foreground">{widget.groupBy}</p>}
        </div>
        {widget.metric && abn.length > 0 && (
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-300 ring-1 ring-rose-500/40">
            <AlertTriangle className="size-2.5" />
            {abn.length}
          </span>
        )}
      </header>

      <div className="p-3">
        {widget.kind === 'team' ? (
          /* Team anchor: big stat for the single real data point */
          <div className="flex h-36 flex-col justify-center">
            <div className="text-3xl font-black tabular-nums text-foreground">
              {formatValue(widget.points[0].value, widget.unit, widget.decimals ?? 0)}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {widget.points[0].label} · {widget.points[0].week}
            </div>
            {widget.points[0].share && (
              <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">{widget.points[0].share}</div>
            )}
            {t && (
              <div className="mt-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1',
                    isAbnormal(widget.metric, widget.points[0].value)
                      ? 'bg-rose-500/15 text-rose-300 ring-rose-500/40'
                      : 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40'
                  )}
                >
                  {isAbnormal(widget.metric, widget.points[0].value) ? (
                    <AlertTriangle className="size-2.5" />
                  ) : null}
                  {isAbnormal(widget.metric, widget.points[0].value) ? 'Abnormal' : 'On track'} · thr{' '}
                  {t.value}
                  {widget.unit} {t.direction === 'higher' ? 'min' : 'max'}
                </span>
              </div>
            )}
          </div>
        ) : visiblePoints.length === 0 ? (
          /* Filtered out everything — all points healthy */
          <div className="flex h-36 items-center justify-center px-3 text-center text-[11px] text-muted-foreground">
            All within threshold
            <span className="ml-1 font-mono">
              ({t ? `${t.value}${widget.unit} ${t.direction === 'higher' ? 'min' : 'max'}` : ''})
            </span>
          </div>
        ) : (
          /* Breakdown: bar chart of the REAL exposed points only */
          <div className="h-36 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={visiblePoints} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    fontSize: 12,
                  }}
                  formatter={(v: number, _name, item) => {
                    const p = item?.payload as DataPoint | undefined;
                    return [formatValue(v, widget.unit, widget.decimals ?? 0), p?.week ?? widget.groupBy ?? ''];
                  }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={40}>
                  {visiblePoints.map((p, i) => (
                    <Cell
                      key={i}
                      fill={
                        widget.metric && isAbnormal(widget.metric, p.value)
                          ? 'var(--destructive, #f85149)'
                          : 'var(--primary)'
                      }
                      fillOpacity={widget.metric && isAbnormal(widget.metric, p.value) ? 0.85 : 0.65}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-0.5 truncate text-center font-mono text-[10px] text-muted-foreground/70">
              {visiblePoints.map((p) => `${p.label} ${p.week}`).join(' · ')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Money Go High widget
// ---------------------------------------------------------------------------

function MoneyGoHighWidget() {
  const categoryScores = useMemo(() => {
    const map = new Map<string, number>();
    for (const k of MONEY_KPIS) {
      map.set(k.category, (map.get(k.category) ?? 0) + k.score);
    }
    return Array.from(map.entries()).map(([name, score]) => ({ name, score }));
  }, []);

  const bandCounts = useMemo(() => {
    const counts = { challenge: 0, target: 0, threshold: 0, below: 0 };
    for (const k of MONEY_KPIS) counts[kpiBand(k)] += 1;
    return counts;
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-stretch gap-4">
        <div className="flex flex-1 items-center gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/20">
            <Trophy className="size-7 text-emerald-300" />
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-emerald-300/80">Total Score</div>
            <div className="text-4xl font-black tabular-nums text-emerald-200">
              {MONEY_TOTAL_SCORE}
              <span className="text-xl text-emerald-300/60"> / 100</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-2xl border border-border/60 bg-card/50 p-4">
          <div className="flex size-14 items-center justify-center rounded-full bg-accent/15">
            <Wallet className="size-7 text-accent" />
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Settlement Coefficient</div>
            <div className="text-4xl font-black tabular-nums text-foreground">×{MONEY_SETTLEMENT_COEFFICIENT}</div>
          </div>
        </div>

        <div className="flex flex-1 items-center gap-2 rounded-2xl border border-border/60 bg-card/50 p-4">
          {(Object.keys(BAND_META) as Band[]).map((b) => (
            <div key={b} className="flex flex-1 flex-col items-center">
              <span className={cn('inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-sm font-bold tabular-nums ring-1', BAND_META[b].ring, BAND_META[b].color)}>
                {bandCounts[b]}
              </span>
              <span className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{BAND_META[b].label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border/50 bg-background/30 p-4 lg:col-span-2">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
            <Target className="size-3.5 text-accent" />
            Score Contribution by Category
          </div>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryScores} barSize={48}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                <YAxis domain={[0, 50]} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} formatter={(v: number) => [`${v.toFixed(2)} pts`, 'Score']} />
                <Bar dataKey="score" name="Score" radius={[8, 8, 0, 0]}>
                  {categoryScores.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? 'var(--primary)' : i === 1 ? 'var(--accent)' : 'var(--muted-foreground)'} fillOpacity={0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border/50 bg-background/30 p-4">
          <div className="mb-3 text-xs font-semibold text-foreground">Weight Distribution</div>
          <div className="space-y-2.5">
            {categoryScores.map((c) => {
              const totalW = MONEY_KPIS.filter((k) => k.category === c.name).reduce((s, k) => s + k.weight, 0);
              return (
                <div key={c.name}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-foreground">{c.name}</span>
                    <span className="font-mono text-muted-foreground">{totalW}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-border/40">
                    <div className="h-full rounded-full bg-accent/70" style={{ width: `${totalW}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/50">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-background/50 text-muted-foreground">
              <th className="px-3 py-2.5 font-medium">Category</th>
              <th className="px-3 py-2.5 font-medium">KPI</th>
              <th className="px-3 py-2.5 text-center font-medium">Challenge</th>
              <th className="px-3 py-2.5 text-center font-medium">Target</th>
              <th className="px-3 py-2.5 text-center font-medium">Threshold</th>
              <th className="px-3 py-2.5 text-center font-medium">Weight</th>
              <th className="px-3 py-2.5 text-center font-medium">Achievement</th>
              <th className="px-3 py-2.5 text-center font-medium">Band</th>
              <th className="px-3 py-2.5 text-right font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {MONEY_KPIS.map((k, i) => {
              const band = kpiBand(k);
              const meta = BAND_META[band];
              return (
                <tr key={k.name} className={cn('border-t border-border/30', i % 2 === 1 ? 'bg-background/10' : '')}>
                  <td className="px-3 py-2 font-medium text-foreground">{k.category}</td>
                  <td className="px-3 py-2 text-muted-foreground">{k.name}</td>
                  <td className="px-3 py-2 text-center font-mono tabular-nums text-emerald-300/70">{k.challenge}</td>
                  <td className="px-3 py-2 text-center font-mono tabular-nums text-sky-300/70">{k.target}</td>
                  <td className="px-3 py-2 text-center font-mono tabular-nums text-amber-300/70">{k.threshold}</td>
                  <td className="px-3 py-2 text-center font-mono tabular-nums text-muted-foreground">{k.weight}%</td>
                  <td className="px-3 py-2 text-center font-mono font-semibold tabular-nums text-foreground">{k.achievement}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1', meta.ring, meta.color)}>{meta.label}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-foreground">{k.score.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border/60 bg-emerald-500/10">
              <td colSpan={8} className="px-3 py-2.5 text-right font-bold text-emerald-300">TOTAL SCORE</td>
              <td className="px-3 py-2.5 text-right font-mono text-lg font-black tabular-nums text-emerald-200">{MONEY_TOTAL_SCORE}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSAT MTD section — Salesforce report "CSAT excluding DTC + OR"
// (bullet gauge for the month-to-date overall + per-agent bars vs the 95%
// threshold; participates in the Show Abnormal filter).
// ---------------------------------------------------------------------------

function CsatMtdBullet({ csat, threshold }: { csat: number; threshold: number }) {
  const abnormal = csat < threshold;
  const delta = csat - threshold;
  return (
    <div>
      <div className="flex items-end gap-3">
        <span
          className={cn(
            'text-5xl font-black tabular-nums',
            abnormal ? 'text-rose-300' : 'text-emerald-200'
          )}
        >
          {csat.toFixed(2)}%
        </span>
        <span
          className={cn(
            'mb-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1',
            abnormal
              ? 'bg-rose-500/15 text-rose-300 ring-rose-500/40'
              : 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40'
          )}
        >
          {abnormal && <AlertTriangle className="size-3" />}
          {delta >= 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)} pp vs {threshold}%
        </span>
      </div>
      {/* Bullet bar: qualitative bands + value fill + threshold marker */}
      <div className="relative mt-3 h-5 w-full overflow-visible rounded-full bg-border/30">
        {/* bands: 85-90 amber (threshold floor from Money Go High), 90-95 sky
            (target zone), 95-100 emerald (challenge/threshold zone) */}
        <div className="absolute inset-y-0 left-[85%] w-[5%] rounded-l-full bg-amber-500/25" />
        <div className="absolute inset-y-0 left-[90%] w-[5%] bg-sky-500/25" />
        <div className="absolute inset-y-0 left-[95%] w-[5%] rounded-r-full bg-emerald-500/30" />
        {/* value fill */}
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full transition-[width] duration-500',
            abnormal ? 'bg-rose-500/70' : 'bg-emerald-500/70'
          )}
          style={{ width: `${csat}%` }}
        />
        {/* threshold marker */}
        <div
          className="absolute -top-1 -bottom-1 w-0.5 rounded bg-rose-400 shadow-[0_0_6px_rgba(248,81,73,0.8)]"
          style={{ left: `${threshold}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground/70">
        <span>0%</span>
        <span className="text-amber-300/80">85</span>
        <span className="text-sky-300/80">90</span>
        <span className="text-emerald-300/80">95%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

function CsatMtdSection({ showAbnormal }: { showAbnormal: boolean }) {
  const { summary, agents, notLoaded } = CSAT_MTD;
  const overallAbnormal = isAbnormal('csatMtd', summary.csat);
  const abnormalAgents = agents.filter((a) => isAbnormal('csatMtd', a.csat));
  const visibleAgents = showAbnormal ? abnormalAgents : agents;
  const maxCases = Math.max(...agents.map((a) => a.cases), 1);

  const chartData = visibleAgents.map((a) => ({
    name: a.name,
    csat: a.csat,
    cases: a.cases,
    abnormal: isAbnormal('csatMtd', a.csat),
  }));

  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-md">
      <header className="flex flex-wrap items-center gap-2 border-b border-border/40 px-4 py-3">
        <Smile className="size-4 text-accent" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">
            CSAT MTD — excluding DTC + OR
          </h2>
          <p className="truncate text-[11px] text-muted-foreground">
            Month-to-date · Salesforce report · threshold {CSAT_MTD_THRESHOLD}%
          </p>
        </div>
        {(overallAbnormal || abnormalAgents.length > 0) && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-300 ring-1 ring-rose-500/40">
            <AlertTriangle className="size-2.5" />
            {(overallAbnormal ? 1 : 0) + abnormalAgents.length} abnormal
          </span>
        )}
      </header>

      <div className="grid grid-cols-1 gap-5 p-4 lg:grid-cols-2">
        {/* Left: overall bullet gauge + volume stats */}
        <div className="flex flex-col justify-between gap-4">
          <div>
            <div className="mb-2 text-xs font-semibold text-foreground">Overall MTD</div>
            <CsatMtdBullet csat={summary.csat} threshold={CSAT_MTD_THRESHOLD} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-border/50 bg-background/30 p-3 text-center">
              <div className="text-xl font-black tabular-nums text-foreground">
                {summary.totalRecords}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Cases surveyed
              </div>
            </div>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center">
              <div className="text-xl font-black tabular-nums text-emerald-200">
                {summary.goodCases}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-emerald-300/70">
                Good cases
              </div>
            </div>
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-center">
              <div className="flex items-center justify-center gap-1 text-xl font-black tabular-nums text-rose-200">
                <ThumbsDown className="size-4" />
                {summary.badCases}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-rose-300/70">
                Bad cases
              </div>
            </div>
          </div>
        </div>

        {/* Right: per-agent bars vs 95% threshold */}
        <div className="rounded-xl border border-border/50 bg-background/30 p-4">
          <div className="mb-1 flex items-center justify-between">
            <div className="text-xs font-semibold text-foreground">CSAT by agent (subtotals)</div>
            <div className="font-mono text-[10px] text-muted-foreground/70">
              bar width ∝ cases · max {maxCases}
            </div>
          </div>
          {chartData.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
              No abnormal agents — all loaded subtotals ≥ {CSAT_MTD_THRESHOLD}%.
            </div>
          ) : (
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 8, right: 40, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 95, 100]}
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                    axisLine={{ stroke: 'var(--border)' }}
                    tickLine={false}
                    unit="%"
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={90}
                    tick={{ fill: 'var(--foreground)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      fontSize: 12,
                    }}
                    formatter={(v: number, _name, item) => {
                      const d = item?.payload as { cases?: number } | undefined;
                      return [`${v.toFixed(2)}% · ${d?.cases ?? '?'} cases`, 'CSAT'];
                    }}
                  />
                  <ReferenceLine
                    x={CSAT_MTD_THRESHOLD}
                    stroke="var(--destructive, #f85149)"
                    strokeDasharray="5 3"
                    strokeWidth={1.5}
                    label={{
                      value: `thr ${CSAT_MTD_THRESHOLD}%`,
                      fill: 'var(--muted-foreground)',
                      fontSize: 10,
                      position: 'top',
                    }}
                  />
                  <Bar dataKey="csat" radius={[0, 6, 6, 0]} barSize={22}>
                    {chartData.map((d, i) => (
                      <Cell
                        key={i}
                        fill={d.abnormal ? 'var(--destructive, #f85149)' : 'var(--primary)'}
                        fillOpacity={d.abnormal ? 0.85 : 0.65}
                      />
                    ))}
                    <LabelList
                      dataKey="csat"
                      position="right"
                      formatter={(v: number) => `${v.toFixed(2)}%`}
                      style={{ fill: 'var(--foreground)', fontSize: 10, fontWeight: 700 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">
            {notLoaded.length > 0 && (
              <>
                {notLoaded.map((n) => `${n.name} (${n.cases} cases)`).join(', ')} listed in the
                report but subtotal not rendered by the source snapshot.{' '}
              </>
            )}
            Subtotals verbatim from the report — no interpolated values.
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main Dash component
// ---------------------------------------------------------------------------

export default function Dash() {
  const [showAbnormal, setShowAbnormal] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(POSITIONS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const valid = WIDGETS.map((w) => w.id);
        if (Array.isArray(parsed) && parsed.length === valid.length && parsed.every((id) => valid.includes(id))) {
          return parsed;
        }
      }
    } catch {
      /* ignore */
    }
    return WIDGETS.map((w) => w.id);
  });

  const handleDragStart = useCallback((id: string) => {
    setDraggingId(id);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      if (!draggingId || draggingId === targetId) return;
      setOrder((prev) => {
        const next = [...prev];
        const from = next.indexOf(draggingId);
        const to = next.indexOf(targetId);
        if (from === -1 || to === -1) return prev;
        next.splice(from, 1);
        next.splice(to, 0, draggingId);
        return next;
      });
    },
    [draggingId]
  );

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(POSITIONS_KEY, JSON.stringify(order));
    } catch {
      /* ignore */
    }
  }, [order]);

  const orderedWidgets = useMemo(
    () => order.map((id) => WIDGETS.find((w) => w.id === id)!).filter(Boolean),
    [order]
  );

  const mtdAbnormalCount = useMemo(() => {
    const overall = isAbnormal('csatMtd', CSAT_MTD.summary.csat) ? 1 : 0;
    const agents = CSAT_MTD.agents.filter((a) => isAbnormal('csatMtd', a.csat)).length;
    return overall + agents;
  }, []);

  const totalAbnormal = useMemo(
    () => WIDGETS.reduce((s, w) => s + abnormalPoints(w).length, 0) + mtdAbnormalCount,
    [mtdAbnormalCount]
  );

  return (
    <div className="min-h-full bg-background px-4 py-4">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Activity className="size-5 text-accent" />
            AMR 周度 KPI Dashboard
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Salesforce 周度KPI看板 · As of {REFRESHED_AT} · {WIDGETS.length} widgets · only source-exposed data
            points shown
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAbnormal((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
              showAbnormal
                ? 'border-rose-500/50 bg-rose-500/15 text-rose-200'
                : 'border-border bg-card/50 text-muted-foreground hover:text-foreground'
            )}
          >
            <Filter className="size-3.5" />
            Show Abnormal
            {totalAbnormal > 0 && (
              <span className={cn('ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold', showAbnormal ? 'bg-rose-500/30 text-rose-100' : 'bg-rose-500/20 text-rose-300')}>
                {totalAbnormal}
              </span>
            )}
          </button>
          <button
            title="Data refreshes when a new dashboard DOM snapshot is provided"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* CSAT MTD (month-to-date, excluding DTC + OR) */}
      <div className="mb-4">
        <CsatMtdSection showAbnormal={showAbnormal} />
      </div>

      {/* Widget grid — 4 cols xl, 3 cols lg, 2 cols md, 1 col sm */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {orderedWidgets.map((w) => (
          <WidgetCard
            key={w.id}
            widget={w}
            showAbnormal={showAbnormal}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            isDragging={draggingId === w.id}
          />
        ))}
      </div>

      {/* Money Go High scoring matrix */}
      <div className="mt-6">
        <section className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-md">
          <header className="flex items-center gap-2 border-b border-border/40 px-4 py-3">
            <Trophy className="size-4 text-accent" />
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-foreground">KPI Money Go High! — Crazy New 2.0</h2>
              <p className="truncate text-[11px] text-muted-foreground">
                October 2026 scoring matrix · weighted KPI achievement → payout score · thresholds double as the
                "Show Abnormal" filter source
              </p>
            </div>
          </header>
          <div className="p-4">
            <MoneyGoHighWidget />
          </div>
        </section>
      </div>

      <footer className="mt-4 pb-4 text-center text-[11px] text-muted-foreground">
        Data verbatim from the Salesforce dashboard DOM snapshot · drag widgets to reorder (positions saved locally)
      </footer>
    </div>
  );
}
