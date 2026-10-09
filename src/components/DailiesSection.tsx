import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import {
  AlertTriangle,
  Award,
  Coffee,
  FileSpreadsheet,
  Headset,
  Mail,
  Phone,
  RefreshCw,
  Timer,
  TrendingDown,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { countMtdShifts } from '@/lib/roster-shifts';
import type { CountReport } from '@/lib/sf-reports';
import type { DailiesState } from '@/hooks/use-dailies-report';

/**
 * Dailies widget — MTD contact volume across Call / Chat / Email, loaded from
 * the four newest Salesforce exports (MTD Call Data + Historical Metrics CSVs,
 * Chat Messaging + AMR Email xlsx). Each channel panel shows the team average
 * daily volume (MTD total ÷ roster MTD worked shifts) plus a vertical bar
 * graph: call volumes by direction, and per-agent counts for chat & email.
 *
 * A right-hand performance panel ranks agents by per-shift productivity
 * (chat + email ÷ matched roster shifts), flagging overworked agents (well
 * above the team average — needs rest) and underworked ones (well below).
 */

function shortName(name: string): string {
  const parts = name.replace(/[.]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
  if (parts.length === 1) return parts[0]!.slice(0, 10);
  return `${parts[0]} ${parts[parts.length - 1]![0] ?? ''}.`.replace(/\s+\.$/, '.');
}

function fmtSec(s: number): string {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/* ----------------------------- channel colors ----------------------------- */

const CHANNELS = {
  call: {
    label: 'Call',
    icon: Phone,
    grad: 'from-amber-300 to-amber-600',
    text: 'text-amber-300',
    ring: 'ring-amber-500/40',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    bar: '#fbbf24',
    barAbn: '#fb7185',
  },
  chat: {
    label: 'Chat',
    icon: Headset,
    grad: 'from-sky-300 to-sky-600',
    text: 'text-sky-300',
    ring: 'ring-sky-500/40',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/30',
    bar: '#38bdf8',
    barAbn: '#fb7185',
  },
  email: {
    label: 'Email',
    icon: Mail,
    grad: 'from-violet-300 to-violet-600',
    text: 'text-violet-300',
    ring: 'ring-violet-500/40',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/30',
    bar: '#a78bfa',
    barAbn: '#fb7185',
  },
} as const;

/* ------------------------------ shared tooltip ----------------------------- */

function BarTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0]!;
  return (
    <div className="rounded-lg border border-border/80 bg-[#0d1117]/95 px-2.5 py-1.5 text-xs shadow-xl backdrop-blur-md">
      <div className="font-semibold text-foreground">{label}</div>
      <div className="font-mono tabular-nums text-muted-foreground">
        {typeof d.value === 'number' ? d.value.toLocaleString() : d.value}
      </div>
    </div>
  );
}

/* ------------------------------ channel panel ------------------------------ */

interface ChannelPanelProps {
  channel: (typeof CHANNELS)[keyof typeof CHANNELS];
  total: number;
  shifts: number;
  subtitle: string;
  asOf: string | null;
  children: React.ReactNode;
}

function ChannelPanel({ channel, total, shifts, subtitle, asOf, children }: ChannelPanelProps) {
  const daily = shifts > 0 ? total / shifts : 0;
  const Icon = channel.icon;
  return (
    <div className={cn('flex flex-col rounded-xl border bg-background/30 p-3', channel.border)}>
      <div className="flex items-center gap-2">
        <div className={cn('flex size-7 items-center justify-center rounded-lg ring-1', channel.bg, channel.ring)}>
          <Icon className={cn('size-4', channel.text)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-foreground">{channel.label}</div>
          <div className="truncate text-[10px] text-muted-foreground">{subtitle}</div>
        </div>
      </div>

      {/* Daily average card */}
      <div className="mt-3 rounded-lg border border-border/50 bg-card/40 p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Avg / shift
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Users className="size-3" />
            {shifts} shifts
          </span>
        </div>
        <div className="mt-1 flex items-end gap-1.5">
          <span className={cn('text-3xl font-black leading-none tabular-nums', channel.text)}>
            {daily.toFixed(2)}
          </span>
          <span className="pb-0.5 text-[11px] text-muted-foreground">
            {channel.label.toLowerCase()}/shift
          </span>
        </div>
        <div className="mt-1 font-mono text-[10px] text-muted-foreground">
          {total.toLocaleString()} total MTD{asOf ? ` · ${asOf}` : ''}
        </div>
      </div>

      <div className="mt-3 flex-1">{children}</div>
    </div>
  );
}

/* --------------------------------- call panel -------------------------------- */

function CallBars({ data, color }: { data: { name: string; value: number }[]; color: string }) {
  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} opacity={0.5} />
          <XAxis dataKey="name" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
          <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} tickLine={false} axisLine={false} />
          <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(88,166,255,0.08)' }} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
            <LabelList dataKey="value" position="top" style={{ fill: 'var(--muted-foreground)', fontSize: 10, fontWeight: 700 }} />
            {data.map((_, i) => (
              <Cell key={i} fill={color} fillOpacity={i === 2 ? 0.7 : 0.9} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------ per-agent bars ------------------------------ */

function AgentBars({
  report,
  color,
}: {
  report: CountReport;
  color: string;
}) {
  const data = useMemo(
    () => [...report.agents].sort((a, b) => b.count - a.count).map((a) => ({ name: shortName(a.owner), value: a.count })),
    [report],
  );
  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 8, left: -20, bottom: 0 }} barCategoryGap="18%">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} opacity={0.5} />
          <XAxis
            dataKey="name"
            interval={0}
            height={48}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 8.5 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            angle={-38}
            textAnchor="end"
          />
          <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} tickLine={false} axisLine={false} width={32} />
          <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(88,166,255,0.08)' }} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={20}>
            {data.map((_, i) => (
              <Cell key={i} fill={color} fillOpacity={0.88} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* --------------------------------- section ---------------------------------- */

interface DailiesSectionProps {
  state: DailiesState;
  onRetry: () => void;
}

/* --------------------------- performer ranking ---------------------------- */

interface Performer {
  owner: string;
  chat: number;
  email: number;
  total: number;
  shifts: number;
  /** True when the agent wasn't matched in the roster and shifts were estimated. */
  estimated: boolean;
  /** contacts (chat+email) per worked shift */
  rate: number;
  flag: 'overworked' | 'underworked' | 'ok';
}

const OVERWORKED_RATIO = 1.25;
const UNDERWORKED_RATIO = 0.7;

/**
 * Matches a report owner name to a roster English name by first-token
 * equality, disambiguating duplicates (e.g. Kevin W. vs Kevin X.) by the
 * last-name initial appearing in the owner string.
 */
function matchRosterShifts(owner: string, byAgent: Record<string, number>): number {
  const norm = owner.toLowerCase().replace(/[.]+/g, ' ').replace(/\s+/g, ' ').trim();
  const first = norm.split(' ')[0];
  if (!first) return 0;
  const candidates = Object.keys(byAgent).filter((en) => {
    const e = en.toLowerCase().replace(/\s+/g, ' ').trim();
    return e.split(' ')[0] === first;
  });
  if (candidates.length === 0) return 0;
  if (candidates.length === 1) return byAgent[candidates[0]]!;
  for (const c of candidates) {
    const lastInitial = c.toLowerCase().split(' ').pop()![0];
    if (lastInitial && norm.includes(lastInitial)) return byAgent[c]!;
  }
  return byAgent[candidates[0]]!;
}

function computePerformers(
  chat: CountReport,
  email: CountReport,
  shiftsByAgent: Record<string, number>,
): { performers: Performer[]; avgRate: number } {
  const map = new Map<string, { chat: number; email: number }>();
  for (const a of chat.agents) {
    map.set(a.owner, { chat: a.count, email: 0 });
  }
  for (const a of email.agents) {
    const e = map.get(a.owner) ?? { chat: 0, email: 0 };
    e.email = a.count;
    map.set(a.owner, e);
  }
  const performers: Performer[] = [];
  const raw: { owner: string; chat: number; email: number; total: number; shifts: number }[] = [];
  let matchedShifts = 0;
  let matchedCount = 0;
  for (const [owner, v] of map) {
    const total = v.chat + v.email;
    const shifts = matchRosterShifts(owner, shiftsByAgent);
    raw.push({ owner, chat: v.chat, email: v.email, total, shifts });
    if (shifts > 0) {
      matchedShifts += shifts;
      matchedCount++;
    }
  }
  // Agents not in the roster get the average shifts of matched agents so their
  // productivity is still comparable (avoid divide-by-zero → bogus 0 rate).
  const fallbackShifts = matchedCount > 0 ? matchedShifts / matchedCount : 0;
  let totalContacts = 0;
  let totalShifts = 0;
  for (const r of raw) {
    const estimated = r.shifts === 0;
    const shifts = estimated ? fallbackShifts : r.shifts;
    const rate = shifts > 0 ? r.total / shifts : 0;
    performers.push({ ...r, shifts, estimated, rate, flag: 'ok' });
    totalContacts += r.total;
    totalShifts += shifts;
  }
  const avgRate = totalShifts > 0 ? totalContacts / totalShifts : 0;
  for (const p of performers) {
    if (p.rate >= avgRate * OVERWORKED_RATIO) p.flag = 'overworked';
    else if (!p.estimated && p.rate <= avgRate * UNDERWORKED_RATIO) p.flag = 'underworked';
  }
  return { performers, avgRate };
}

function FlagBadge({ flag }: { flag: Performer['flag'] }) {
  if (flag === 'ok') return null;
  if (flag === 'overworked') {
    return (
      <span
        title="Handling well above team average — consider more rest"
        className="inline-flex items-center gap-0.5 rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[8px] font-bold uppercase text-rose-300 ring-1 ring-rose-500/40"
      >
        <Coffee className="size-2.5" /> needs rest
      </span>
    );
  }
  return (
    <span
      title="Handling well below team average"
      className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[8px] font-bold uppercase text-amber-300 ring-1 ring-amber-500/40"
    >
      <TrendingDown className="size-2.5" /> low
    </span>
  );
}

function PerformancePanel({ performers, avgRate }: { performers: Performer[]; avgRate: number }) {
  const sorted = [...performers].sort((a, b) => b.rate - a.rate);
  const top = sorted.slice(0, 5);
  const bottom = [...sorted].reverse().slice(0, 5);
  const overworked = performers.filter((p) => p.flag === 'overworked').length;
  const underworked = performers.filter((p) => p.flag === 'underworked').length;

  const Row = ({ p }: { p: Performer }) => (
    <div className="flex items-center gap-2 rounded-lg bg-background/30 px-2 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[11px] font-semibold text-foreground">{p.owner}</span>
          <FlagBadge flag={p.flag} />
        </div>
        <div className="font-mono text-[9px] text-muted-foreground">
          {p.total} ({p.chat}c/{p.email}e) · {p.estimated ? '~' : ''}{p.shifts} shifts
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-sm font-black tabular-nums text-fuchsia-200">{p.rate.toFixed(1)}</div>
        <div className="text-[8px] text-muted-foreground">/shift</div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col rounded-xl border border-fuchsia-500/30 bg-background/30 p-3">
      <div className="flex items-center gap-2">
        <div className="flex size-7 items-center justify-center rounded-lg bg-fuchsia-500/15 ring-1 ring-fuchsia-500/40">
          <Award className="size-4 text-fuchsia-300" />
        </div>
        <div>
          <div className="text-sm font-bold text-foreground">Performance</div>
          <div className="text-[10px] text-muted-foreground">
            team avg {avgRate.toFixed(1)}/shift
          </div>
        </div>
      </div>

      <div className="mt-2 flex gap-2">
        <span className="flex-1 rounded-md bg-rose-500/10 px-2 py-1 text-center ring-1 ring-rose-500/30">
          <Coffee className="mx-auto size-3 text-rose-300" />
          <div className="font-mono text-sm font-bold text-rose-200">{overworked}</div>
          <div className="text-[8px] uppercase text-rose-300/70">needs rest</div>
        </span>
        <span className="flex-1 rounded-md bg-amber-500/10 px-2 py-1 text-center ring-1 ring-amber-500/30">
          <TrendingDown className="mx-auto size-3 text-amber-300" />
          <div className="font-mono text-sm font-bold text-amber-200">{underworked}</div>
          <div className="text-[8px] uppercase text-amber-300/70">low output</div>
        </span>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
          <Award className="size-3" /> Top performers
        </div>
        <div className="space-y-1.5">
          {top.map((p) => (
            <Row key={`top-${p.owner}`} p={p} />
          ))}
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-rose-300">
          <AlertTriangle className="size-3" /> Bottom performers
        </div>
        <div className="space-y-1.5">
          {bottom.map((p) => (
            <Row key={`bot-${p.owner}`} p={p} />
          ))}
        </div>
      </div>

      <p className="mt-3 text-[9px] leading-relaxed text-muted-foreground">
        Rate = (chat + email) ÷ matched roster shifts. Call is team-level and excluded from per-agent ranking.
        Overworked ≥ {(OVERWORKED_RATIO * 100).toFixed(0)}% of avg; underworked ≤ {(UNDERWORKED_RATIO * 100).toFixed(0)}%.
      </p>
    </div>
  );
}

/** Skills counted in the dailies denominator — frontline agents only. */
const DAILIES_SKILLS = ['Chat', 'Call', 'FR Call'] as const;
const CHAT_SKILLS = ['Chat'] as const;
const CALL_SKILLS = ['Call', 'FR Call'] as const;

export function DailiesSection({ state, onRetry }: DailiesSectionProps) {
  const shiftsByAgent = useMemo(
    () => countMtdShifts(undefined, undefined, undefined, [...DAILIES_SKILLS]).byAgent,
    [],
  );
  const chatShifts = useMemo(
    () => countMtdShifts(undefined, undefined, undefined, [...CHAT_SKILLS]).total,
    [],
  );
  const callShifts = useMemo(
    () => countMtdShifts(undefined, undefined, undefined, [...CALL_SKILLS]).total,
    [],
  );
  const allShifts = useMemo(
    () => countMtdShifts(undefined, undefined, undefined, [...DAILIES_SKILLS]).total,
    [],
  );

  const performers = useMemo(() => {
    if (state.status !== 'ready') return null;
    return computePerformers(state.data.chat, state.data.email, shiftsByAgent);
  }, [state, shiftsByAgent]);

  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-card/40 backdrop-blur-md">
      <header className="flex flex-wrap items-center gap-2 border-b border-border/40 px-4 py-3">
        <div className="flex size-7 items-center justify-center rounded-lg bg-fuchsia-500/15 ring-1 ring-fuchsia-500/30">
          <Timer className="size-4 text-fuchsia-300" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">Dailies — MTD</h2>
          <p className="flex min-w-0 items-center gap-1.5 truncate text-[11px] text-muted-foreground">
            <FileSpreadsheet className="size-3 shrink-0" />
            Call · Chat · Email · denominator = {allShifts} shifts (Chat + Call + FR Call agents only, excl. SV/TL/T2/T3/DTC) · call ÷ {callShifts} · chat ÷ {chatShifts} · email ÷ {allShifts}
          </p>
        </div>
      </header>

      {state.status === 'loading' && (
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[340px] rounded-xl bg-muted-foreground/10" />
            ))}
          </div>
          <div className="h-[340px] rounded-xl bg-muted-foreground/10" />
        </div>
      )}

      {state.status === 'error' && (
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-rose-500/15 ring-1 ring-rose-500/40">
            <AlertTriangle className="size-5 text-rose-300" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Couldn’t load the dailies reports</p>
            <p className="mt-1 max-w-md text-[11px] text-muted-foreground">{state.message}</p>
          </div>
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-fuchsia-500/50 hover:text-fuchsia-200"
          >
            <RefreshCw className="size-3.5" />
            Retry
          </button>
        </div>
      )}

      {state.status === 'ready' && (
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
          {/* Grand total */}
          {(() => {
            const chatT = state.data.chat.total;
            const emailT = state.data.email.total;
            const callT = state.data.call.handled;
            const grand = chatT + emailT + callT;
            const grandDaily = allShifts > 0 ? grand / allShifts : 0;
            return (
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-fuchsia-500/30 bg-gradient-to-r from-fuchsia-500/10 via-background/40 to-background/40 p-4">
                <div className="flex size-10 items-center justify-center rounded-lg bg-fuchsia-500/20 ring-1 ring-fuchsia-500/40">
                  <Timer className="size-5 text-fuchsia-300" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Grand total · all channels
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black tabular-nums text-fuchsia-200">
                      {grand.toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground">contacts MTD</span>
                  </div>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-3">
                  <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-1.5">
                    <div className="text-[9px] uppercase text-muted-foreground">Call</div>
                    <div className="font-mono text-sm font-bold tabular-nums text-amber-200">
                      {callT.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-1.5">
                    <div className="text-[9px] uppercase text-muted-foreground">Chat</div>
                    <div className="font-mono text-sm font-bold tabular-nums text-sky-200">
                      {chatT.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-1.5">
                    <div className="text-[9px] uppercase text-muted-foreground">Email</div>
                    <div className="font-mono text-sm font-bold tabular-nums text-violet-200">
                      {emailT.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/15 px-3 py-1.5 ring-1 ring-fuchsia-500/30">
                    <div className="text-[9px] uppercase text-fuchsia-300/80">Grand dailies</div>
                    <div className="font-mono text-lg font-black tabular-nums text-fuchsia-100">
                      {grandDaily.toFixed(2)}
                      <span className="text-[10px] font-normal text-fuchsia-300/70"> / shift</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="grid gap-4 md:grid-cols-3">
          {/* Call */}
          <ChannelPanel
            channel={CHANNELS.call}
            total={state.data.call.handled}
            shifts={callShifts}
            subtitle={`${state.data.call.handled.toLocaleString()} handled · SL20 ${state.data.call.serviceLevel20.toFixed(1)}%`}
            asOf={null}
          >
            <CallBars
              color={CHANNELS.call.bar}
              data={[
                { name: 'Incoming', value: state.data.call.handled - state.data.call.handledOutbound },
                { name: 'Outbound', value: state.data.call.handledOutbound },
                { name: 'Abandoned', value: state.data.call.abandoned },
              ]}
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border/50 bg-background/30 px-2.5 py-1.5">
                <div className="text-[9px] uppercase tracking-wide text-muted-foreground">SL 20s</div>
                <div className="font-mono text-sm font-bold tabular-nums text-amber-200">
                  {state.data.call.serviceLevel20.toFixed(1)}%
                </div>
              </div>
              <div className="rounded-lg border border-border/50 bg-background/30 px-2.5 py-1.5">
                <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Avg handle</div>
                <div className="font-mono text-sm font-bold tabular-nums text-amber-200">
                  {fmtSec(state.data.call.avgHandleTimeSec)}
                </div>
              </div>
            </div>
          </ChannelPanel>

          {/* Chat */}
          <ChannelPanel
            channel={CHANNELS.chat}
            total={state.data.chat.total}
            shifts={chatShifts}
            subtitle={`${state.data.chat.agents.length} agents · ${state.data.chat.total.toLocaleString()} sessions`}
            asOf={state.data.chat.asOf}
          >
            <AgentBars report={state.data.chat} color={CHANNELS.chat.bar} />
          </ChannelPanel>

          {/* Email */}
          <ChannelPanel
            channel={CHANNELS.email}
            total={state.data.email.total}
            shifts={allShifts}
            subtitle={`${state.data.email.agents.length} agents · ${state.data.email.total.toLocaleString()} messages`}
            asOf={state.data.email.asOf}
          >
            <AgentBars report={state.data.email} color={CHANNELS.email.bar} />
          </ChannelPanel>
          </div>
          </div>

          {performers && (
            <PerformancePanel performers={performers.performers} avgRate={performers.avgRate} />
          )}
        </div>
      )}
    </section>
  );
}
