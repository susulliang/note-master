import { useMemo, useState, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  RefreshCw,
  Activity,
  Trophy,
  Wallet,
  Target,
  Filter,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isAbnormal, type Direction } from '@/lib/kpi-thresholds';
import { useCsatReport } from '@/hooks/use-csat-report';
import { useOneTouchReport } from '@/hooks/use-one-touch-report';
import { useDailiesReport } from '@/hooks/use-dailies-report';
import { countMtdShifts } from '@/lib/roster-shifts';
import type { CsatReportState } from '@/hooks/use-csat-report';
import type { OneTouchReportState } from '@/hooks/use-one-touch-report';
import type { DailiesState } from '@/hooks/use-dailies-report';
import { CsatReportSection } from '@/components/CsatReportSection';
import { OneTouchSection } from '@/components/OneTouchSection';
import { DailiesSection } from '@/components/DailiesSection';

/**
 * AMR Contact Center — KPI Dashboard.
 *
 * Data sections:
 *  - CSAT: live-parsed from the newest Salesforce CSAT export (*.xlsx) dropped
 *    into the sf_reports/ folder by the automated report workflow.
 *  - One Touch MTD: live-parsed from the newest One-touch monthly export.
 *  - Dailies: MTD Call / Chat / Email volume from four Salesforce exports,
 *    with team average per-shift dailies against the roster.
 *  - KPI Money Go High: October 2026 scoring matrix (static).
 * The "Show Abnormal" toggle filters the CSAT agent graph against the KPI
 * threshold and dims the One-touch parliament seats below 72%.
 */

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
// Mini dashboard — compact numbers-only 720p (1280x720) layout
// ---------------------------------------------------------------------------

function MiniStatCard({
  label,
  children,
  accent = 'text-foreground',
}: {
  label: string;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/40 p-3 backdrop-blur-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('mt-1', accent)}>{children}</div>
    </div>
  );
}

/** Compact semicircle parliament for the mini One Touch widget. */
function MiniParliament({ agents, showAbnormal }: { agents: { owner: string; rate: number }[]; showAbnormal: boolean }) {
  const sorted = [...agents].sort((a, b) => b.rate - a.rate);
  const count = sorted.length;
  const rings = 6;
  const seats: { x: number; y: number; r: number }[] = [];
  const W = 320;
  const H = 150;
  const CX = W / 2;
  const maxR = Math.min(W / 2 - 12, H - 8);
  for (let ring = 0; ring < rings; ring++) {
    const ringR = maxR * (0.35 + (ring / (rings - 1)) * 0.65);
    const arcAngle = Math.PI * (0.82 + ring * 0.03);
    const segs = Math.max(1, Math.round((arcAngle / (2 * Math.PI)) * count * 1.6));
    for (let s = 0; s < segs; s++) {
      const t = segs === 1 ? 0.5 : s / (segs - 1);
      const angle = Math.PI - (arcAngle * t) - (Math.PI - arcAngle) / 2;
      seats.push({
        x: CX + ringR * Math.cos(angle),
        y: H - ringR * Math.sin(angle),
        r: 5.5,
      });
    }
  }
  const seatColor = (rate: number) => {
    if (rate >= 90) return '#34d399';
    if (rate >= 80) return '#38bdf8';
    if (rate >= 72) return '#fbbf24';
    return '#fb7185';
  };
  return (
    <svg width={W} height={H} className="mx-auto">
      {seats.slice(0, count).map((s, i) => {
        const a = sorted[i]!;
        const low = a.rate < 72;
        const dim = showAbnormal && !low;
        return (
          <circle
            key={i}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill={seatColor(a.rate)}
            fillOpacity={dim ? 0.12 : 0.92}
            stroke={low ? '#fb7185' : 'transparent'}
            strokeWidth={low ? 1 : 0}
          >
            <title>{`${a.owner}: ${a.rate.toFixed(1)}%`}</title>
          </circle>
        );
      })}
    </svg>
  );
}

function MiniDashboard({
  csatState,
  touchState,
  dailiesState,
  showAbnormal,
}: {
  csatState: CsatReportState;
  touchState: OneTouchReportState;
  dailiesState: DailiesState;
  showAbnormal: boolean;
}) {
  const shifts = countMtdShifts(undefined, undefined, undefined, ['Chat', 'Call', 'FR Call']);
  const chatShifts = countMtdShifts(undefined, undefined, undefined, ['Chat']).total;
  const callShifts = countMtdShifts(undefined, undefined, undefined, ['Call', 'FR Call']).total;

  const csat = csatState.status === 'ready' ? csatState.report.total : null;
  const touch = touchState.status === 'ready' ? touchState.report.total : null;
  const dailies = dailiesState.status === 'ready' ? dailiesState.data : null;

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* CSAT */}
      <MiniStatCard label="CSAT MTD">
        {csat ? (
          <div className="flex items-end justify-between">
            <div>
              <div className={cn('text-5xl font-black tabular-nums', csat.csat >= 85 ? 'text-emerald-300' : 'text-rose-300')}>
                {csat.csat.toFixed(1)}
                <span className="text-2xl">%</span>
              </div>
              <div className="mt-1 flex gap-3 text-xs">
                <span className="text-emerald-300">✓ {csat.good}</span>
                <span className="text-rose-300">✗ {csat.bad}</span>
              </div>
            </div>
            <div className="h-14 w-2 rounded-full bg-rose-500/30 overflow-hidden">
              <div
                className="w-full bg-emerald-400"
                style={{ height: `${csat.csat}%`, marginTop: `${100 - csat.csat}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="text-2xl text-muted-foreground">—</div>
        )}
      </MiniStatCard>

      {/* One Touch */}
      <MiniStatCard label="One Touch MTD">
        {touch ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className={cn('text-4xl font-black tabular-nums', touch.rate >= 72 ? 'text-emerald-300' : 'text-rose-300')}>
                {touch.rate.toFixed(1)}
                <span className="text-xl">%</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {touch.oneTime}/{touch.closed}
              </span>
            </div>
            <div className="-mt-2">
              <MiniParliament
                agents={touchState.status === 'ready' ? touchState.report.agents.map((a) => ({ owner: a.owner, rate: a.rate })) : []}
                showAbnormal={showAbnormal}
              />
            </div>
          </>
        ) : (
          <div className="text-2xl text-muted-foreground">—</div>
        )}
      </MiniStatCard>

      {/* Dailies */}
      <MiniStatCard label="Dailies (per shift)">
        {dailies ? (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">Grand total</span>
              <span className="font-mono text-2xl font-black tabular-nums text-fuchsia-200">
                {(dailies.call.handled + dailies.chat.total + dailies.email.total).toLocaleString()}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <div className="rounded-md bg-amber-500/10 px-2 py-1 text-center ring-1 ring-amber-500/25">
                <div className="text-[9px] text-muted-foreground">Call</div>
                <div className="font-mono text-lg font-bold tabular-nums text-amber-200">
                  {(dailies.call.handled / callShifts).toFixed(1)}
                </div>
              </div>
              <div className="rounded-md bg-sky-500/10 px-2 py-1 text-center ring-1 ring-sky-500/25">
                <div className="text-[9px] text-muted-foreground">Chat</div>
                <div className="font-mono text-lg font-bold tabular-nums text-sky-200">
                  {(dailies.chat.total / chatShifts).toFixed(1)}
                </div>
              </div>
              <div className="rounded-md bg-violet-500/10 px-2 py-1 text-center ring-1 ring-violet-500/25">
                <div className="text-[9px] text-muted-foreground">Email</div>
                <div className="font-mono text-lg font-bold tabular-nums text-violet-200">
                  {(dailies.email.total / shifts.total).toFixed(1)}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-2xl text-muted-foreground">—</div>
        )}
      </MiniStatCard>

      {/* KPI */}
      <MiniStatCard label="KPI Money Go High">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[10px] text-muted-foreground">Total score</div>
            <div className="text-4xl font-black tabular-nums text-emerald-300">{MONEY_TOTAL_SCORE}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground">Settlement</div>
            <div className="text-3xl font-black tabular-nums text-foreground">×{MONEY_SETTLEMENT_COEFFICIENT}</div>
          </div>
        </div>
      </MiniStatCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dash component
// ---------------------------------------------------------------------------

export default function Dash() {
  const [showAbnormal, setShowAbnormal] = useState(false);
  const [miniMode, setMiniMode] = useState(false);
  const { state: csatState, refreshing: csatRefreshing, reload: reloadCsat } = useCsatReport();
  const { state: touchState, refreshing: touchRefreshing, reload: reloadTouch } = useOneTouchReport();
  const { state: dailiesState, refreshing: dailiesRefreshing, reload: reloadDailies } = useDailiesReport();

  const reloadAll = useCallback(() => {
    reloadCsat();
    reloadTouch();
    reloadDailies();
  }, [reloadCsat, reloadTouch, reloadDailies]);

  const totalAbnormal = useMemo(() => {
    const csat = csatState.status === 'ready'
      ? csatState.report.agents.filter((a) => isAbnormal('csat', a.csat)).length
      : 0;
    const touch = touchState.status === 'ready'
      ? touchState.report.agents.filter((a) => isAbnormal('oneTouchMtd', a.rate)).length
      : 0;
    return csat + touch;
  }, [csatState, touchState]);

  const isLoading = csatState.status === 'loading' || touchState.status === 'loading' || dailiesState.status === 'loading';
  const refreshing = csatRefreshing || touchRefreshing || dailiesRefreshing;

  return (
    <div className="min-h-full bg-background px-4 py-4">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Activity className="size-5 text-accent" />
            AMR KPI Dashboard
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Salesforce reports auto-loaded from{' '}
            <span className="font-mono text-muted-foreground/80">sf_reports/</span> · KPI thresholds from Money Go
            High
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMiniMode((v) => !v)}
            title={miniMode ? 'Switch to full dashboard' : 'Compact 720p view — numbers only'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
              miniMode
                ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
                : 'border-border bg-card/50 text-muted-foreground hover:text-foreground'
            )}
          >
            {miniMode ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            {miniMode ? 'Full View' : 'Mini View'}
          </button>
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
            onClick={reloadAll}
            disabled={isLoading}
            title="Re-scan sf_reports/ for the newest exports"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* Mini view — compact numbers-only 720p layout */}
      {miniMode && (
        <MiniDashboard
          csatState={csatState}
          touchState={touchState}
          dailiesState={dailiesState}
          showAbnormal={showAbnormal}
        />
      )}

      {/* Full view */}
      {!miniMode && (
        <>
      {/* CSAT — live from the newest sf_reports export */}
      <div className="mb-4">
        <CsatReportSection state={csatState} showAbnormal={showAbnormal} onRetry={reloadCsat} />
      </div>

      {/* One Touch MTD — live from the newest monthly export */}
      <div className="mb-4">
        <OneTouchSection state={touchState} showAbnormal={showAbnormal} onRetry={reloadTouch} />
      </div>

      {/* Dailies — MTD Call / Chat / Email volume + per-shift averages */}
      <div className="mb-4">
        <DailiesSection state={dailiesState} onRetry={reloadDailies} />
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
        </>
      )}

      <footer className={cn('mt-4 pb-4 text-center text-[11px] text-muted-foreground', miniMode && 'hidden')}>
        CSAT parsed live from the newest Salesforce export in sf_reports/ · click Refresh to pick up new files
      </footer>
    </div>
  );
}
