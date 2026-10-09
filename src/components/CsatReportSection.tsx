import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import {
  AlertTriangle,
  BadgeCheck,
  FileSpreadsheet,
  MessagesSquare,
  RefreshCw,
  Smile,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { THRESHOLDS, isAbnormal } from '@/lib/kpi-thresholds';
import type { CsatAgentRow } from '@/lib/sf-reports';
import type { CsatReportState } from '@/hooks/use-csat-report';

/**
 * CSAT widget — live data from the newest Salesforce CSAT export in
 * sf_reports/. Left: month-to-date overall summary. Right: vertical per-agent
 * CSAT bars with a dotted KPI threshold line; hover a bar for the good/bad
 * survey counts. The global "Show Abnormal" toggle filters the graph to
 * agents below the KPI threshold.
 */

interface CsatReportSectionProps {
  state: CsatReportState;
  showAbnormal: boolean;
  onRetry: () => void;
}

const T = THRESHOLDS.csat; // { value: 85, direction: 'higher' }

/** Kevin Woods → "Kevin W." · George Scheddi Plantagenet → "George P." */
function shortName(name: string): string {
  const parts = name.replace(/[.]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
  if (parts.length === 1) return parts[0]!.slice(0, 10);
  const first = parts[0]!;
  const lastInitial = parts[parts.length - 1]![0];
  return lastInitial ? `${first} ${lastInitial}.` : first;
}

// ---------------------------------------------------------------------------
// Hover panel — floating glass card with goods / bads
// ---------------------------------------------------------------------------

function CsatTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0]!.payload as CsatAgentRow;
  const abnormal = isAbnormal('csat', d.csat);
  return (
    <div className="min-w-[180px] rounded-xl border border-border/80 bg-[#0d1117]/95 px-3.5 py-3 shadow-2xl shadow-black/50 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-foreground">{d.owner}</span>
        <span
          className={cn(
            'rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1',
            abnormal
              ? 'bg-rose-500/15 text-rose-300 ring-rose-500/40'
              : 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40'
          )}
        >
          {abnormal ? 'Below KPI' : 'On track'}
        </span>
      </div>
      <div
        className={cn(
          'mt-1.5 text-2xl font-black tabular-nums leading-none',
          abnormal ? 'text-rose-300' : 'text-emerald-300'
        )}
      >
        {d.csat.toFixed(2)}
        <span className="text-sm font-bold">%</span>
      </div>
      <div className="mt-2.5 space-y-1.5 border-t border-border/50 pt-2.5">
        <div className="flex items-center justify-between gap-4 text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <ThumbsUp className="size-3 text-emerald-400" />
            Good
          </span>
          <span className="font-mono font-bold tabular-nums text-emerald-300">{d.good}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <ThumbsDown className="size-3 text-rose-400" />
            Bad
          </span>
          <span className="font-mono font-bold tabular-nums text-rose-300">{d.bad}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <MessagesSquare className="size-3 text-accent" />
            Surveys
          </span>
          <span className="font-mono font-bold tabular-nums text-foreground">{d.records}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

export function CsatReportSection({ state, showAbnormal, onRetry }: CsatReportSectionProps) {
  const report = state.status === 'ready' ? state.report : null;

  const abnormalAgents = useMemo(
    () => (report ? report.agents.filter((a) => isAbnormal('csat', a.csat)) : []),
    [report]
  );

  const chartData = useMemo(() => {
    if (!report) return [];
    return showAbnormal ? abnormalAgents : report.agents;
  }, [report, showAbnormal, abnormalAgents]);

  const overallAbnormal = report ? isAbnormal('csat', report.total.csat) : false;
  const surveyed = report ? report.total.good + report.total.bad : 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-card/40 backdrop-blur-md">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-2 border-b border-border/40 px-4 py-3">
        <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/30">
          <Smile className="size-4 text-emerald-300" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">
            CSAT — excluding DTC + other regions
          </h2>
          <p className="flex min-w-0 items-center gap-1.5 truncate text-[11px] text-muted-foreground">
            <FileSpreadsheet className="size-3 shrink-0" />
            {report ? (
              <span className="truncate">
                {report.fileName}
                {report.asOf ? ` · As of ${report.asOf}` : ''}
              </span>
            ) : (
              'Salesforce export · sf_reports/'
            )}
          </p>
        </div>
        {report && abnormalAgents.length > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-300 ring-1 ring-rose-500/40">
            <AlertTriangle className="size-2.5" />
            {abnormalAgents.length} below {T.value}%
          </span>
        )}
      </header>

      {/* Body */}
      {state.status === 'loading' && (
        <div className="grid animate-pulse gap-5 p-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="h-12 w-32 rounded-lg bg-muted-foreground/10" />
            <div className="h-4 w-48 rounded bg-muted-foreground/10" />
            <div className="grid grid-cols-3 gap-2 pt-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-muted-foreground/10" />
              ))}
            </div>
          </div>
          <div className="h-[380px] rounded-xl bg-muted-foreground/10" />
        </div>
      )}

      {state.status === 'error' && (
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-rose-500/15 ring-1 ring-rose-500/40">
            <AlertTriangle className="size-5 text-rose-300" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Couldn’t load the CSAT report</p>
            <p className="mt-1 max-w-md text-[11px] text-muted-foreground">{state.message}</p>
          </div>
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-emerald-500/50 hover:text-emerald-200"
          >
            <RefreshCw className="size-3.5" />
            Retry
          </button>
        </div>
      )}

      {report && (
        <div className="grid gap-5 p-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* Left — overall summary */}
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-border/50 bg-background/30 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Overall CSAT · this month
              </div>
              <div className="mt-1 flex items-end gap-2">
                <span
                  className={cn(
                    'text-5xl font-black leading-none tabular-nums tracking-tight',
                    overallAbnormal ? 'text-rose-300' : 'text-emerald-300'
                  )}
                >
                  {report.total.csat.toFixed(2)}
                  <span className="text-xl">%</span>
                </span>
              </div>
              <div className="mt-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1',
                    overallAbnormal
                      ? 'bg-rose-500/15 text-rose-300 ring-rose-500/40'
                      : 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40'
                  )}
                >
                  {overallAbnormal ? <AlertTriangle className="size-2.5" /> : <BadgeCheck className="size-2.5" />}
                  {overallAbnormal ? 'Below KPI' : 'On track'} · KPI {T.value}%{' '}
                  {T.direction === 'higher' ? 'min' : 'max'}
                </span>
              </div>

              {/* Good / bad ratio bar */}
              <div className="mt-4">
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-border/40">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600"
                    style={{ width: `${surveyed ? (report.total.good / surveyed) * 100 : 0}%` }}
                  />
                  <div
                    className="h-full bg-gradient-to-r from-rose-400 to-rose-600"
                    style={{ width: `${surveyed ? (report.total.bad / surveyed) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-center">
                <ThumbsUp className="mx-auto size-3.5 text-emerald-300/80" />
                <div className="mt-1 text-lg font-black tabular-nums text-emerald-200">
                  {report.total.good}
                </div>
                <div className="text-[9px] uppercase tracking-wide text-emerald-300/60">Good</div>
              </div>
              <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-center">
                <ThumbsDown className="mx-auto size-3.5 text-rose-300/80" />
                <div className="mt-1 text-lg font-black tabular-nums text-rose-200">
                  {report.total.bad}
                </div>
                <div className="text-[9px] uppercase tracking-wide text-rose-300/60">Bad</div>
              </div>
              <div className="rounded-xl border border-border/50 bg-background/30 p-3 text-center">
                <MessagesSquare className="mx-auto size-3.5 text-accent/80" />
                <div className="mt-1 text-lg font-black tabular-nums text-foreground">
                  {report.total.records}
                </div>
                <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Surveys</div>
              </div>
            </div>

            <div className="mt-auto rounded-xl border border-border/40 bg-background/20 px-3 py-2 text-[10px] text-muted-foreground">
              {report.agents.length} agents in report · sorted by bad count
            </div>
          </div>

          {/* Right — per-agent vertical CSAT graph */}
          <div className="rounded-xl border border-border/50 bg-background/30 p-3">
            <div className="mb-1 flex items-center justify-between px-1">
              <div className="text-[11px] font-semibold text-foreground">CSAT by agent</div>
              <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block size-2 rounded-sm bg-gradient-to-b from-emerald-300 to-emerald-600" />
                  on / above {T.value}%
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block size-2 rounded-sm bg-gradient-to-b from-rose-300 to-rose-600" />
                  below
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-3 border-t-2 border-dashed border-rose-400" />
                  KPI
                </span>
              </div>
            </div>

            {chartData.length === 0 ? (
              <div className="flex h-[380px] flex-col items-center justify-center gap-2 text-center">
                <BadgeCheck className="size-8 text-emerald-400/70" />
                <p className="text-xs font-semibold text-foreground">
                  All {report.agents.length} agents at or above {T.value}%
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Turn off “Show Abnormal” to see every agent.
                </p>
              </div>
            ) : (
              <div className="h-[380px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 14, right: 8, left: -14, bottom: 0 }}
                    barCategoryGap="28%"
                  >
                    <defs>
                      <linearGradient id="csatBarHealthy" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6ee7b7" />
                        <stop offset="100%" stopColor="#047857" />
                      </linearGradient>
                      <linearGradient id="csatBarAbnormal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#fda4af" />
                        <stop offset="100%" stopColor="#be123c" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} opacity={0.5} />
                    <XAxis
                      dataKey="owner"
                      tickFormatter={shortName}
                      interval={0}
                      height={58}
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 9.5 }}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--border)' }}
                      angle={-38}
                      textAnchor="end"
                    />
                    <YAxis
                      domain={[0, 100]}
                      ticks={[0, 25, 50, 75, T.value, 100]}
                      tickFormatter={(v: number) => `${v}%`}
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(88, 166, 255, 0.08)', radius: 4 }}
                      content={<CsatTooltip />}
                    />
                    <ReferenceLine
                      y={T.value}
                      stroke="#fb7185"
                      strokeDasharray="5 4"
                      strokeWidth={1.5}
                      label={{
                        value: `KPI ${T.value}%`,
                        position: 'insideTopLeft',
                        fill: '#fda4af',
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    />
                    <Bar dataKey="csat" radius={[5, 5, 0, 0]} maxBarSize={26}>
                      {chartData.map((a) => (
                        <Cell
                          key={a.owner}
                          fill={
                            isAbnormal('csat', a.csat)
                              ? 'url(#csatBarAbnormal)'
                              : 'url(#csatBarHealthy)'
                          }
                        />
                      ))}
                      {showAbnormal && (
                        <LabelList
                          dataKey="csat"
                          position="top"
                          formatter={(v: number) => `${v.toFixed(0)}%`}
                          style={{ fill: '#fda4af', fontSize: 9, fontWeight: 700 }}
                        />
                      )}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
