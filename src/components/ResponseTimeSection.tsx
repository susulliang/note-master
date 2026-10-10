import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import {
  AlertTriangle,
  Clock,
  Gauge,
  Headset,
  Mail,
  RefreshCw,
  TimerReset,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResponseTimeState } from '@/hooks/use-response-time-report';

/**
 * Response Times widget — three MTD average-response-time metrics (Chat avg
 * response, Email first response, Email avg response) drawn from the
 * "Average response time" / "Avg Response Time" Salesforce exports.
 *
 * Each metric shows the two headline numbers the user cares about:
 *   • Team Average  — the Total-row value (volume-weighted, real customer
 *                     experience).
 *   • Agent Average — the unweighted mean of per-agent averages (how the
 *                     typical agent is doing).
 * Per-agent bars are overlaid with three reference lines: threshold (red,
 * the abnormality cutoff), team avg (solid accent), agent avg (dotted).
 */

type MetricKey = 'chat' | 'emailFirst' | 'emailAvg';

const METRICS: Record<
  MetricKey,
  {
    label: string;
    icon: typeof Headset;
    grad: string;
    text: string;
    ring: string;
    bg: string;
    border: string;
    bar: string;
    unit: string;
    thresholdNote: string;
  }
> = {
  chat: {
    label: 'Chat avg response',
    icon: Headset,
    grad: 'from-sky-300 to-sky-600',
    text: 'text-sky-300',
    ring: 'ring-sky-500/40',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/30',
    bar: '#38bdf8',
    unit: 's',
    thresholdNote: '≤ 26s',
  },
  emailFirst: {
    label: 'Email first response',
    icon: TimerReset,
    grad: 'from-violet-300 to-violet-600',
    text: 'text-violet-300',
    ring: 'ring-violet-500/40',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/30',
    bar: '#a78bfa',
    unit: 'h',
    thresholdNote: '≤ 4h',
  },
  emailAvg: {
    label: 'Email avg response',
    icon: Mail,
    grad: 'from-fuchsia-300 to-fuchsia-600',
    text: 'text-fuchsia-300',
    ring: 'ring-fuchsia-500/40',
    bg: 'bg-fuchsia-500/10',
    border: 'border-fuchsia-500/30',
    bar: '#e879f9',
    unit: 'h',
    thresholdNote: '≤ 4h',
  },
};

function shortName(name: string): string {
  const parts = name.replace(/[.]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
  if (parts.length === 1) return parts[0]!.slice(0, 10);
  return `${parts[0]} ${parts[parts.length - 1]![0] ?? ''}.`.replace(/\s+\.$/, '.');
}

function fmt(value: number, unit: string): string {
  if (!value) return '—';
  return unit === 's' ? value.toFixed(1) : value.toFixed(2);
}

function RtTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0]!;
  const unit = (d.payload as { unit?: string }).unit ?? '';
  return (
    <div className="rounded-lg border border-border/80 bg-[#0d1117]/95 px-2.5 py-1.5 text-xs shadow-xl backdrop-blur-md">
      <div className="font-semibold text-foreground">{label}</div>
      <div className="font-mono tabular-nums text-muted-foreground">
        {typeof d.value === 'number' ? d.value.toFixed(2) : d.value}
        {unit}
      </div>
    </div>
  );
}

interface MetricColumnProps {
  metric: MetricKey;
  report: import('@/lib/sf-reports').ResponseTimeReport;
  showAbnormal: boolean;
  mini?: boolean;
}

function MetricColumn({ metric, report, showAbnormal, mini = false }: MetricColumnProps) {
  const meta = METRICS[metric];
  const Icon = meta.icon;
  const teamAbnormal = report.teamAvg > report.threshold;
  const agentAbnormal = report.agentAvg > report.threshold;

  const data = useMemo(() => {
    const rows = report.agents
      .map((a) => ({ name: shortName(a.owner), value: a.value, unit: meta.unit, abnormal: a.value > report.threshold }))
      .sort((a, b) => b.value - a.value);
    return showAbnormal ? rows.filter((r) => r.abnormal) : rows;
  }, [report.agents, report.threshold, meta.unit, showAbnormal]);

  // X-axis upper bound: enough headroom above the max value/threshold.
  const maxVal = Math.max(report.threshold, report.teamAvg, report.agentAvg, ...data.map((d) => d.value));
  const xMax = Math.ceil((maxVal * 1.15 * 10) / 10) / 10;

  return (
    <div className={cn('flex flex-col rounded-xl border bg-background/30 p-3', meta.border)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className={cn('flex size-7 items-center justify-center rounded-lg ring-1', meta.bg, meta.ring)}>
          <Icon className={cn('size-4', meta.text)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-foreground">{meta.label}</div>
          <div className="text-[10px] text-muted-foreground">
            threshold {report.threshold}
            {meta.unit} · {meta.thresholdNote}
          </div>
        </div>
      </div>

      {/* Team avg + Agent avg tiles */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border/50 bg-card/40 p-2">
          <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Gauge className="size-2.5" /> Team avg
          </div>
          <div
            className={cn(
              'mt-0.5 text-2xl font-black leading-none tabular-nums',
              teamAbnormal ? 'text-rose-300' : meta.text,
            )}
          >
            {fmt(report.teamAvg, meta.unit)}
            <span className="text-sm font-normal text-muted-foreground">{meta.unit}</span>
          </div>
          <div className={cn('text-[9px]', teamAbnormal ? 'text-rose-300' : 'text-emerald-300/80')}>
            {teamAbnormal ? `▲ ${(report.teamAvg - report.threshold).toFixed(2)} over` : 'within threshold'}
          </div>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/40 p-2">
          <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Users className="size-2.5" /> Agent avg
          </div>
          <div
            className={cn(
              'mt-0.5 text-2xl font-black leading-none tabular-nums',
              agentAbnormal ? 'text-rose-300' : 'text-foreground',
            )}
          >
            {fmt(report.agentAvg, meta.unit)}
            <span className="text-sm font-normal text-muted-foreground">{meta.unit}</span>
          </div>
          <div className={cn('text-[9px]', agentAbnormal ? 'text-rose-300' : 'text-emerald-300/80')}>
            {agentAbnormal ? `▲ ${(report.agentAvg - report.threshold).toFixed(2)} over` : 'within threshold'}
          </div>
        </div>
      </div>

      {/* Per-agent bar chart with reference lines (hidden in mini mode) */}
      {!mini && (
      <div className="mt-3 min-h-0 flex-1">
        {data.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
            No agents above threshold.
          </div>
        ) : (
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 8, right: 48, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} opacity={0.5} />
                <XAxis
                  type="number"
                  domain={[0, xMax]}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
                  unit={meta.unit}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={84}
                  tick={{ fill: 'var(--foreground)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<RtTooltip />} cursor={{ fill: 'rgba(88,166,255,0.08)' }} />
                {/* Threshold */}
                <ReferenceLine
                  x={report.threshold}
                  stroke="#f85149"
                  strokeDasharray="5 3"
                  strokeWidth={1.5}
                  label={{ value: `thr ${report.threshold}${meta.unit}`, fill: '#f85149', fontSize: 9, position: 'top' }}
                />
                {/* Team avg */}
                <ReferenceLine
                  x={report.teamAvg}
                  stroke="var(--accent)"
                  strokeWidth={1.5}
                  label={{ value: 'team', fill: 'var(--accent)', fontSize: 9, position: 'insideTopRight' }}
                />
                {/* Agent avg */}
                <ReferenceLine
                  x={report.agentAvg}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="2 4"
                  strokeWidth={1}
                  label={{ value: 'agent', fill: 'var(--muted-foreground)', fontSize: 9, position: 'insideBottomRight' }}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={14}>
                  {data.map((d, i) => (
                    <Cell key={i} fill={d.abnormal ? '#fb7185' : meta.bar} fillOpacity={d.abnormal ? 0.9 : 0.55} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

interface ResponseTimeSectionProps {
  state: ResponseTimeState;
  showAbnormal: boolean;
  onRetry: () => void;
  /** Compact mode: hide per-agent bar charts, keep team/agent avg tiles. */
  mini?: boolean;
}

export function ResponseTimeSection({ state, showAbnormal, onRetry, mini = false }: ResponseTimeSectionProps) {
  const abnormalCount = useMemo(() => {
    if (state.status !== 'ready') return 0;
    const { chat, emailFirst, emailAvg } = state.data;
    return (
      chat.agents.filter((a) => a.value > chat.threshold).length +
      emailFirst.agents.filter((a) => a.value > emailFirst.threshold).length +
      emailAvg.agents.filter((a) => a.value > emailAvg.threshold).length
    );
  }, [state]);

  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-card/40 backdrop-blur-md">
      <header className="flex flex-wrap items-center gap-2 border-b border-border/40 px-4 py-3">
        <div className="flex size-7 items-center justify-center rounded-lg bg-cyan-500/15 ring-1 ring-cyan-500/30">
          <Clock className="size-4 text-cyan-300" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">Response Times — MTD</h2>
          <p className="truncate text-[11px] text-muted-foreground">
            Chat avg response · Email first response · Email avg response · team avg (weighted) vs agent avg (mean)
          </p>
        </div>
        {abnormalCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-300 ring-1 ring-rose-500/40">
            <AlertTriangle className="size-2.5" />
            {abnormalCount} agent-metrics over threshold
          </span>
        )}
      </header>

      {state.status === 'loading' && (
        <div className="grid gap-4 p-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[400px] rounded-xl bg-muted-foreground/10" />
          ))}
        </div>
      )}

      {state.status === 'error' && (
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-rose-500/15 ring-1 ring-rose-500/40">
            <AlertTriangle className="size-5 text-rose-300" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Couldn’t load the response-time reports</p>
            <p className="mt-1 max-w-md text-[11px] text-muted-foreground">{state.message}</p>
          </div>
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-cyan-500/50 hover:text-cyan-200"
          >
            <RefreshCw className="size-3.5" />
            Retry
          </button>
        </div>
      )}

      {state.status === 'ready' && (
        <div className="grid gap-4 p-4 md:grid-cols-3">
          <MetricColumn metric="chat" report={state.data.chat} showAbnormal={showAbnormal} mini={mini} />
          <MetricColumn metric="emailFirst" report={state.data.emailFirst} showAbnormal={showAbnormal} mini={mini} />
          <MetricColumn metric="emailAvg" report={state.data.emailAvg} showAbnormal={showAbnormal} mini={mini} />
        </div>
      )}
    </section>
  );
}
