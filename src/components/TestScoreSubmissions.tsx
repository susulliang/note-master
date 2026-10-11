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
      .reverse()
      .map((result) => ({
        ...result,
        timestamp: parseSubmittedAt(result.submittedAt)?.getTime() ?? 0,
      }));
  }, [state]);

  const data = state.status === 'ready' ? state.data : null;
  const maxBandCount = Math.max(1, ...(data?.scoreBands.map((band) => band.count) ?? []));

  return (
    <section className={cn(PANEL, 'overflow-hidden p-4 sm:p-5')} aria-labelledby="test-score-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
            <Database className="size-3.5" />
            D1 score stream
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
          <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
            <StatTile
              label="Total attempts"
              value={data ? data.totalSubmissions.toLocaleString() : '—'}
              icon={<Activity className="size-4 text-accent" />}
              loading={state.status === 'loading'}
            />
            <StatTile
              label="Average score"
              value={data?.averageScorePct == null ? '—' : `${data.averageScorePct.toFixed(1)}%`}
              icon={<span className="font-mono text-sm text-sky-300">AVG</span>}
              loading={state.status === 'loading'}
            />
            <StatTile
              label="Best score"
              value={data?.bestScorePct == null ? '—' : `${data.bestScorePct.toFixed(0)}%`}
              icon={<Medal className="size-4 text-emerald-300" />}
              loading={state.status === 'loading'}
            />
            <StatTile
              label="Agents"
              value={data ? data.uniqueAgents.toLocaleString() : '—'}
              icon={<UsersRound className="size-4 text-violet-300" />}
              loading={state.status === 'loading'}
            />
          </div>

          {state.status === 'loading' ? (
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <div className="h-56 animate-pulse rounded-lg bg-background/40" />
              <div className="h-56 animate-pulse rounded-lg bg-background/40" />
            </div>
          ) : data && data.totalSubmissions === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-border/70 bg-background/20 px-4 py-8 text-center">
              <p className="text-sm font-medium text-foreground">No scores submitted yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Completed self-tests will appear here.</p>
            </div>
          ) : data ? (
            <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
              <div className="space-y-3">
                <div className="rounded-lg border border-border/40 bg-background/25 p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-semibold text-foreground">Recent score trail</h3>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">Hover a point for the agent and test</p>
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">{trend.length} latest</span>
                  </div>
                  <div className="h-40 w-full">
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
                  <div className="mb-3 flex items-baseline justify-between gap-2">
                    <h3 className="text-xs font-semibold text-foreground">All-time score spread</h3>
                    <span className="text-[10px] text-muted-foreground">attempts by score band</span>
                  </div>
                  <div className="space-y-2.5">
                    {data.scoreBands.map((band, index) => (
                      <div key={band.label} className="grid grid-cols-[64px_minmax(0,1fr)_36px] items-center gap-2 text-[10px]">
                        <span className="font-mono text-muted-foreground">{band.label}</span>
                        <div className="h-2 overflow-hidden rounded-full bg-border/35">
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

              <div className="rounded-lg border border-border/40 bg-background/25 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-foreground">Latest submissions</h3>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">Newest first · up to 12 attempts</p>
                  </div>
                  <span className="rounded-full bg-accent/10 px-2 py-1 font-mono text-[10px] text-accent">{data.recent.length}</span>
                </div>
                {data.recent.length ? (
                  <div className="max-h-[382px] space-y-1 overflow-y-auto pr-1">
                    {data.recent.map((result) => (
                      <article key={result.id} className="group rounded-lg px-2 py-2 transition-colors hover:bg-card/70">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="flex size-8 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold"
                            style={{ color: scoreColor(result.scorePct), borderColor: `${scoreColor(result.scorePct)}55`, backgroundColor: `${scoreColor(result.scorePct)}15` }}
                            aria-hidden="true"
                          >
                            {initials(result.agentName)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-xs font-semibold text-foreground">{result.agentName}</p>
                              <span className="shrink-0 font-mono text-xs font-semibold tabular-nums" style={{ color: scoreColor(result.scorePct) }}>
                                {result.scorePct}%
                              </span>
                            </div>
                            <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                              <span className="truncate">{result.suiteLabel} · {result.correct}/{result.total} correct</span>
                              <time className="shrink-0">{relativeTime(result.submittedAt)}</time>
                            </div>
                          </div>
                        </div>
                        <div className="ml-[42px] mt-1.5 h-1 overflow-hidden rounded-full bg-border/35">
                          <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, result.scorePct))}%`, backgroundColor: scoreColor(result.scorePct) }} />
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="py-8 text-center text-xs text-muted-foreground">No recent attempts.</p>
                )}
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
