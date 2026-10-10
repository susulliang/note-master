import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileSpreadsheet,
  Info,
  RefreshCw,
  Search,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { countMtdShifts, asOfDate, matchRosterShift, monthStart } from '@/lib/roster-shifts';
import { useCsatReport } from '@/hooks/use-csat-report';
import { useOneTouchReport } from '@/hooks/use-one-touch-report';
import { useDailiesReport } from '@/hooks/use-dailies-report';
import { useResponseTimeReport } from '@/hooks/use-response-time-report';
import type { OneTouchChannel, ResponseTimeReport } from '@/lib/sf-reports';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  agentBreachCount,
  buildDashAgents,
  DASH_METRICS,
  formatMetric,
  isMetricAbnormal,
  metricGap,
  metricMeta,
  metricValue,
  normalizeAgentName,
  type DashAgent,
  type DashMetricId,
} from '@/lib/dash-model';
import { cn } from '@/lib/utils';

type View = 'overview' | 'explore' | 'scorecard';
type ExploreView = 'quality' | 'workload' | 'response';
type QualityMetric = 'csat' | 'oneTouch';
type SortDirection = 'ascending' | 'descending';
const DASH_PREFERENCES_KEY = '__app_ecovacs_dash_preferences_v1';

function readDashPreferences(): { view: View; explore: ExploreView; qualityMetric: QualityMetric; briefing: boolean } {
  const fallback = { view: 'overview' as View, explore: 'quality' as ExploreView, qualityMetric: 'csat' as QualityMetric, briefing: false };
  try {
    if (typeof window === 'undefined') return fallback;
    const raw = localStorage.getItem(DASH_PREFERENCES_KEY);
    if (!raw) return fallback;
    const value = JSON.parse(raw) as Record<string, unknown>;
    return {
      view: value.view === 'explore' || value.view === 'scorecard' ? value.view : 'overview',
      explore: value.explore === 'workload' || value.explore === 'response' ? value.explore : 'quality',
      qualityMetric: value.qualityMetric === 'oneTouch' ? 'oneTouch' : 'csat',
      briefing: value.briefing === true,
    };
  } catch {
    return fallback;
  }
}

const PANEL = 'rounded-xl border border-border/60 bg-card/45 backdrop-blur-md';
const CONTROL =
  'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-border/70 bg-background/45 px-3 text-xs font-semibold text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70';
const ACTIVE_CONTROL = 'border-accent/50 bg-accent/10 text-foreground';
const ALERT_CONTROL = 'border-rose-500/40 bg-rose-500/10 text-rose-200';

const MONEY_KPIS = [
  { category: 'Quality', name: 'CSAT', challenge: '95%', target: '90%', threshold: '85%', weight: 20, achievement: '96%', score: 22.05, direction: 'higher' as const },
  { category: 'Quality', name: 'One-touch Rate', challenge: '76%', target: '72%', threshold: '68%', weight: 15, achievement: '71.86%', score: 16.5, direction: 'higher' as const },
  { category: 'Quality', name: 'Bad Reviews on AMZ', challenge: '8%', target: '10%', threshold: '12%', weight: 10, achievement: '11.11%', score: 11, direction: 'lower' as const },
  { category: 'Efficiency', name: 'Daily replies per agent', challenge: '60', target: '50', threshold: '45', weight: 10, achievement: '45', score: 11, direction: 'higher' as const },
  { category: 'Efficiency', name: '20s SLA', challenge: '92%', target: '88%', threshold: '84%', weight: 10, achievement: '95.06%', score: 11, direction: 'higher' as const },
  { category: 'Efficiency', name: 'First Response Time - Email (h)', challenge: '2', target: '4', threshold: '8', weight: 5, achievement: '1.66', score: 5.5, direction: 'lower' as const },
  { category: 'Efficiency', name: 'Avg Response Time - Email (h)', challenge: '4', target: '6', threshold: '10', weight: 10, achievement: '1.95', score: 11, direction: 'lower' as const },
  { category: 'Efficiency', name: 'Avg Response Time - Chat (s)', challenge: '20', target: '23', threshold: '26', weight: 5, achievement: '19.93', score: 5.5, direction: 'lower' as const },
  { category: 'Team Attrition', name: 'Attrition Rate', challenge: '2.50%', target: '5%', threshold: '7.50%', weight: 5, achievement: '0.00%', score: 5.5, direction: 'lower' as const },
];
const SCORE_TOTAL = MONEY_KPIS.reduce((sum, row) => sum + row.score, 0);
const SCORECARD_METRIC_NAMES: Record<DashMetricId, string> = {
  csat: 'CSAT',
  oneTouch: 'One-touch Rate',
  chat: 'Avg Response Time - Chat (s)',
  emailFirst: 'First Response Time - Email (h)',
  emailAvg: 'Avg Response Time - Email (h)',
};
type ScorecardBand = 'Challenge' | 'Target' | 'Threshold' | 'Below';
type MetricBand = ScorecardBand | 'Not reported';
const SCORE_BAND_TEXT: Record<MetricBand, string> = {
  Challenge: 'text-emerald-300',
  Target: 'text-sky-300',
  Threshold: 'text-amber-300',
  Below: 'text-rose-300',
  'Not reported': 'text-muted-foreground',
};
const SCORE_BAND_FILL: Record<ScorecardBand, string> = {
  Challenge: 'bg-emerald-400',
  Target: 'bg-sky-400',
  Threshold: 'bg-amber-400',
  Below: 'bg-rose-400',
};

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString();
}

function pct(value: number): string {
  return `${value.toFixed(1)}%`;
}

type LoadInfo = { status: 'loading' | 'error' | 'ready' | 'stale'; error: string };

function loadInfo(state: { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; refreshError?: string }): LoadInfo {
  if (state.status === 'loading') return { status: 'loading', error: '' };
  if (state.status === 'error') return { status: 'error', error: state.message };
  if (state.refreshError) return { status: 'stale', error: state.refreshError };
  return { status: 'ready', error: '' };
}

function stateLabel(state: LoadInfo['status']): string {
  if (state === 'ready') return 'Ready';
  if (state === 'stale') return 'Previous data';
  if (state === 'loading') return 'Loading';
  return 'Unavailable';
}

function useDashData() {
  const csat = useCsatReport();
  const touch = useOneTouchReport();
  const dailies = useDailiesReport();
  const response = useResponseTimeReport();

  const agents = useMemo(
    () =>
      buildDashAgents(
        csat.state.status === 'ready' ? csat.state.report.agents : [],
        touch.state.status === 'ready' ? touch.state.report.agents : [],
        response.state.status === 'ready'
          ? [response.state.data.chat, response.state.data.emailFirst, response.state.data.emailAvg]
          : [],
      ),
    [csat.state, touch.state, response.state],
  );

  const reload = () => {
    csat.reload();
    touch.reload();
    dailies.reload();
    response.reload();
  };
  const refreshing = csat.refreshing || touch.refreshing || dailies.refreshing || response.refreshing;

  return { csat, touch, dailies, response, agents, reload, refreshing };
}

function ReportSources({
  data,
  open,
  onToggle,
}: {
  data: ReturnType<typeof useDashData>;
  open: boolean;
  onToggle: () => void;
}) {
  const workload = data.dailies.state.status === 'ready' ? data.dailies.state.data : null;
  const response = data.response.state.status === 'ready' ? data.response.state.data : null;
  const sources = [
    {
      label: 'CSAT',
      ...loadInfo(data.csat.state),
      report: data.csat.state.status === 'ready' ? data.csat.state.report : null,
    },
    {
      label: 'One-Touch',
      ...loadInfo(data.touch.state),
      report: data.touch.state.status === 'ready' ? data.touch.state.report : null,
    },
    {
      label: 'Chat volume',
      ...loadInfo(data.dailies.state),
      report: workload?.chat ?? null,
    },
    {
      label: 'Email volume',
      ...loadInfo(data.dailies.state),
      report: workload?.email ?? null,
    },
    {
      label: 'Call metrics',
      ...loadInfo(data.dailies.state),
      report: workload?.call ?? null,
    },
    {
      label: 'Historical queues',
      ...loadInfo(data.dailies.state),
      report: workload?.historical ?? null,
    },
    {
      label: 'Chat response',
      ...loadInfo(data.response.state),
      report: response?.chat ?? null,
    },
    {
      label: 'Email first response',
      ...loadInfo(data.response.state),
      report: response?.emailFirst ?? null,
    },
    {
      label: 'Email avg response',
      ...loadInfo(data.response.state),
      report: response?.emailAvg ?? null,
    },
  ];
  const unavailable = [data.csat.state, data.touch.state, data.dailies.state, data.response.state]
    .filter((state) => {
      const status = loadInfo(state).status;
      return status === 'error' || status === 'stale';
    }).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(CONTROL, unavailable > 0 && 'border-amber-500/40 text-amber-200')}
      >
        {unavailable > 0 ? <CircleAlert className="size-4" /> : <FileSpreadsheet className="size-4" />}
        Data sources
        {unavailable > 0 && <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5">{unavailable}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-30 w-[min(28rem,calc(100vw-7rem))] rounded-xl border border-border bg-popover p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Report coverage</h2>
            <button type="button" onClick={onToggle} aria-label="Close data sources" className="rounded p-1 text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
          <div className="max-h-[min(70vh,32rem)] space-y-2 overflow-y-auto">
            {sources.map((source) => (
              <div key={source.label} className="rounded-lg bg-background/60 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-foreground">{source.label}</span>
                  <span className={cn('text-[11px]', source.status === 'ready' ? 'text-emerald-300' : source.status === 'stale' ? 'text-amber-200' : source.status === 'error' ? 'text-rose-300' : 'text-muted-foreground')}>
                    {stateLabel(source.status)}
                  </span>
                </div>
                {source.report && (
                  <>
                    <div className="mt-1 break-all text-[11px] text-muted-foreground">{source.report.fileName}</div>
                    {'asOf' in source.report && <div className="mt-0.5 text-[11px] text-muted-foreground">As of {source.report.asOf ?? 'date not reported'}</div>}
                  </>
                )}
                {source.error && <div className="mt-1 break-words text-[11px] text-rose-300">{source.error}</div>}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            Report as-of times are supplied by Salesforce. Refresh checks the current report sources.
          </p>
        </div>
      )}
    </div>
  );
}

function MetricTile({
  metric,
  value,
  abnormalCount,
  onClick,
}: {
  metric: DashMetricId;
  value: number | null;
  abnormalCount: number | null;
  onClick: () => void;
}) {
  const meta = metricMeta(metric);
  const scorecardRow = scorecardMetricRow(metric);
  const band = scorecardBandForMetric(metric, value);
  const scaleMax = meta.direction === 'higher'
    ? 100
    : Math.max(meta.threshold * 1.5, value ?? 0, scorecardNumber(scorecardRow?.challenge ?? '0'), 1);
  const axisPosition = (level: number) => Math.min(100, Math.max(0, (
    meta.direction === 'higher' ? level / scaleMax : 1 - level / scaleMax
  ) * 100));
  const position = value === null ? 0 : axisPosition(value);
  const fillBand = band === 'Not reported' ? 'Below' : band;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(PANEL, 'min-w-0 p-3 text-left transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70')}
    >
      <span className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        <span className="truncate">{meta.label}</span>
        <span className="shrink-0">{abnormalCount === null ? 'Loading' : `${abnormalCount} outside limit`}</span>
      </span>
      <span className={cn('mt-2 block font-mono text-2xl font-bold tabular-nums', SCORE_BAND_TEXT[band])}>
        {value === null ? '—' : formatMetric(metric, value)}
      </span>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px]">
        <span className="text-amber-200" title="Scorecard threshold">Thr {scorecardRow?.threshold ?? formatMetric(metric, meta.threshold)}</span>
        <span className="text-sky-200" title="Scorecard target">Target {scorecardRow?.target ?? '—'}</span>
        <span className="text-emerald-200" title="Scorecard challenge">Ch {scorecardRow?.challenge ?? '—'}</span>
        <span className={cn('font-semibold', SCORE_BAND_TEXT[band])}>{band}</span>
      </div>
      {metric === 'csat' && <span className="mt-1 block text-[10px] text-muted-foreground/80">Excludes DTC + other regions</span>}
      <span className="relative mt-2 block h-1.5 overflow-hidden rounded-full bg-border/60" aria-hidden="true">
        <span className={cn('dash-progress-fill absolute inset-y-0 left-0 rounded-full', SCORE_BAND_FILL[fillBand])} style={{ width: `${position}%` }} />
        {scorecardRow && ([
          { label: 'Threshold', value: scorecardNumber(scorecardRow.threshold), color: 'bg-amber-300' },
          { label: 'Target', value: scorecardNumber(scorecardRow.target), color: 'bg-sky-300' },
          { label: 'Challenge', value: scorecardNumber(scorecardRow.challenge), color: 'bg-emerald-300' },
        ]).map((marker) => (
          <span key={marker.label} title={marker.label} className={cn('absolute -top-1 h-3.5 w-px', marker.color)} style={{ left: `${axisPosition(marker.value)}%` }} />
        ))}
      </span>
    </button>
  );
}

function ResponseSummaryTile({
  values,
  abnormalCounts,
  onClick,
}: {
  values: Record<'chat' | 'emailFirst' | 'emailAvg', number | null>;
  abnormalCounts: Record<'chat' | 'emailFirst' | 'emailAvg', number | null>;
  onClick: () => void;
}) {
  const metrics = ['chat', 'emailFirst', 'emailAvg'] as const;
  const totalBreaches = metrics.reduce((sum, metric) => sum + (abnormalCounts[metric] ?? 0), 0);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(PANEL, 'min-w-0 p-3 text-left transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70')}
    >
      <span className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        <span>Response times</span>
        <span className="shrink-0">{totalBreaches} metric breaches</span>
      </span>
      <span className="mt-3 grid grid-cols-3 divide-x divide-border/50">
        {metrics.map((metric) => {
          const meta = metricMeta(metric);
          const value = values[metric];
          const band = scorecardBandForMetric(metric, value);
          const row = scorecardMetricRow(metric);
          return (
            <span key={metric} className="min-w-0 px-2 first:pl-0 last:pr-0">
              <span className="block truncate text-[10px] text-muted-foreground">{meta.shortLabel}</span>
              <span className={cn('mt-1 block truncate font-mono text-lg font-bold tabular-nums', SCORE_BAND_TEXT[band])}>
                {value === null ? '—' : formatMetric(metric, value)}
              </span>
              <span className={cn('mt-1 block truncate text-[9px] font-medium', SCORE_BAND_TEXT[band])}>
                {band}
              </span>
              <span title={row ? `Threshold ${row.threshold} · Target ${row.target} · Challenge ${row.challenge}` : undefined} className="mt-1 block truncate text-[8px] text-muted-foreground">
                <span className="text-amber-200">Thr {row?.threshold ?? '—'}</span>
                {' · '}<span className="text-sky-200">Tgt {row?.target ?? '—'}</span>
                {' · '}<span className="text-emerald-200">Ch {row?.challenge ?? '—'}</span>
              </span>
            </span>
          );
        })}
      </span>
    </button>
  );
}

function AgentMatrix({
  agents,
  emptyMessage,
  onAgent,
  onMetric,
}: {
  agents: DashAgent[];
  emptyMessage: string;
  onAgent: (agent: DashAgent) => void;
  onMetric: (agent: DashAgent, metric: DashMetricId) => void;
}) {
  const [sortMetric, setSortMetric] = useState<DashMetricId | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('descending');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    return [...agents].sort((a, b) => {
      if (sortMetric) {
        const av = metricValue(a, sortMetric);
        const bv = metricValue(b, sortMetric);
        if (av === null && bv !== null) return 1;
        if (bv === null && av !== null) return -1;
        if (av !== null && bv !== null && av !== bv) return (av - bv) * (sortDirection === 'ascending' ? 1 : -1);
      } else {
        const breachDiff = agentBreachCount(b) - agentBreachCount(a);
        if (breachDiff) return breachDiff;
      }
      return a.name.localeCompare(b.name);
    });
  }, [agents, sortMetric, sortDirection]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const rows = sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  const sortBy = (metric: DashMetricId) => {
    setPage(0);
    if (sortMetric === metric) setSortDirection((current) => current === 'ascending' ? 'descending' : 'ascending');
    else {
      setSortMetric(metric);
      setSortDirection('ascending');
    }
  };

  return (
    <section className={cn(PANEL, 'min-w-0 overflow-hidden')}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Agent signal matrix</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {sortMetric ? `Sorted by ${metricMeta(sortMetric).label}` : 'Sorted by metric breaches'} · each value uses its own limit
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Rows
          <select
            value={pageSize}
            onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }}
            className="h-8 rounded-md border border-border bg-background px-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={1000}>All</option>
          </select>
        </label>
      </header>
      {sorted.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyMessage}</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border/40 text-[11px] text-muted-foreground">
                  <th className="sticky left-0 z-10 bg-card px-4 py-3 font-medium">Agent</th>
                  {DASH_METRICS.map((metric) => (
                    <th key={metric.id} className="px-2 py-3 text-center font-medium">
                      <button
                        type="button"
                        onClick={() => sortBy(metric.id)}
                        aria-label={`Sort by ${metric.label}`}
                        className="inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                      >
                        {metric.shortLabel}
                        {sortMetric === metric.id && (sortDirection === 'ascending' ? <ArrowUpWideNarrow className="size-3" /> : <ArrowDownWideNarrow className="size-3" />)}
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right font-medium">Breaches</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((agent) => {
                  const breaches = agentBreachCount(agent);
                  return (
                    <tr key={agent.key} className="border-b border-border/30 transition-colors hover:bg-accent/5">
                      <th scope="row" className="sticky left-0 z-10 bg-card px-4 py-2 text-left">
                        <button type="button" onClick={() => onAgent(agent)} className="max-w-52 truncate text-sm font-medium text-foreground hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
                          {agent.name}
                        </button>
                      </th>
                      {DASH_METRICS.map((metric) => {
                        const value = metricValue(agent, metric.id);
                        const abnormal = value !== null && isMetricAbnormal(metric.id, value);
                        return (
                          <td key={metric.id} className="px-2 py-2 text-center">
                            {value === null ? (
                              <span aria-label="Not reported" title="Not reported" className="text-xs text-muted-foreground/60">—</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onMetric(agent, metric.id)}
                                aria-label={`${agent.name}, ${metric.label}: ${formatMetric(metric.id, value)}${abnormal ? ', outside limit' : ', within limit'}`}
                                className={cn(
                                  'rounded-md px-2 py-1 font-mono text-xs tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70',
                                  abnormal ? 'bg-rose-500/10 text-rose-300 hover:bg-rose-500/20' : 'text-foreground hover:bg-accent/10',
                                )}
                              >
                                {formatMetric(metric.id, value)}
                              </button>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2 text-right">
                        <span className={cn('font-mono text-xs tabular-nums', breaches > 0 ? 'text-rose-300' : 'text-muted-foreground')}>
                          {breaches} / {DASH_METRICS.filter((metric) => metricValue(agent, metric.id) !== null).length}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <footer className="flex items-center justify-between gap-3 px-4 py-3 text-xs text-muted-foreground">
            <span>{sorted.length} report identities · {sorted.reduce((sum, agent) => sum + agentBreachCount(agent), 0)} metric breaches</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0} aria-label="Previous agent page" className={cn(CONTROL, 'min-h-8 px-2 disabled:opacity-40')}>
                <ChevronLeft className="size-4" />
              </button>
              <span>{currentPage + 1} / {pages}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={currentPage >= pages - 1} aria-label="Next agent page" className={cn(CONTROL, 'min-h-8 px-2 disabled:opacity-40')}>
                <ChevronRight className="size-4" />
              </button>
            </div>
          </footer>
        </>
      )}
    </section>
  );
}

type OverallBand = 'unrated' | 'needs-attention' | 'mixed' | 'strong' | 'excellent';

const OVERALL_BANDS: Record<OverallBand, { label: string; color: string; className: string }> = {
  unrated: { label: 'No metrics', color: '#8b949e', className: 'text-muted-foreground' },
  'needs-attention': { label: 'Needs attention', color: '#fb7185', className: 'text-rose-300' },
  mixed: { label: 'Mixed', color: '#fbbf24', className: 'text-amber-300' },
  strong: { label: 'Strong', color: '#58a6ff', className: 'text-sky-300' },
  excellent: { label: 'All cutoffs met', color: '#6ee7b7', className: 'text-emerald-300' },
};

function overallPerformance(agent: DashAgent): { met: number; available: number; band: OverallBand } {
  const available = DASH_METRICS
    .map((metric) => ({ metric, value: metricValue(agent, metric.id) }))
    .filter((item): item is { metric: (typeof DASH_METRICS)[number]; value: number } => item.value !== null);
  const met = available.filter(({ metric, value }) => !isMetricAbnormal(metric.id, value)).length;
  const ratio = available.length ? met / available.length : -1;
  const band: OverallBand = ratio < 0
    ? 'unrated'
    : ratio < 0.5
      ? 'needs-attention'
      : ratio < 0.8
        ? 'mixed'
        : ratio < 1
          ? 'strong'
          : 'excellent';
  return { met, available: available.length, band };
}

function agentSeatLabel(name: string): string {
  const parts = name.replace(/[.]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
  if (parts.length < 2) return parts[0]!.slice(0, 12);
  return `${parts[0]} ${parts[parts.length - 1]![0]}.`;
}

function buildParliamentSeats(agents: DashAgent[]) {
  const ringCount = Math.min(7, Math.max(5, Math.round(agents.length / 7)));
  const weights = Array.from({ length: ringCount }, (_, index) => index + 1);
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const raw = weights.map((weight) => (agents.length * weight) / weightTotal);
  const counts = raw.map(Math.floor);
  let remaining = agents.length - counts.reduce((sum, value) => sum + value, 0);
  const fractions = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let index = 0; index < remaining; index++) counts[fractions[index]!.index]!++;

  const ordered = [...agents].sort((a, b) => {
    const scoreA = overallPerformance(a);
    const scoreB = overallPerformance(b);
    const ratioA = scoreA.available ? scoreA.met / scoreA.available : -1;
    const ratioB = scoreB.available ? scoreB.met / scoreB.available : -1;
    return ratioA - ratioB || a.name.localeCompare(b.name);
  });
  const centerX = 360;
  const centerY = 326;
  const maxRadius = 256;
  const minRadius = 78;
  const seats: Array<{ agent: DashAgent; x: number; y: number; band: OverallBand; label: string }> = [];
  let agentIndex = 0;
  for (let ring = ringCount - 1; ring >= 0; ring--) {
    const radius = minRadius + (ring / (ringCount - 1)) * (maxRadius - minRadius);
    const count = counts[ring]!;
    for (let seatIndex = 0; seatIndex < count; seatIndex++) {
      const angle = Math.PI - ((seatIndex + 0.5) / count) * Math.PI;
      const agent = ordered[agentIndex++]!;
      seats.push({
        agent,
        x: centerX + radius * Math.cos(angle),
        y: centerY - radius * Math.sin(angle),
        band: overallPerformance(agent).band,
        label: agentSeatLabel(agent.name),
      });
    }
  }
  return seats;
}

function ParliamentChart({
  agents,
  selectedKey,
  onSelect,
}: {
  agents: DashAgent[];
  selectedKey: string | null;
  onSelect: (agent: DashAgent) => void;
}) {
  const seats = useMemo(() => buildParliamentSeats(agents), [agents]);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const hovered = seats.find((seat) => seat.agent.key === hoveredKey) ?? null;
  const counts = seats.reduce<Record<OverallBand, number>>((result, seat) => {
    result[seat.band]++;
    return result;
  }, { unrated: 0, 'needs-attention': 0, mixed: 0, strong: 0, excellent: 0 });

  return (
    <section className={cn(PANEL, 'min-w-0 overflow-hidden')}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Agent parliament</h2>
          <p className="mt-1 text-xs text-muted-foreground">Seat color shows the share of reported operational cutoffs met · select a seat for details</p>
        </div>
        <span className="rounded-full bg-background/60 px-2.5 py-1 font-mono text-xs tabular-nums text-muted-foreground">{seats.length} agents</span>
      </header>
      {seats.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm text-muted-foreground">No agents match the current filters, or report data is unavailable.</div>
      ) : (
        <div className="p-3 sm:p-4">
          <div className="relative rounded-xl border border-border/40 bg-background/30 p-2">
            <svg viewBox="0 0 720 380" className="h-auto w-full" role="group" aria-label="Agent performance parliament chart">
              {seats.map((seat, seatIndex) => {
                const meta = OVERALL_BANDS[seat.band];
                const selected = selectedKey === seat.agent.key;
                const score = overallPerformance(seat.agent);
                return (
                  <g
                    key={seat.agent.key}
                    role="button"
                    tabIndex={0}
                    aria-label={`${seat.agent.name}, ${meta.label}, ${score.met} of ${score.available} reported cutoffs met`}
                    aria-pressed={selected}
                    onClick={() => onSelect(seat.agent)}
                    onMouseEnter={() => setHoveredKey(seat.agent.key)}
                    onMouseLeave={() => setHoveredKey((current) => current === seat.agent.key ? null : current)}
                    onFocus={() => setHoveredKey(seat.agent.key)}
                    onBlur={() => setHoveredKey((current) => current === seat.agent.key ? null : current)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelect(seat.agent);
                      }
                    }}
                    className="cursor-pointer outline-none"
                  >
                    <circle
                      className="dash-parliament-seat"
                      cx={seat.x}
                      cy={seat.y}
                      r={selected || hoveredKey === seat.agent.key ? 13 : 10.5}
                      fill={meta.color}
                      fillOpacity={seat.band === 'unrated' ? 0.45 : 0.92}
                      stroke={selected || hoveredKey === seat.agent.key ? '#ffffff' : 'rgba(0,0,0,0.35)'}
                      strokeWidth={selected || hoveredKey === seat.agent.key ? 2 : 1}
                      style={{ animationDelay: `${-(seatIndex % 18) * 0.38}s`, transition: 'r 120ms ease, fill-opacity 200ms ease', filter: selected || hoveredKey === seat.agent.key ? `drop-shadow(0 0 7px ${meta.color}88)` : undefined }}
                    />
                    <text
                      x={seat.x}
                      y={seat.y + 23}
                      textAnchor="middle"
                      fontSize={9}
                      fontWeight={selected || hoveredKey === seat.agent.key ? 700 : 500}
                      fill={selected || hoveredKey === seat.agent.key ? '#ffffff' : 'var(--muted-foreground)'}
                      fillOpacity={seat.band === 'unrated' ? 0.5 : 0.85}
                      style={{ pointerEvents: 'none' }}
                    >
                      {seat.label}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="pointer-events-none absolute inset-x-0 top-[73%] flex -translate-y-1/2 flex-col items-center">
              <span className="font-mono text-3xl font-bold tabular-nums text-foreground">{seats.length}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">reported agents</span>
            </div>
            {hovered && (
              <div className="pointer-events-none absolute left-1/2 top-2 z-10 w-[min(22rem,calc(100%-1rem))] -translate-x-1/2 rounded-xl border border-border bg-popover/95 p-3 shadow-2xl backdrop-blur-md sm:left-auto sm:right-3 sm:top-3 sm:translate-x-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-xs font-semibold text-foreground">{hovered.agent.name}</span>
                  <span className={cn('shrink-0 text-[10px] font-semibold', OVERALL_BANDS[hovered.band].className)}>{OVERALL_BANDS[hovered.band].label}</span>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">{overallPerformance(hovered.agent).met}/{overallPerformance(hovered.agent).available} reported cutoffs met</p>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-border/50 pt-2">
                  {DASH_METRICS.map((metric) => {
                    const value = metricValue(hovered.agent, metric.id);
                    return (
                      <span key={metric.id} className="flex min-w-0 items-center justify-between gap-2 text-[10px]">
                        <span className="truncate text-muted-foreground">{metric.shortLabel}</span>
                        <span className={cn('shrink-0 font-mono tabular-nums', value !== null && isMetricAbnormal(metric.id, value) ? 'text-rose-300' : 'text-foreground')}>
                          {value === null ? '—' : formatMetric(metric.id, value)}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2">
            {(['needs-attention', 'mixed', 'strong', 'excellent', 'unrated'] as OverallBand[]).map((band) => (
              <span key={band} className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: OVERALL_BANDS[band].color }} />
                {OVERALL_BANDS[band].label}
                <span className="font-mono tabular-nums" style={{ color: OVERALL_BANDS[band].color }}>{counts[band]}</span>
              </span>
            ))}
          </div>
          <p className="mt-2 text-center text-[10px] text-muted-foreground">Equal-weight share of available cutoffs met; missing metrics are excluded.</p>
        </div>
      )}
    </section>
  );
}

function MtdVolumeSummary({ state, onExplore }: { state: ReturnType<typeof useDashData>['dailies']['state']; onExplore: () => void }) {
  const data = state.status === 'ready' ? state.data : null;
  const refreshError = state.status === 'ready' ? state.refreshError : undefined;
  const total = data ? data.call.handled + data.email.total + data.chat.total : null;
  const shiftStats = useMemo(() => {
    if (!data) return null;
    const dates = [asOfDate(data.chat.asOf), asOfDate(data.email.asOf)].filter((date): date is string => !!date).sort();
    const end = dates[dates.length - 1];
    if (!end) return null;
    const start = monthStart(end);
    const callShifts = countMtdShifts(start, end, undefined, ['Call', 'FR Call']).total;
    const chatShifts = countMtdShifts(start, end, undefined, ['Chat']).total;
    const emailShifts = countMtdShifts(start, end, undefined, ['Chat', 'Call', 'FR Call']).total;
    return {
      call: { shifts: callShifts, average: callShifts > 0 ? data.call.handled / callShifts : null },
      email: { shifts: emailShifts, average: emailShifts > 0 ? data.email.total / emailShifts : null },
      chat: { shifts: chatShifts, average: chatShifts > 0 ? data.chat.total / chatShifts : null },
      through: end,
    };
  }, [data]);
  const volumes = [
    { name: 'Total processed', value: total, detail: 'Call + Email + Chat', average: null, shifts: null, color: 'text-foreground', accent: 'bg-accent' },
    { name: 'Call handled', value: data?.call.handled ?? null, detail: 'MTD contacts', average: shiftStats?.call.average ?? null, shifts: shiftStats?.call.shifts ?? null, color: 'text-amber-300', accent: 'bg-amber-400' },
    { name: 'Email', value: data?.email.total ?? null, detail: 'MTD cases', average: shiftStats?.email.average ?? null, shifts: shiftStats?.email.shifts ?? null, color: 'text-violet-300', accent: 'bg-violet-400' },
    { name: 'Chat', value: data?.chat.total ?? null, detail: 'MTD cases', average: shiftStats?.chat.average ?? null, shifts: shiftStats?.chat.shifts ?? null, color: 'text-sky-300', accent: 'bg-sky-400' },
  ];
  return (
    <section className={cn(PANEL, 'p-4 sm:p-5')}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">MTD dailies</h2>
          <p className="mt-1 text-xs text-muted-foreground">Current call, email and chat volumes</p>
        </div>
        <button type="button" onClick={onExplore} className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
          Explore <ChevronRight className="size-3.5" />
        </button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {volumes.map((volume, index) => (
          <div key={volume.name} className={cn('min-w-0 rounded-lg p-3', index === 0 ? 'border border-accent/25 bg-accent/5' : 'bg-background/35')}>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={cn('size-2 rounded-full', volume.accent)} />
              {volume.name}
            </div>
            <div className={cn('mt-1 truncate font-mono text-xl font-semibold tabular-nums', volume.color)}>{volume.value === null ? '—' : formatNumber(volume.value)}</div>
            <div className="mt-1 text-[10px] text-muted-foreground">{volume.detail}</div>
            {index > 0 && <div className="mt-2 text-[11px] text-muted-foreground">AVG / shift <span className="font-mono tabular-nums text-foreground">{volume.average === null ? '—' : volume.average.toFixed(1)}</span></div>}
            {index > 0 && <div className="text-[10px] text-muted-foreground">{volume.shifts === null ? 'Roster shifts unavailable' : `${formatNumber(volume.shifts)} roster shifts`}</div>}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        {refreshError ? 'Showing previous report data. ' : ''}
        {shiftStats ? `Roster averages through ${shiftStats.through}; Call uses Call + FR Call shifts, Chat uses Chat shifts, Email uses both groups.` : 'Roster averages unavailable until Chat and Email report dates are available. '}
        {' '}Total processed is the sum of independent source counts; Call period dates are not supplied.
        {!data && state.status === 'loading' && ' Loading report volumes…'}
        {!data && state.status === 'error' && ` ${state.message}`}
      </p>
    </section>
  );
}

function DotRows({
  agents,
  metric,
  onSelect,
}: {
  agents: DashAgent[];
  metric: 'csat' | 'chat' | 'emailFirst' | 'emailAvg';
  onSelect: (agent: DashAgent) => void;
}) {
  const meta = metricMeta(metric);
  const [sort, setSort] = useState<'value' | 'surveys' | 'name'>('value');
  const [page, setPage] = useState(0);
  const filtered = agents.filter((agent) => metricValue(agent, metric) !== null);
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'surveys' && metric === 'csat') return (b.csat?.records ?? 0) - (a.csat?.records ?? 0);
    const av = metricValue(a, metric) ?? 0;
    const bv = metricValue(b, metric) ?? 0;
    return meta.direction === 'higher' ? av - bv : bv - av;
  });
  const pages = Math.max(1, Math.ceil(sorted.length / 15));
  const rows = sorted.slice(Math.min(page, pages - 1) * 15, (Math.min(page, pages - 1) + 1) * 15);
  const max = metric === 'csat' ? 100 : Math.max(meta.threshold * 1.15, ...filtered.map((agent) => metricValue(agent, metric) ?? 0), 1);
  const thresholdPos = (meta.threshold / max) * 100;
  const abnormalCount = filtered.filter((agent) => isMetricAbnormal(metric, metricValue(agent, metric)!)).length;
  return (
    <section className={cn(PANEL, 'overflow-hidden')}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{meta.label} by agent</h2>
          <p className="mt-1 text-xs text-muted-foreground">{metric === 'csat' ? 'Excludes DTC and other regions · ' : ''}{abnormalCount} agents outside the {meta.direction === 'higher' ? 'minimum' : 'maximum'} limit of {formatMetric(metric, meta.threshold)}</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Sort
          <select value={sort} onChange={(event) => { setSort(event.target.value as typeof sort); setPage(0); }} className="h-8 rounded-md border border-border bg-background px-2 text-foreground">
            <option value="value">{metric === 'csat' ? 'Lowest CSAT' : 'Value'}</option>
            {metric === 'csat' && <option value="surveys">Most surveys</option>}
            <option value="name">Name</option>
          </select>
        </label>
      </header>
      <div className="divide-y divide-border/30 px-4">
        {rows.map((agent) => {
          const value = metricValue(agent, metric)!;
          const abnormal = isMetricAbnormal(metric, value);
          const sample = metric === 'csat' ? `${agent.csat!.good} good · ${agent.csat!.bad} bad · ${agent.csat!.records} surveys` : '';
          return (
            <button key={agent.key} type="button" onClick={() => onSelect(agent)} className="grid w-full grid-cols-[minmax(100px,170px)_minmax(80px,1fr)_auto] items-center gap-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{agent.name}</span>
                {sample && <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{sample}</span>}
              </span>
              <span className="relative h-2 rounded-full bg-border/50">
                <span className="absolute inset-y-0 left-0 rounded-full bg-foreground/10" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
                <span className="absolute -top-1 h-4 w-px bg-foreground/80" style={{ left: `${thresholdPos}%` }} />
                <span className={cn('absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background', abnormal ? 'bg-rose-400' : 'bg-accent')} style={{ left: `${Math.min(100, (value / max) * 100)}%` }} />
              </span>
              <span className={cn('min-w-[64px] text-right font-mono text-sm tabular-nums', abnormal ? 'text-rose-300' : 'text-foreground')}>
                {formatMetric(metric, value)}
              </span>
            </button>
          );
        })}
      </div>
      <footer className="flex items-center justify-between border-t border-border/40 px-4 py-3 text-xs text-muted-foreground">
        <span>{filtered.length} agents · {meta.direction === 'higher' ? 'higher is better' : 'lower is better'}</span>
        <span className="flex items-center gap-2">
          {Math.min(page + 1, pages)} / {pages}
          <button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0} aria-label="Previous chart page" className={cn(CONTROL, 'min-h-8 px-2 disabled:opacity-40')}><ChevronLeft className="size-4" /></button>
          <button type="button" onClick={() => setPage((current) => Math.min(pages - 1, current + 1))} disabled={page >= pages - 1} aria-label="Next chart page" className={cn(CONTROL, 'min-h-8 px-2 disabled:opacity-40')}><ChevronRight className="size-4" /></button>
        </span>
      </footer>
    </section>
  );
}

const CHANNEL_GROUPS = [
  { id: 'chat', label: 'Chat', names: ['Zendesk Chat', 'Chat', 'Offline Chat', 'Abandoned Chat', 'Mobile SDK'] },
  { id: 'email', label: 'Email', names: ['Manual', 'DTC Website', 'Web Form', 'Email', 'Yeedi-US-Email'] },
  { id: 'call', label: 'Call', names: ['Inbound Call', 'Outbound Call'] },
] as const;

function touchChannels(row: OneTouchRowLike | null): { values: Record<string, { oneTime: number; closed: number; rate: number }>; other: string[] } {
  const values: Record<string, { oneTime: number; closed: number; rate: number }> = {};
  const other: string[] = [];
  if (!row) return { values, other };
  const belongsTo = (channelName: string, names: readonly string[]) =>
    names.some((name) => name.toLocaleLowerCase() === channelName.trim().toLocaleLowerCase());
  for (const group of CHANNEL_GROUPS) {
    const matching = row.channels.filter((channel) => belongsTo(channel.name, group.names));
    const oneTime = matching.reduce((sum, channel) => sum + channel.oneTime, 0);
    const closed = matching.reduce((sum, channel) => sum + channel.closed, 0);
    if (closed) values[group.id] = { oneTime, closed, rate: (oneTime / closed) * 100 };
  }
  const known = new Set(CHANNEL_GROUPS.flatMap((group) => row.channels.filter((channel) => belongsTo(channel.name, group.names)).map((channel) => channel.name)));
  const remaining = row.channels.filter((channel) => !known.has(channel.name));
  const otherClosed = remaining.reduce((sum, channel) => sum + channel.closed, 0);
  if (otherClosed) {
    const otherOne = remaining.reduce((sum, channel) => sum + channel.oneTime, 0);
    values.other = { oneTime: otherOne, closed: otherClosed, rate: (otherOne / otherClosed) * 100 };
    other.push(...remaining.map((channel) => channel.name));
  }
  return { values, other };
}

type OneTouchRowLike = { channels: OneTouchChannel[]; rate: number; oneTime: number; closed: number };

function OneTouchMatrix({ agents, report, onSelect }: { agents: DashAgent[]; report: OneTouchRowLike | null; onSelect: (agent: DashAgent) => void }) {
  const columns = ['overall', 'chat', 'email', 'call', 'other'];
  const presentColumns = columns.filter((column) => column === 'overall' || agents.some((agent) => Boolean(touchChannels(agent.oneTouch).values[column])));
  const [sortColumn, setSortColumn] = useState('overall');
  const [sortDirection, setSortDirection] = useState<SortDirection>('ascending');
  const sorted = [...agents].filter((agent) => agent.oneTouch).sort((a, b) => {
    const aValue = sortColumn === 'overall' ? a.oneTouch?.rate ?? null : touchChannels(a.oneTouch)[sortColumn]?.rate ?? null;
    const bValue = sortColumn === 'overall' ? b.oneTouch?.rate ?? null : touchChannels(b.oneTouch)[sortColumn]?.rate ?? null;
    if (aValue === null && bValue !== null) return 1;
    if (bValue === null && aValue !== null) return -1;
    if (aValue !== null && bValue !== null && aValue !== bValue) return (aValue - bValue) * (sortDirection === 'ascending' ? 1 : -1);
    return a.name.localeCompare(b.name);
  });
  const totalGroups = report ? touchChannels(report) : null;
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(sorted.length / 15));
  const rows = sorted.slice(Math.min(page, pages - 1) * 15, (Math.min(page, pages - 1) + 1) * 15);
  return (
    <section className={cn(PANEL, 'overflow-hidden')}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">One-Touch by agent and channel</h2>
          <p className="mt-1 text-xs text-muted-foreground">Channel rates use combined one-touch and closed-case counts · compared with overall 72% cutoff · sort: {sortColumn}</p>
        </div>
        <span className="font-mono text-sm text-foreground">{report ? `${pct(report.rate)} overall` : '—'}</span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[740px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border/40 text-muted-foreground">
              <th className="sticky left-0 z-10 bg-card px-4 py-3 font-medium">Agent</th>
              {presentColumns.map((column) => (
                <th key={column} className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => {
                      if (sortColumn === column) setSortDirection((direction) => direction === 'ascending' ? 'descending' : 'ascending');
                      else { setSortColumn(column); setSortDirection('ascending'); }
                      setPage(0);
                    }}
                    aria-label={`Sort by ${column} one-touch rate`}
                    className="inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                  >
                    {column === 'overall' ? 'Overall' : column === 'other' ? 'Other' : `${column[0]!.toUpperCase()}${column.slice(1)}`}
                    {sortColumn === column && (sortDirection === 'ascending' ? <ArrowUpWideNarrow className="size-3" /> : <ArrowDownWideNarrow className="size-3" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((agent) => {
              const grouped = touchChannels(agent.oneTouch);
              return (
                <tr key={agent.key} className="border-b border-border/30 hover:bg-accent/5">
                  <th scope="row" className="sticky left-0 z-10 bg-card px-4 py-2 text-left">
                    <button type="button" onClick={() => onSelect(agent)} className="max-w-48 truncate text-sm font-medium text-foreground hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">{agent.name}</button>
                  </th>
                  {presentColumns.map((column) => {
                    const item = column === 'overall' && agent.oneTouch
                      ? { rate: agent.oneTouch.rate, closed: agent.oneTouch.closed, oneTime: agent.oneTouch.oneTime }
                      : grouped.values[column];
                    if (!item) return <td key={column} className="px-3 py-2 text-muted-foreground/60">—</td>;
                    const abnormal = item.rate < 72;
                    return (
                      <td key={column} className="px-3 py-2">
                        <button type="button" onClick={() => onSelect(agent)} aria-label={`${agent.name}, ${column} one-touch rate ${pct(item.rate)}, ${item.oneTime} of ${item.closed} cases. Open agent details.`} className="w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
                          <div className="flex items-center justify-between gap-3">
                            <span className={cn('font-mono tabular-nums', abnormal ? 'text-rose-300' : 'text-foreground')}>{pct(item.rate)}</span>
                            <span className="text-[10px] tabular-nums text-muted-foreground">{item.oneTime}/{item.closed}</span>
                          </div>
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-border/50">
                            <div className={cn('h-full rounded-full', abnormal ? 'bg-rose-400' : 'bg-accent')} style={{ width: `${Math.min(100, item.rate)}%` }} />
                          </div>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          {totalGroups && (
            <tfoot>
              <tr className="border-t border-border/60 bg-background/30 font-semibold">
                <th scope="row" className="sticky left-0 bg-card px-4 py-3 text-left text-foreground">Team</th>
                {presentColumns.map((column) => {
                  const item = column === 'overall' && report
                    ? { rate: report.rate, closed: report.closed, oneTime: report.oneTime }
                    : totalGroups.values[column];
                  return <td key={column} className="px-3 py-3 font-mono text-foreground">{item ? `${pct(item.rate)} · ${formatNumber(item.closed)} cases` : '—'}</td>;
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <footer className="flex items-center justify-between border-t border-border/40 px-4 py-3 text-xs text-muted-foreground">
        <span>{sorted.length} agents · team row covers the full report; ungrouped origins remain in Other</span>
        <span className="flex items-center gap-2">{Math.min(page + 1, pages)} / {pages}<button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={!page} aria-label="Previous channel page" className={cn(CONTROL, 'min-h-8 px-2 disabled:opacity-40')}><ChevronLeft className="size-4" /></button><button type="button" onClick={() => setPage((current) => Math.min(pages - 1, current + 1))} disabled={page >= pages - 1} aria-label="Next channel page" className={cn(CONTROL, 'min-h-8 px-2 disabled:opacity-40')}><ChevronRight className="size-4" /></button></span>
      </footer>
    </section>
  );
}

function WorkloadExplore({ state }: { state: ReturnType<typeof useDashData>['dailies']['state'] }) {
  const [perShift, setPerShift] = useState(false);
  const workload = useMemo(() => {
    if (state.status !== 'ready') return null;
    const { chat, email } = state.data;
    const names = new Map<string, { name: string; chat: number; email: number }>();
    for (const row of chat.agents) names.set(normalizeAgentName(row.owner), { name: row.owner, chat: row.count, email: 0 });
    for (const row of email.agents) {
      const key = normalizeAgentName(row.owner);
      const current = names.get(key) ?? { name: row.owner, chat: 0, email: 0 };
      current.email = row.count;
      if (row.owner.length > current.name.length) current.name = row.owner;
      names.set(key, current);
    }
    const dateChat = asOfDate(chat.asOf);
    const dateEmail = asOfDate(email.asOf);
    const compatible = !!dateChat && dateChat === dateEmail;
    const end = compatible ? dateChat : null;
    const shifts = end ? countMtdShifts(monthStart(end), end, undefined, ['Chat', 'Call', 'FR Call']).byAgent : {};
    const all = [...names.values()].map((row) => {
      const rosterMatch = matchRosterShift(row.name, shifts);
      const rosterMatched = rosterMatch !== null;
      const shiftCount = rosterMatch?.shifts ?? 0;
      return { ...row, total: row.chat + row.email, rosterMatched, shifts: shiftCount, rate: compatible && shiftCount > 0 ? (row.chat + row.email) / shiftCount : null };
    });
    return {
      all,
      verified: all.filter((row) => row.shifts > 0 && row.rate !== null).sort((a, b) => perShift ? (b.rate ?? 0) - (a.rate ?? 0) : b.total - a.total),
      unmatched: all.filter((row) => !row.rosterMatched).sort((a, b) => b.total - a.total),
      noWorkedShifts: all.filter((row) => row.rosterMatched && row.shifts === 0).sort((a, b) => b.total - a.total),
      compatible,
      dateChat,
      dateEmail,
      shifts,
      max: Math.max(1, ...all.map((row) => perShift ? row.rate ?? 0 : row.total)),
      maxChat: Math.max(1, ...all.map((row) => row.chat)),
      maxEmail: Math.max(1, ...all.map((row) => row.email)),
      total: compatible ? all.reduce((sum, row) => sum + row.total, 0) : null,
    };
  }, [state, perShift]);

  if (state.status === 'loading') return <div className={cn(PANEL, 'p-6 text-sm text-muted-foreground')}>Loading workload sources…</div>;
  if (state.status === 'error') return <div className={cn(PANEL, 'p-6 text-sm text-rose-200')}>{state.message}</div>;
  if (!workload) return <div className={cn(PANEL, 'p-6 text-sm text-muted-foreground')}>Workload data unavailable.</div>;
  const call = state.data.call;
  const channels = [
    { label: 'Call handled', value: call.handled, color: 'bg-amber-400' },
    { label: 'Chat messages', value: state.data.chat.total, color: 'bg-sky-400' },
    { label: 'Email cases', value: state.data.email.total, color: 'bg-violet-400' },
  ];
  const showPerShift = perShift && workload.compatible;
  const rows = showPerShift ? workload.verified : [...workload.verified, ...workload.unmatched].sort((a, b) => b.total - a.total);
  return (
    <div className="space-y-4">
      {!workload.compatible && <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">Chat and Email report periods do not match. Team totals are shown independently; per-shift rates are hidden to avoid a misleading comparison.</div>}
      <section className={cn(PANEL, 'p-4')}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">MTD channel volume</h2>
            <p className="mt-1 text-xs text-muted-foreground">Call totals are team-level; agent bars show Chat + Email only.</p>
          </div>
          <div className="inline-flex rounded-lg border border-border/60 bg-background/40 p-1">
            <button type="button" onClick={() => setPerShift(false)} className={cn('rounded-md px-3 py-1.5 text-xs', !showPerShift ? 'bg-accent/15 text-foreground' : 'text-muted-foreground')}>Total contacts</button>
            <button type="button" onClick={() => setPerShift(true)} disabled={!workload.compatible} className={cn('rounded-md px-3 py-1.5 text-xs disabled:opacity-40', showPerShift ? 'bg-accent/15 text-foreground' : 'text-muted-foreground')}>Per roster shift</button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {channels.map((channel) => (
            <div key={channel.label} className="rounded-lg bg-background/45 px-3 py-3">
              <div className="text-xs text-muted-foreground">{channel.label}</div>
              <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">{formatNumber(channel.value)}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
          <span>20s service level <strong className="font-mono text-foreground">{pct(call.serviceLevel20)}</strong></span>
          <span>Avg handle time <strong className="font-mono text-foreground">{Math.floor(call.avgHandleTimeSec / 60)}:{String(call.avgHandleTimeSec % 60).padStart(2, '0')}</strong></span>
          <span>Abandoned <strong className="font-mono text-foreground">{formatNumber(call.abandoned)}</strong></span>
          <span>Outbound handled <strong className="font-mono text-foreground">{formatNumber(call.handledOutbound)}</strong></span>
        </div>
      </section>
      <section className={cn(PANEL, 'overflow-hidden')}>
        <header className="border-b border-border/50 px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">{showPerShift ? 'Contacts per verified roster shift' : workload.compatible ? 'Chat + Email contacts by report identity' : 'Independent agent source counts'}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {showPerShift ? 'Unambiguous roster-name matches · ratio is not a performance rating' : workload.total !== null ? `${formatNumber(workload.total)} combined Chat + Email contacts · source periods match` : 'Chat and Email counts are kept separate because report periods differ'}
          </p>
        </header>
        <div className="space-y-1 p-4">
          {rows.slice(0, 30).map((row) => (
            <div key={normalizeAgentName(row.name)} className="grid grid-cols-[minmax(90px,160px)_minmax(80px,1fr)_auto] items-center gap-3 py-2">
              <span className="truncate text-xs text-foreground" title={row.name}>{row.name}</span>
              {workload.compatible ? (
                <span className="flex h-2 overflow-hidden rounded-full bg-border/40" title={`Chat ${row.chat}, Email ${row.email}`}>
                  <span className="bg-sky-400" style={{ width: `${((showPerShift ? row.rate ?? 0 : row.chat) / workload.max) * 100}%` }} />
                  {!showPerShift && <span className="bg-violet-400" style={{ width: `${(row.email / workload.max) * 100}%` }} />}
                </span>
              ) : (
                <span className="flex flex-col gap-1" title={`Independent reports: Chat ${row.chat}, Email ${row.email}`}>
                  <span className="h-1 overflow-hidden rounded-full bg-border/40"><span className="block h-full rounded-full bg-sky-400" style={{ width: `${(row.chat / workload.maxChat) * 100}%` }} /></span>
                  <span className="h-1 overflow-hidden rounded-full bg-border/40"><span className="block h-full rounded-full bg-violet-400" style={{ width: `${(row.email / workload.maxEmail) * 100}%` }} /></span>
                </span>
              )}
              <span className="min-w-20 text-right font-mono text-xs tabular-nums text-foreground">
                {showPerShift ? `${row.rate?.toFixed(1) ?? '—'} / shift` : workload.compatible ? `${formatNumber(row.total)} · ${formatNumber(row.chat)}c/${formatNumber(row.email)}e` : `C ${formatNumber(row.chat)} · E ${formatNumber(row.email)}`}
              </span>
            </div>
          ))}
        </div>
        {showPerShift && (workload.unmatched.length > 0 || workload.noWorkedShifts.length > 0) && (
          <details className="border-t border-border/40 px-4 py-3">
            <summary className="cursor-pointer text-xs text-muted-foreground">Not ranked: no roster match or no worked shifts ({workload.unmatched.length + workload.noWorkedShifts.length})</summary>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {workload.unmatched.map((row) => <li key={row.name}>{row.name} · no confident roster-name match · Chat {formatNumber(row.chat)} / Email {formatNumber(row.email)}</li>)}
              {workload.noWorkedShifts.map((row) => <li key={row.name}>{row.name} · 0 worked shifts · Chat {formatNumber(row.chat)} / Email {formatNumber(row.email)}</li>)}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}

function ResponseExplore({ reports, agents }: { reports: ResponseTimeReport[] | null; agents: DashAgent[] }) {
  if (!reports) return <div className={cn(PANEL, 'p-6 text-sm text-muted-foreground')}>Response reports are unavailable.</div>;
  const ids: DashMetricId[] = ['chat', 'emailFirst', 'emailAvg'];
  const rows = [...agents].sort((a, b) => {
    const breaches = ids.reduce((sum, id) => sum + (metricValue(b, id) !== null && isMetricAbnormal(id, metricValue(b, id)!) ? 1 : 0), 0)
      - ids.reduce((sum, id) => sum + (metricValue(a, id) !== null && isMetricAbnormal(id, metricValue(a, id)!) ? 1 : 0), 0);
    if (breaches) return breaches;
    return a.name.localeCompare(b.name);
  }).filter((agent) => ids.some((id) => metricValue(agent, id) !== null));
  return (
    <section className={cn(PANEL, 'overflow-hidden')}>
      <header className="border-b border-border/50 px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Response time by metric and agent</h2>
        <p className="mt-1 text-xs text-muted-foreground">Rows share one agent order. Each track uses its own native unit and full-report scale.</p>
      </header>
      <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-3">
        {ids.map((id, index) => {
          const report = reports[index]!;
          const meta = metricMeta(id);
          const max = Math.max(meta.threshold * 1.1, report.teamAvg, report.agentAvg, ...report.agents.map((agent) => agent.value), 0.1);
          const teamX = (report.teamAvg / max) * 100;
          const agentX = (report.agentAvg / max) * 100;
          return (
            <div key={id} className="rounded-lg bg-background/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-foreground">{meta.label}</h3>
                <span className="text-[11px] text-muted-foreground">limit {formatMetric(id, meta.threshold)}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div><span className="text-muted-foreground">Team aggregate</span><div className="mt-0.5 font-mono text-sm text-foreground">{formatMetric(id, report.teamAvg)}</div></div>
                <div><span className="text-muted-foreground">Mean of agents</span><div className="mt-0.5 font-mono text-sm text-foreground">{formatMetric(id, report.agentAvg)}</div></div>
              </div>
              <div className="relative mt-3 h-5 rounded-full bg-border/40" aria-label={`Team aggregate ${formatMetric(id, report.teamAvg)}, mean of agents ${formatMetric(id, report.agentAvg)}`}>
                <span className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-accent/70" style={{ width: `${Math.abs(teamX - agentX)}%`, marginLeft: `${Math.min(teamX, agentX)}%` }} />
                <span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-background" style={{ left: `${teamX}%` }} />
                <span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-foreground ring-2 ring-background" style={{ left: `${agentX}%` }} />
                <span className="absolute -top-1 h-7 w-px bg-rose-400" style={{ left: `${(meta.threshold / max) * 100}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>0{meta.unit}</span><span>{formatMetric(id, max)}</span></div>
            </div>
          );
        })}
      </div>
      <div className="overflow-x-auto border-t border-border/40">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead><tr className="text-muted-foreground"><th className="px-4 py-3 font-medium">Agent</th>{ids.map((id) => <th key={id} className="px-3 py-3 font-medium">{metricMeta(id).shortLabel} <span className="font-normal">({metricMeta(id).unit})</span></th>)}</tr></thead>
          <tbody>{rows.map((agent) => <tr key={agent.key} className="border-t border-border/30"><th scope="row" className="px-4 py-2 font-medium text-foreground">{agent.name}</th>{ids.map((id) => {
            const value = metricValue(agent, id);
            const max = Math.max(metricMeta(id).threshold * 1.1, ...agents.map((item) => metricValue(item, id) ?? 0), 0.1);
            return <td key={id} className="px-3 py-2">{value === null ? <span className="text-muted-foreground/60">Not reported</span> : <div className="flex min-w-32 items-center gap-2"><span className={cn('w-12 shrink-0 font-mono tabular-nums', isMetricAbnormal(id, value) ? 'text-rose-300' : 'text-foreground')}>{formatMetric(id, value)}</span><span className="relative h-1.5 flex-1 rounded-full bg-border/50"><span className={cn('absolute inset-y-0 left-0 rounded-full', isMetricAbnormal(id, value) ? 'bg-rose-400' : 'bg-accent/70')} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} /><span className="absolute -top-0.5 h-2.5 w-px bg-foreground/70" style={{ left: `${(metricMeta(id).threshold / max) * 100}%` }} /></span></div>}</td>;
          })}</tr>)}</tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-4 border-t border-border/40 px-4 py-3 text-[11px] text-muted-foreground"><span><span className="mr-1.5 inline-block size-2.5 rounded-full bg-accent" />Team aggregate</span><span><span className="mr-1.5 inline-block size-2.5 rotate-45 bg-foreground" />Mean of agent averages</span><span><span className="mr-1.5 inline-block h-3 w-px bg-rose-400" />Operational limit</span></div>
    </section>
  );
}

function scoreBand(row: (typeof MONEY_KPIS)[number]): ScorecardBand {
  const number = (value: string) => Number.parseFloat(value.replace(/[^0-9.]/g, ''));
  const achievement = number(row.achievement);
  const challenge = number(row.challenge);
  const target = number(row.target);
  const threshold = number(row.threshold);
  if (row.direction === 'higher') {
    if (achievement >= challenge) return 'Challenge';
    if (achievement >= target) return 'Target';
    if (achievement >= threshold) return 'Threshold';
  } else {
    if (achievement <= challenge) return 'Challenge';
    if (achievement <= target) return 'Target';
    if (achievement <= threshold) return 'Threshold';
  }
  return 'Below';
}

function scorecardMetricRow(metric: DashMetricId): (typeof MONEY_KPIS)[number] | undefined {
  const name = SCORECARD_METRIC_NAMES[metric];
  return MONEY_KPIS.find((row) => row.name === name);
}

function scorecardNumber(value: string): number {
  return Number.parseFloat(value.replace(/[^0-9.]/g, ''));
}

function scorecardBandForMetric(metric: DashMetricId, value: number | null): MetricBand {
  if (value === null) return 'Not reported';
  const row = scorecardMetricRow(metric);
  return row ? scoreBand({ ...row, achievement: String(value) }) : 'Below';
}

function Scorecard() {
  const [showDetails, setShowDetails] = useState(false);
  const number = (value: string) => Number.parseFloat(value.replace(/[^0-9.]/g, ''));
  const listedWeight = MONEY_KPIS.reduce((sum, row) => sum + row.weight, 0);
  return (
    <div className="space-y-4">
      <section className={cn(PANEL, 'p-4')}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent/10 text-accent"><Trophy className="size-5" /></span>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Money Go High · Crazy New 2.0</h2>
              <p className="mt-1 text-xs text-muted-foreground">October 2026 · static supplied snapshot</p>
            </div>
          </div>
          <div className="flex items-end gap-6">
            <div><div className="text-[11px] text-muted-foreground">Supplied score points</div><div className="font-mono text-3xl font-bold tabular-nums text-foreground">{SCORE_TOTAL.toFixed(2)}<span className="text-base font-normal text-muted-foreground"> / 100*</span></div></div>
            <div className="text-right"><div className="text-[11px] text-muted-foreground">Settlement</div><div className="font-mono text-2xl font-semibold text-foreground">×1</div></div>
          </div>
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-100/90">
          <Info className="mt-0.5 size-4 shrink-0" />
          Listed KPI weights total {listedWeight}%. The remaining {100 - listedWeight}% is not represented in this snapshot; values and scores are shown as supplied and are not normalized.
        </div>
      </section>
      <section className={cn(PANEL, 'divide-y divide-border/30 overflow-hidden')}>
        <div className="hidden grid-cols-[minmax(150px,220px)_minmax(140px,1fr)_minmax(135px,180px)] gap-4 px-4 py-3 text-[11px] font-medium text-muted-foreground sm:grid">
          <span>KPI</span><span>Achievement ladder</span><span className="text-right">Weight · Score · Band</span>
        </div>
        {MONEY_KPIS.map((row) => {
          const points = [row.challenge, row.target, row.threshold, row.achievement].map(number);
          const min = Math.min(...points);
          const max = Math.max(...points);
          const span = Math.max(max - min, Math.abs(max) * 0.2, 1);
          const low = min - span * 0.1;
          const high = max + span * 0.1;
          const pos = (value: number) => `${((value - low) / (high - low)) * 100}%`;
          const band = scoreBand(row);
          return (
            <div key={row.name} className="grid grid-cols-1 items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(150px,220px)_minmax(140px,1fr)_minmax(135px,180px)] sm:gap-4">
              <div className="min-w-0"><div className="truncate text-xs font-medium text-foreground" title={row.name}>{row.name}</div><div className="mt-1 text-[11px] text-muted-foreground">{row.category} · {row.direction === 'higher' ? 'Higher is better' : 'Lower is better'}</div></div>
              <div>
                <div className="relative h-2 rounded-full bg-border/50">
                  <span className="dash-progress-fill absolute inset-y-0 left-0 rounded-full bg-accent/15" style={{ width: pos(number(row.achievement)) }} />
                  <span className="absolute -top-1 h-4 w-px bg-amber-300" style={{ left: pos(number(row.threshold)) }} />
                  <span className="absolute -top-1 h-4 w-px bg-sky-300" style={{ left: pos(number(row.target)) }} />
                  <span className="absolute -top-1 h-4 w-px bg-emerald-300" style={{ left: pos(number(row.challenge)) }} />
                  <span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-background" style={{ left: pos(number(row.achievement)) }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono tabular-nums text-muted-foreground">
                  <span className="text-amber-200">Threshold {row.threshold}</span><span className="text-sky-200">Target {row.target}</span><span className="text-emerald-200">Challenge {row.challenge}</span>
                  <strong className="text-foreground">Actual {row.achievement}</strong>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-xs tabular-nums text-foreground">{row.weight}% · {row.score.toFixed(2)} pts</div>
                <span className={cn('mt-1 inline-flex rounded-md px-2 py-0.5 text-[10px] font-medium', band === 'Challenge' ? 'bg-emerald-500/10 text-emerald-200' : band === 'Target' ? 'bg-sky-500/10 text-sky-200' : band === 'Threshold' ? 'bg-amber-500/10 text-amber-200' : 'bg-rose-500/10 text-rose-200')}>{band}</span>
              </div>
            </div>
          );
        })}
        <div className="flex justify-end px-4 py-3 font-mono text-sm font-bold tabular-nums text-foreground">Supplied score sum&nbsp; {SCORE_TOTAL.toFixed(2)}</div>
      </section>
      <section className={cn(PANEL, 'overflow-hidden')}>
        <button type="button" aria-expanded={showDetails} onClick={() => setShowDetails((open) => !open)} className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-semibold text-foreground">
          View scoring details <span className="text-muted-foreground">{showDetails ? 'Hide' : 'Show'}</span>
        </button>
        {showDetails && <div className="overflow-x-auto border-t border-border/40"><table className="w-full min-w-[760px] text-left text-xs"><thead><tr className="text-muted-foreground">{['Category', 'KPI', 'Direction', 'Challenge', 'Target', 'Threshold', 'Weight', 'Achievement', 'Band', 'Score'].map((label) => <th key={label} className="px-3 py-2 font-medium">{label}</th>)}</tr></thead><tbody>{MONEY_KPIS.map((row) => <tr key={row.name} className="border-t border-border/30"><td className="px-3 py-2 text-muted-foreground">{row.category}</td><td className="px-3 py-2 text-foreground">{row.name}</td><td className="px-3 py-2 text-muted-foreground">{row.direction === 'higher' ? 'Higher' : 'Lower'}</td><td className="px-3 py-2 font-mono text-emerald-200">{row.challenge}</td><td className="px-3 py-2 font-mono text-sky-200">{row.target}</td><td className="px-3 py-2 font-mono text-amber-200">{row.threshold}</td><td className="px-3 py-2 font-mono">{row.weight}%</td><td className="px-3 py-2 font-mono text-foreground">{row.achievement}</td><td className="px-3 py-2">{scoreBand(row)}</td><td className="px-3 py-2 font-mono">{row.score.toFixed(2)}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}

function AgentDetailContent({ agent, compare, onCompare }: { agent: DashAgent; compare: string[]; onCompare: (key: string) => void }) {
  const selected = compare.includes(agent.key);
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">{agent.name}</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">{agentBreachCount(agent)} metric breaches · report-level averages</p>
        </div>
        <span className={cn('shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold', OVERALL_BANDS[overallPerformance(agent).band].className)} style={{ backgroundColor: `${OVERALL_BANDS[overallPerformance(agent).band].color}18` }}>
          {overallPerformance(agent).met}/{overallPerformance(agent).available} cutoffs met
        </span>
      </div>
      <div className="mt-3 divide-y divide-border/30 rounded-lg border border-border/50">
        {DASH_METRICS.map((metric) => {
          const value = metricValue(agent, metric.id);
          const abnormal = value !== null && isMetricAbnormal(metric.id, value);
          return <div key={metric.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2.5"><div><div className="text-xs font-medium text-foreground">{metric.label}</div><div className="mt-1 text-[10px] text-muted-foreground">{metric.direction === 'higher' ? 'Minimum' : 'Maximum'} {formatMetric(metric.id, metric.threshold)} cutoff</div></div><div className={cn('text-right font-mono text-sm tabular-nums', abnormal ? 'text-rose-300' : 'text-foreground')}>{value === null ? 'Not reported' : formatMetric(metric.id, value)}{value !== null && <div className="mt-1 text-[10px] text-muted-foreground">{metricGap(metric.id, value)} from limit</div>}</div></div>;
        })}
      </div>
      {agent.csat && <p className="mt-3 text-[11px] text-muted-foreground">CSAT evidence: {formatNumber(agent.csat.good)} good / {formatNumber(agent.csat.bad)} bad / {formatNumber(agent.csat.records)} surveys.</p>}
      {agent.oneTouch && (
        <div className="mt-2 text-[11px] text-muted-foreground">
          <p>One-Touch: {formatNumber(agent.oneTouch.oneTime)} one-touch / {formatNumber(agent.oneTouch.closed)} closed cases.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {agent.oneTouch.channels.map((channel) => (
              <span key={channel.name} className="rounded-md bg-background/60 px-2 py-1">
                {channel.name}: {pct(channel.rate)} ({formatNumber(channel.oneTime)}/{formatNumber(channel.closed)})
              </span>
            ))}
          </div>
        </div>
      )}
      <button type="button" onClick={() => onCompare(agent.key)} className={cn(CONTROL, 'mt-4', selected && ACTIVE_CONTROL)}>{selected ? <Check className="size-4" /> : <Users className="size-4" />}{selected ? 'Remove from comparison' : `Compare agent${compare.length >= 2 ? ' (replace oldest)' : ''}`}</button>
      {compare.length > 0 && <p className="mt-2 text-[10px] text-muted-foreground">Comparison selected: {compare.length}/2. Select another agent to compare reported values.</p>}
    </>
  );
}

function AgentDetailPanel({ agent, compare, onCompare }: { agent: DashAgent | null; compare: string[]; onCompare: (key: string) => void }) {
  return (
    <section className={cn(PANEL, 'h-full min-h-[22rem] p-4')}>
      <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Users className="size-3.5" />
        Agent detail
      </div>
      {agent ? (
        <AgentDetailContent agent={agent} compare={compare} onCompare={onCompare} />
      ) : (
        <div className="flex min-h-[17rem] flex-col items-center justify-center text-center">
          <div className="text-sm font-medium text-foreground">Select an agent seat</div>
          <p className="mt-1 max-w-52 text-xs text-muted-foreground">Full reported metrics and cutoff comparisons will appear here.</p>
        </div>
      )}
    </section>
  );
}

function AgentInspector({ agent, onClose, compare, onCompare, inlineDetails }: { agent: DashAgent | null; onClose: () => void; compare: string[]; onCompare: (key: string) => void; inlineDetails: boolean }) {
  const [wideScreen, setWideScreen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1280px)');
    const update = () => setWideScreen(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return (
    <Dialog open={Boolean(agent) && (!wideScreen || !inlineDetails)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn('max-h-[88vh] max-w-2xl overflow-y-auto p-4 max-sm:top-auto max-sm:bottom-0 max-sm:translate-y-0 max-sm:rounded-b-none sm:p-6', inlineDetails && 'xl:hidden')}>
        <DialogHeader className="sr-only">
          <DialogTitle>{agent?.name ?? 'Agent details'}</DialogTitle>
          <DialogDescription>Selected agent metrics and operational cutoff comparisons</DialogDescription>
        </DialogHeader>
        {agent && <AgentDetailContent agent={agent} compare={compare} onCompare={onCompare} />}
      </DialogContent>
    </Dialog>
  );
}

function ComparisonStrip({ agents, keys, onClear }: { agents: DashAgent[]; keys: string[]; onClear: () => void }) {
  const selected = keys.map((key) => agents.find((agent) => agent.key === key)).filter((agent): agent is DashAgent => Boolean(agent));
  if (selected.length < 2) return null;
  return (
    <section className={cn(PANEL, 'overflow-x-auto p-4')}>
      <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold text-foreground">Agent comparison</h2><button type="button" onClick={onClear} className="text-xs text-muted-foreground hover:text-foreground">Clear</button></div>
      <div className="mt-3 grid min-w-[520px] grid-cols-3 gap-3 text-xs">
        <div className="space-y-2 text-muted-foreground"><div className="h-5" />{DASH_METRICS.map((metric) => <div key={metric.id}>{metric.label}</div>)}</div>
        {selected.map((agent) => <div key={agent.key} className="space-y-2"><div className="truncate font-medium text-foreground">{agent.name}</div>{DASH_METRICS.map((metric) => { const value = metricValue(agent, metric.id); return <div key={metric.id} className={cn('font-mono tabular-nums', value !== null && isMetricAbnormal(metric.id, value) ? 'text-rose-300' : 'text-foreground')}>{value === null ? 'Not reported' : formatMetric(metric.id, value)}</div>; })}</div>)}
      </div>
    </section>
  );
}

function Briefing({ data, agents }: { data: ReturnType<typeof useDashData>; agents: DashAgent[] }) {
  const teamValues: Record<DashMetricId, number | null> = {
    csat: data.csat.state.status === 'ready' ? data.csat.state.report.total.csat : null,
    oneTouch: data.touch.state.status === 'ready' ? data.touch.state.report.total.rate : null,
    chat: data.response.state.status === 'ready' ? data.response.state.data.chat.teamAvg : null,
    emailFirst: data.response.state.status === 'ready' ? data.response.state.data.emailFirst.teamAvg : null,
    emailAvg: data.response.state.status === 'ready' ? data.response.state.data.emailAvg.teamAvg : null,
  };
  const sourceStates = [
    ['CSAT', loadInfo(data.csat.state)],
    ['One-Touch', loadInfo(data.touch.state)],
    ['Workload', loadInfo(data.dailies.state)],
    ['Response time', loadInfo(data.response.state)],
  ] as const;
  const problems = sourceStates.filter(([, state]) => state.status === 'error' || state.status === 'stale');
  const loading = sourceStates.some(([, state]) => state.status === 'loading');
  return (
    <section className={cn(PANEL, 'p-4 sm:p-5')}>
      <div className="flex flex-wrap items-baseline justify-between gap-3"><div><h2 className="text-base font-semibold text-foreground">AMR KPI Briefing</h2><p className="mt-1 text-xs text-muted-foreground">{agents.length} report identities · counts below are metric breaches, not unique people</p></div><span className={cn('text-xs', problems.length ? 'text-amber-200' : 'text-muted-foreground')}>{problems.length ? `Previous data: ${problems.map(([name]) => name).join(', ')}` : loading ? 'Loading source coverage' : 'All report groups loaded'} · MTD snapshot</span></div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {DASH_METRICS.map((metric) => { const value = teamValues[metric.id]; const bad = agents.filter((agent) => { const item = metricValue(agent, metric.id); return item !== null && isMetricAbnormal(metric.id, item); }).length; return <div key={metric.id} className="rounded-lg bg-background/45 p-3"><div className="text-xs text-muted-foreground">{metric.shortLabel}</div><div className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">{value === null ? '—' : formatMetric(metric.id, value)}</div><div className="mt-1 text-[11px] text-muted-foreground">{bad} outside limit</div></div>; })}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-5">
        {DASH_METRICS.map((metric) => { const values = agents.map((agent) => metricValue(agent, metric.id)).filter((value): value is number => value !== null).sort((a, b) => a - b); const max = metric.id === 'csat' || metric.id === 'oneTouch' ? 100 : Math.max(metric.threshold * 1.3, values.at(-1) ?? 0, 1); return <div key={metric.id} className="rounded-lg bg-background/30 p-3"><div className="mb-2 text-[11px] font-medium text-muted-foreground">{metric.label} · {metric.unit}</div><div className="relative h-7 rounded-md bg-border/25">{values.map((value, index) => <span key={`${value}-${index}`} className={cn('absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full', isMetricAbnormal(metric.id, value) ? 'bg-rose-400' : 'bg-accent')} style={{ left: `${(value / max) * 100}%`, top: `${25 + (index % 4) * 17}%` }} />)}<span className="absolute inset-y-0 w-px bg-foreground/60" style={{ left: `${(metric.threshold / max) * 100}%` }} /></div><div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground"><span>0{metric.unit}</span><span>limit {formatMetric(metric.id, metric.threshold)}</span></div></div>; })}
      </div>
      {data.dailies.state.status === 'ready' && <div className="mt-4 border-t border-border/40 pt-3"><p className="mb-2 text-[11px] text-muted-foreground">Independent source totals · Call period unavailable</p><div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground"><span>Call {formatNumber(data.dailies.state.data.call.handled)}</span><span>Chat {formatNumber(data.dailies.state.data.chat.total)}</span><span>Email {formatNumber(data.dailies.state.data.email.total)}</span></div></div>}
    </section>
  );
}

export default function Dash() {
  const data = useDashData();
  const [preferences] = useState(readDashPreferences);
  const [view, setView] = useState<View>(preferences.view);
  const [explore, setExplore] = useState<ExploreView>(preferences.explore);
  const [qualityMetric, setQualityMetric] = useState<QualityMetric>(preferences.qualityMetric);
  const [query, setQuery] = useState('');
  const [needsAttention, setNeedsAttention] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [briefing, setBriefing] = useState(preferences.briefing);
  const [selected, setSelected] = useState<DashAgent | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [focusMetric, setFocusMetric] = useState<DashMetricId | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(DASH_PREFERENCES_KEY, JSON.stringify({ view, explore, qualityMetric, briefing }));
    } catch {
      // The dashboard remains usable when browser storage is unavailable.
    }
  }, [briefing, explore, qualityMetric, view]);

  const totalMetricBreaches = data.agents.reduce((sum, agent) => sum + agentBreachCount(agent), 0);
  const agentsWithBreaches = data.agents.filter((agent) => agentBreachCount(agent) > 0).length;
  const reportsLoading = [data.csat.state, data.touch.state, data.dailies.state, data.response.state].some((state) => state.status === 'loading');
  const reportsReady = [data.csat.state, data.touch.state, data.dailies.state, data.response.state].every((state) =>
    state.status === 'ready' && !state.refreshError,
  );
  const filteredAgents = useMemo(() => {
    const normalizedQuery = normalizeAgentName(query);
    return data.agents.filter((agent) => {
      if (normalizedQuery && !normalizeAgentName(agent.name).includes(normalizedQuery)) return false;
      if (!needsAttention) return true;
      if (view === 'explore' && explore === 'quality') {
        const id = qualityMetric as DashMetricId;
        const value = metricValue(agent, id);
        return value !== null && isMetricAbnormal(id, value);
      }
      if (view === 'explore' && explore === 'response') {
        return (['chat', 'emailFirst', 'emailAvg'] as DashMetricId[]).some((id) => {
          const value = metricValue(agent, id);
          return value !== null && isMetricAbnormal(id, value);
        });
      }
      return agentBreachCount(agent) > 0;
    });
  }, [data.agents, explore, needsAttention, query, qualityMetric, view]);

  const teamValues: Record<DashMetricId, number | null> = {
    csat: data.csat.state.status === 'ready' ? data.csat.state.report.total.csat : null,
    oneTouch: data.touch.state.status === 'ready' ? data.touch.state.report.total.rate : null,
    chat: data.response.state.status === 'ready' ? data.response.state.data.chat.teamAvg : null,
    emailFirst: data.response.state.status === 'ready' ? data.response.state.data.emailFirst.teamAvg : null,
    emailAvg: data.response.state.status === 'ready' ? data.response.state.data.emailAvg.teamAvg : null,
  };
  const metricCounts = Object.fromEntries(DASH_METRICS.map((metric) => {
    const available = metric.id === 'csat'
      ? data.csat.state.status === 'ready'
      : metric.id === 'oneTouch'
        ? data.touch.state.status === 'ready'
        : data.response.state.status === 'ready';
    if (!available) return [metric.id, null];
    return [metric.id, data.agents.filter((agent) => {
      const value = metricValue(agent, metric.id);
      return value !== null && isMetricAbnormal(metric.id, value);
    }).length];
  })) as Record<DashMetricId, number | null>;
  const showAgentControls = view !== 'scorecard' && !(view === 'explore' && explore === 'workload');

  const openMetric = (metric: DashMetricId) => {
    setFocusMetric(metric);
    setView('explore');
    if (metric === 'csat' || metric === 'oneTouch') {
      setExplore('quality');
      setQualityMetric(metric);
    } else {
      setExplore('response');
    }
  };

  const toggleCompare = (key: string) => {
    setCompare((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key);
      return current.length === 2 ? [current[1]!, key] : [...current, key];
    });
  };

  return (
    <div className="min-h-full bg-background px-3 py-3 text-foreground sm:px-5 sm:py-4">
      <header className="sticky top-0 z-30 -mx-3 mb-4 border-b border-border/50 bg-background/90 px-3 py-3 backdrop-blur-xl sm:-mx-5 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground sm:text-xl"><Activity className="size-5 text-accent" />AMR Dashboard</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Month to date · Salesforce report snapshot</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(['overview', 'explore', 'scorecard'] as View[]).map((item) => <button key={item} type="button" onClick={() => { setView(item); setBriefing(false); }} aria-current={view === item && !briefing ? 'page' : undefined} className={cn(CONTROL, 'capitalize', view === item && !briefing && ACTIVE_CONTROL)}>{item === 'scorecard' ? 'Scorecard' : item[0]!.toUpperCase() + item.slice(1)}</button>)}
            <button type="button" onClick={() => setBriefing((current) => !current)} className={cn(CONTROL, briefing && ACTIVE_CONTROL)}>{briefing ? 'Exit briefing' : 'Briefing'}</button>
            <ReportSources data={data} open={sourcesOpen} onToggle={() => setSourcesOpen((open) => !open)} />
            <button type="button" onClick={data.reload} disabled={data.refreshing} className={CONTROL}><RefreshCw className={cn('size-4', data.refreshing && 'animate-spin')} />{data.refreshing ? 'Updating' : 'Refresh'}</button>
          </div>
        </div>
        {!briefing && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {showAgentControls && <label className="relative min-w-[190px] flex-1 sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search agents" aria-label="Search agents" className="h-9 w-full rounded-lg border border-border/70 bg-card/45 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70" /></label>}
            {showAgentControls && <button type="button" onClick={() => setNeedsAttention((current) => !current)} aria-pressed={needsAttention} className={cn(CONTROL, needsAttention && ALERT_CONTROL)}><CircleAlert className="size-4" />{needsAttention ? 'Needs attention' : 'All agents'}<span className="rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-200">{reportsReady ? `${agentsWithBreaches} with breaches · ${totalMetricBreaches} metric breaches` : reportsLoading ? 'Loading report counts' : 'Partial report coverage'}</span></button>}
            {showAgentControls && (query || needsAttention) && <button type="button" onClick={() => { setQuery(''); setNeedsAttention(false); }} className={cn(CONTROL, 'min-h-8')}><X className="size-3.5" />Clear filters</button>}
          </div>
        )}
      </header>

      {briefing ? (
        <Briefing data={data} agents={data.agents} />
      ) : view === 'scorecard' ? (
        <Scorecard />
      ) : view === 'overview' ? (
        <div className="space-y-4">
          <section>
            <div className="mb-2 flex items-center justify-between gap-3"><h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Team overview</h2><span className="text-[11px] text-muted-foreground">Team totals do not change with agent filters</span></div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {DASH_METRICS.filter((metric) => metric.id === 'csat' || metric.id === 'oneTouch').map((metric) => <MetricTile key={metric.id} metric={metric.id} value={teamValues[metric.id]} abnormalCount={metricCounts[metric.id]} onClick={() => openMetric(metric.id)} />)}
              <ResponseSummaryTile
                values={{ chat: teamValues.chat, emailFirst: teamValues.emailFirst, emailAvg: teamValues.emailAvg }}
                abnormalCounts={{ chat: metricCounts.chat, emailFirst: metricCounts.emailFirst, emailAvg: metricCounts.emailAvg }}
                onClick={() => openMetric('chat')}
              />
            </div>
          </section>
          <MtdVolumeSummary state={data.dailies.state} onExplore={() => { setView('explore'); setExplore('workload'); }} />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(340px,0.8fr)]">
            <ParliamentChart agents={filteredAgents} selectedKey={selected?.key ?? null} onSelect={setSelected} />
            <div className="hidden xl:block">
              <AgentDetailPanel agent={selected} compare={compare} onCompare={toggleCompare} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.8fr)]">
            <AgentMatrix
              agents={filteredAgents}
              emptyMessage={
                reportsLoading && data.agents.length === 0
                  ? 'Loading report data and building the agent matrix…'
                  : data.agents.length === 0
                    ? 'No report identities are currently available.'
                    : 'No agents match the current search and attention filters.'
              }
              onAgent={setSelected}
              onMetric={(agent, metric) => { setSelected(agent); setFocusMetric(metric); }}
            />
            <div className="space-y-4">
              <button type="button" onClick={() => setView('scorecard')} className={cn(PANEL, 'flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:border-accent/50')}>
                <span><span className="block text-xs font-semibold text-foreground">October 2026 static scorecard</span><span className="mt-1 block text-[11px] text-muted-foreground">Supplied score {SCORE_TOTAL.toFixed(2)} pts · 90% of listed weights</span></span><ChevronRight className="size-4 text-muted-foreground" />
              </button>
            </div>
          </div>
          <ComparisonStrip agents={data.agents} keys={compare} onClear={() => setCompare([])} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex flex-wrap rounded-lg border border-border/60 bg-card/40 p-1">
              {(['quality', 'workload', 'response'] as ExploreView[]).map((item) => <button key={item} type="button" onClick={() => setExplore(item)} className={cn('rounded-md px-3 py-2 text-xs font-medium capitalize transition-colors', explore === item ? 'bg-accent/15 text-foreground' : 'text-muted-foreground hover:text-foreground')}>{item === 'response' ? 'Response times' : item}</button>)}
            </div>
            {focusMetric && <span className="text-xs text-muted-foreground">Focused metric: {metricMeta(focusMetric).label}<button type="button" onClick={() => setFocusMetric(null)} className="ml-2 text-accent">Clear</button></span>}
          </div>
          {explore === 'quality' && (
            <div className="space-y-3">
              <div className="inline-flex rounded-lg border border-border/60 bg-card/40 p-1">
                {(['csat', 'oneTouch'] as QualityMetric[]).map((metric) => <button key={metric} type="button" onClick={() => setQualityMetric(metric)} className={cn('rounded-md px-3 py-2 text-xs font-medium transition-colors', qualityMetric === metric ? 'bg-accent/15 text-foreground' : 'text-muted-foreground hover:text-foreground')}>{metric === 'csat' ? 'CSAT' : 'One-Touch channels'}</button>)}
              </div>
              {qualityMetric === 'csat' ? <DotRows agents={filteredAgents} metric="csat" onSelect={setSelected} /> : <OneTouchMatrix agents={filteredAgents} report={data.touch.state.status === 'ready' ? data.touch.state.report.total : null} onSelect={setSelected} />}
            </div>
          )}
          {explore === 'workload' && <WorkloadExplore state={data.dailies.state} />}
          {explore === 'response' && <ResponseExplore reports={data.response.state.status === 'ready' ? [data.response.state.data.chat, data.response.state.data.emailFirst, data.response.state.data.emailAvg] : null} agents={filteredAgents} />}
          <ComparisonStrip agents={data.agents} keys={compare} onClear={() => setCompare([])} />
        </div>
      )}

      <footer className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border/30 pt-3 text-[11px] text-muted-foreground">
        <span>Operational thresholds are separate from the static scorecard bands.</span>
        <span className="inline-flex items-center gap-1.5"><Clock3 className="size-3" />Data may be partial when a source is unavailable.</span>
      </footer>
      <AgentInspector agent={selected} onClose={() => setSelected(null)} compare={compare} onCompare={toggleCompare} inlineDetails={view === 'overview'} />
    </div>
  );
}
