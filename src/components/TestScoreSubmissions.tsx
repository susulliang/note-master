import { useEffect, useMemo, useState } from 'react';
import { Activity, Database, Medal, UsersRound } from 'lucide-react';
import {
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { cn } from '@/lib/utils';

interface RecentTestResult {
  id: number;
  agentName: string;
  suiteLabel: string;
  scorePct: number;
  correct: number;
  total: number;
  submittedAt: string;
}

interface TestScoreData {
  totalSubmissions: number;
  averageScorePct: number | null;
  bestScorePct: number | null;
  uniqueAgents: number;
  totalCorrect: number;
  totalQuestionsAnswered: number;
  overallAccuracyPct: number | null;
  scoreBands: Array<{ label: string; count: number }>;
  recent: RecentTestResult[];
}

type ScoreState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: TestScoreData };

const PANEL = 'rounded-xl border border-border/60 bg-card/45 backdrop-blur-md';
const BAND_COLORS = ['#f85149', '#d29922', '#58a6ff', '#3fb950'];

function parseSubmittedAt(value: string): Date | null {
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function relativeTime(value: string): string {
  const date = parseSubmittedAt(value);
  if (!date) return 'Time unavailable';
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absolute = Math.abs(seconds);
  const [amount, unit]: [number, Intl.RelativeTimeFormatUnit] =
    absolute < 60
      ? [seconds, 'second']
      : absolute < 3600
        ? [Math.round(seconds / 60), 'minute']
        : absolute < 86400
          ? [Math.round(seconds / 3600), 'hour']
          : [Math.round(seconds / 86400), 'day'];
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(amount, unit);
}

function scoreColor(score: number): string {
  if (score < 60) return '#f85149';
  if (score < 75) return '#d29922';
  if (score < 90) return '#58a6ff';
  return '#3fb950';
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function ScoreTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const result = payload[0]!.payload as RecentTestResult;
  const date = parseSubmittedAt(result.submittedAt);
  return (
    <div className="rounded-lg border border-border/80 bg-[#0d1117]/95 px-3 py-2 text-xs shadow-xl backdrop-blur-md">
      <div className="font-semibold text-foreground">{result.agentName}</div>
      <div className="mt-1 text-muted-foreground">{result.suiteLabel}</div>
      <div className="mt-2 flex items-center gap-3 font-mono tabular-nums">
        <span style={{ color: scoreColor(result.scorePct) }}>{result.scorePct}%</span>
        <span className="text-muted-foreground">{result.correct}/{result.total} correct</span>
      </div>
      {date && <div className="mt-1 text-[10px] text-muted-foreground">{date.toLocaleString()}</div>}
    </div>
  );
}

export function useTestScoreData(): ScoreState {
  const [state, setState] = useState<ScoreState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/test-results', {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Score data unavailable');
        return (await response.json()) as TestScoreData;
      })
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: 'ready', data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      });

    return () => controller.abort();
  }, []);

  return state;
}

export default function TestScoreSubmissions({ state }: { state: ScoreState }) {
  const trend = useMemo(() => {
    if (state.status !== 'ready') return [];
    return [...state.data.recent]
      .slice(0, 10)
      .reverse()
      .map((result) => ({
        ...result,
        timestamp: parseSubmittedAt(result.submittedAt)?.getTime() ?? 0,
      }));
  }, [state]);

  const data = state.status === 'ready' ? state.data : null;
  const maxBandCount = Math.max(1, ...(data?.scoreBands.map((band) => band.count) ?? []));
  const weightedAccuracy = data?.overallAccuracyPct ?? null;
  const accuracyFill = Math.max(0, Math.min(100, weightedAccuracy ?? 0));

  return (
    <section className={cn(PANEL, 'overflow-hidden p-4 sm:p-5')} aria-labelledby="test-score-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
            <Database className="size-3.5" />
            Test Result Database
          </div>
          <h2 id="test-score-title" className="mt-1 text-base font-semibold text-foreground sm:text-lg">
            Self-test submissions
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            All-time results and the latest attempts · fetched when DASH opens
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-medium text-emerald-200">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-300" />
          Cloudflare D1
        </span>
      </div>

      {state.status === 'error' ? (
        <div className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-4 text-sm text-amber-100">
          Score submissions are unavailable right now.
        </div>
      ) : (
        <>
          {state.status === 'loading' ? (
            <div className="mt-4 grid gap-3 xl:grid-cols-3">
              <div className="h-[26rem] animate-pulse rounded-lg bg-background/40" />
              <div className="h-[26rem] animate-pulse rounded-lg bg-background/40" />
              <div className="h-[26rem] animate-pulse rounded-lg bg-background/40" />
            </div>
          ) : data && data.totalSubmissions === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-border/70 bg-background/20 px-4 py-8 text-center">
              <p className="text-sm font-medium text-foreground">No scores submitted yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Completed self-tests will appear here.</p>
            </div>
          ) : data ? (
            <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,1fr)_minmax(240px,0.82fr)]">
              <div className="rounded-lg border border-border/40 bg-background/25 p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-foreground">Recent score trail</h3>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">Hover a point for the agent and test</p>
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">{trend.length} latest</span>
                </div>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 12, right: 12, bottom: 4, left: 2 }}>
                      <CartesianGrid stroke="#30363d" strokeDasharray="3 5" vertical={false} />
                      <XAxis
                        type="number"
                        dataKey="timestamp"
                        name="Submitted"
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={(value: number) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        tick={{ fill: '#8b949e', fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={24}
                      />
                      <YAxis
                        type="number"
                        dataKey="scorePct"
                        name="Score"
                        domain={[0, 100]}
                        ticks={[0, 50, 100]}
                        tickFormatter={(value: number) => `${value}%`}
                        tick={{ fill: '#8b949e', fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        width={34}
                      />
                      <Tooltip content={<ScoreTooltip />} cursor={{ stroke: '#8b949e', strokeDasharray: '3 3' }} />
                      <Scatter data={trend} dataKey="scorePct" isAnimationActive={false}>
                        {trend.map((result) => (
                          <Cell key={result.id} fill={scoreColor(result.scorePct)} stroke="#0d1117" strokeWidth={2} />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-lg border border-border/40 bg-background/25 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-foreground">Latest submissions</h3>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">Newest first · 10 latest attempts</p>
                  </div>
                  <span className="rounded-full bg-accent/10 px-2 py-1 font-mono text-[10px] text-accent">{Math.min(data.recent.length, 10)}</span>
                </div>
                {data.recent.length ? (
                  <div className="max-h-[326px] space-y-0.5 overflow-y-auto pr-1">
                    {data.recent.slice(0, 10).map((result) => (
                      <article
                        key={result.id}
                        className="grid h-8 grid-cols-[minmax(0,1fr)_36px_42px_auto] items-center gap-1.5 rounded-md px-1.5 text-[10px] transition-colors hover:bg-card/70"
                        title={`${result.agentName} · ${result.suiteLabel} · ${result.correct}/${result.total} correct · ${relativeTime(result.submittedAt)}`}
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span
                            className="flex size-5 shrink-0 items-center justify-center rounded-full border text-[8px] font-semibold"
                            style={{ color: scoreColor(result.scorePct), borderColor: `${scoreColor(result.scorePct)}55`, backgroundColor: `${scoreColor(result.scorePct)}15` }}
                            aria-hidden="true"
                          >
                            {initials(result.agentName)}
                          </span>
                          <span className="shrink-0 max-w-[74px] truncate font-semibold text-foreground">{result.agentName}</span>
                          <span className="hidden text-muted-foreground sm:inline">·</span>
                          <span className="min-w-0 truncate text-muted-foreground">{result.suiteLabel}</span>
                        </div>
                        <span className="text-right font-mono font-semibold tabular-nums" style={{ color: scoreColor(result.scorePct) }}>
                          {result.scorePct}%
                        </span>
                        <span className="text-right font-mono tabular-nums text-muted-foreground">
                          {result.correct}/{result.total}
                        </span>
                        <time className="hidden min-w-[42px] text-right text-muted-foreground sm:block">
                          {relativeTime(result.submittedAt)}
                        </time>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="py-8 text-center text-xs text-muted-foreground">No recent attempts.</p>
                )}
              </div>

              <div className="rounded-lg border border-border/40 bg-background/25 p-3">
                <div className="mb-2">
                  <h3 className="text-xs font-semibold text-foreground">Test-taker Chart</h3>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Aggregate performance across all attempts</p>
                </div>
                <div className="flex items-center justify-center py-2">
                  <div
                    className="grid size-32 place-items-center rounded-full"
                    style={{
                      background: `conic-gradient(${scoreColor(weightedAccuracy ?? 0)} ${accuracyFill}%, rgb(48 54 61 / 0.55) ${accuracyFill}% 100%)`,
                    }}
                    role="img"
                    aria-label={`Weighted question accuracy ${weightedAccuracy == null ? 'unavailable' : `${weightedAccuracy.toFixed(1)} percent`}`}
                  >
                    <div className="grid size-[6.5rem] place-content-center rounded-full bg-[#0d1117] text-center">
                      <span className="font-mono text-2xl font-semibold tabular-nums" style={{ color: scoreColor(weightedAccuracy ?? 0) }}>
                        {weightedAccuracy == null ? '—' : `${weightedAccuracy.toFixed(1)}%`}
                      </span>
                      <span className="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">Weighted score</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <StatTile
                    label="Tests done"
                    value={data.totalSubmissions.toLocaleString()}
                    icon={<Activity className="size-3.5 text-accent" />}
                    loading={false}
                  />
                  <StatTile
                    label="Questions answered"
                    value={data.totalQuestionsAnswered.toLocaleString()}
                    icon={<UsersRound className="size-3.5 text-violet-300" />}
                    loading={false}
                  />
                  <StatTile
                    label="Correct answers"
                    value={data.totalCorrect.toLocaleString()}
                    icon={<Medal className="size-3.5 text-emerald-300" />}
                    loading={false}
                  />
                  <StatTile
                    label="Test-takers"
                    value={data.uniqueAgents.toLocaleString()}
                    icon={<UsersRound className="size-3.5 text-sky-300" />}
                    loading={false}
                  />
                </div>
                <div className="mt-3 border-t border-border/30 pt-2.5">
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <span className="text-[10px] font-semibold text-foreground">Score bands</span>
                    <span className="text-[9px] text-muted-foreground">attempts</span>
                  </div>
                  <div className="space-y-1.5">
                    {data.scoreBands.map((band, index) => (
                      <div key={band.label} className="grid grid-cols-[48px_minmax(0,1fr)_24px] items-center gap-1.5 text-[9px]">
                        <span className="font-mono text-muted-foreground">{band.label}</span>
                        <div className="h-1.5 overflow-hidden rounded-full bg-border/35">
                          <div
                            className="h-full rounded-full transition-[width] duration-500"
                            style={{ width: `${(band.count / maxBandCount) * 100}%`, backgroundColor: BAND_COLORS[index % BAND_COLORS.length] }}
                          />
                        </div>
                        <span className="text-right font-mono tabular-nums text-foreground">{band.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function StatTile({
  label,
  value,
  icon,
  loading,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/35 bg-background/25 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        {icon}
      </div>
      <div className={cn('mt-1 font-mono text-lg font-semibold tabular-nums text-foreground', loading && 'animate-pulse text-muted-foreground')}>
        {value}
      </div>
    </div>
  );
}
