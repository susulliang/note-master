import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  FileSpreadsheet,
  Headset,
  Mail,
  Phone,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { THRESHOLDS } from '@/lib/kpi-thresholds';
import type { OneTouchChannel, OneTouchRow } from '@/lib/sf-reports';
import type { OneTouchReportState } from '@/hooks/use-one-touch-report';

/**
 * One Touch MTD widget — live from the newest "One touch rate By Agent
 * Monthly" Salesforce export in sf_reports/. Left: parliament (semicircle
 * seating) chart, one seat per agent, colored by rate band; hover a seat for
 * exact stats. Right: overall one-touch rate plus Chat / Email / Call channel
 * group aggregates with per-origin mini bars. The global "Show Abnormal"
 * toggle dims agents at/above the 72% cutoff.
 */

const CUTOFF = THRESHOLDS.oneTouchMtd.value; // 72

// ---------------------------------------------------------------------------
// Channel grouping (origin labels verbatim from the pivot header)
// ---------------------------------------------------------------------------

const CHANNEL_GROUPS: { key: string; label: string; icon: typeof Headset; names: string[] }[] = [
  {
    key: 'chat',
    label: 'Chat',
    icon: Headset,
    names: ['Zendesk Chat', 'Chat', 'Offline Chat', 'Abandoned Chat', 'Mobile SDK'],
  },
  {
    key: 'email',
    label: 'Email',
    icon: Mail,
    names: ['Manual', 'DTC Website', 'Web Form', 'Email', 'Yeedi-US-Email'],
  },
  {
    key: 'call',
    label: 'Call',
    icon: Phone,
    names: ['Inbound Call', 'Outbound Call'],
  },
];

interface Aggregate {
  oneTime: number;
  closed: number;
  rate: number;
}

function aggregate(channels: OneTouchChannel[], names: string[]): Aggregate {
  let oneTime = 0;
  let closed = 0;
  for (const name of names) {
    const ch = channels.find((c) => c.name === name);
    if (!ch) continue;
    oneTime += ch.oneTime;
    closed += ch.closed;
  }
  return { oneTime, closed, rate: closed > 0 ? (oneTime / closed) * 100 : 0 };
}

// ---------------------------------------------------------------------------
// Rate bands + colors
// ---------------------------------------------------------------------------

type Band = 'below' | 'fair' | 'good' | 'great';

const BAND_META: Record<Band, { label: string; color: string; glow: string }> = {
  below: { label: `< ${CUTOFF}%`, color: '#fb7185', glow: 'rgba(251,113,133,0.55)' },
  fair: { label: `${CUTOFF}–80%`, color: '#fcd34d', glow: 'rgba(252,211,77,0.45)' },
  good: { label: '80–90%', color: '#7dd3fc', glow: 'rgba(125,211,252,0.45)' },
  great: { label: '≥ 90%', color: '#6ee7b7', glow: 'rgba(110,231,183,0.45)' },
};

function bandOf(rate: number): Band {
  if (rate < CUTOFF) return 'below';
  if (rate < 80) return 'fair';
  if (rate < 90) return 'good';
  return 'great';
}

// ---------------------------------------------------------------------------
// Parliament geometry — concentric semicircular rings, outer → inner,
// left → right, agents ordered by rate ascending so colors sweep like heat.
// ---------------------------------------------------------------------------

const VB_W = 720;
const VB_H = 380;
const CX = VB_W / 2;
// Vertically center the semicircle's bounding box (height = MAX_R) inside the
// canvas: dots span CY-MAX_R (top) … CY (baseline), so CY = H/2 + MAX_R/2.
const MAX_R = 256;
const MIN_R = 78;
const CY = VB_H / 2 + MAX_R / 2;

interface Seat {
  agent: OneTouchRow;
  x: number;
  y: number;
  band: Band;
  label: string;
}

/** "Kevin Woods" → "Kevin W." · "George Scheddi Plantagenet" → "George P." */
function seatLabel(name: string): string {
  const parts = name.replace(/[.]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
  if (parts.length === 1) return parts[0]!.slice(0, 12);
  const first = parts[0]!;
  const lastInitial = parts[parts.length - 1]![0];
  return lastInitial ? `${first} ${lastInitial}.` : first;
}

function buildSeats(agents: OneTouchRow[]): Seat[] {
  const n = agents.length;
  const ringCount = Math.min(7, Math.max(5, Math.round(n / 7)));
  const weights = Array.from({ length: ringCount }, (_, i) => i + 1);
  const wsum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (n * w) / wsum);
  const counts = raw.map((v) => Math.floor(v));
  let residual = n - counts.reduce((a, b) => a + b, 0);
  const fracOrder = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < residual; k++) counts[fracOrder[k]!.i]!++;

  const step = (MAX_R - MIN_R) / (ringCount - 1);
  const ordered = [...agents].sort((a, b) => a.rate - b.rate || a.owner.localeCompare(b.owner));

  const seats: Seat[] = [];
  let idx = 0;
  for (let r = ringCount - 1; r >= 0; r--) {
    const radius = MIN_R + r * step;
    const c = counts[r]!;
    for (let k = 0; k < c; k++) {
      const alpha = Math.PI - ((k + 0.5) / c) * Math.PI;
      const agent = ordered[idx++]!;
      seats.push({
        agent,
        x: CX + radius * Math.cos(alpha),
        y: CY - radius * Math.sin(alpha),
        band: bandOf(agent.rate),
        label: seatLabel(agent.owner),
      });
    }
  }
  return seats;
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function RateBar({ rate, className }: { rate: number; className?: string }) {
  const abnormal = rate < CUTOFF;
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-border/50', className)}>
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500',
          abnormal
            ? 'bg-gradient-to-r from-rose-400 to-rose-600'
            : 'bg-gradient-to-r from-emerald-300 to-teal-600'
        )}
        style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
      />
    </div>
  );
}

function ChannelRow({ ch }: { ch: OneTouchChannel }) {
  const abnormal = ch.rate < CUTOFF;
  return (
    <div className="flex items-center gap-2" title={`${ch.name}: ${ch.oneTime} one-time / ${ch.closed} closed`}>
      <span className="w-[92px] shrink-0 truncate text-[10px] text-muted-foreground">{ch.name}</span>
      <RateBar rate={ch.rate} className="h-1" />
      <span
        className={cn(
          'w-[104px] shrink-0 text-right font-mono text-[10px] tabular-nums',
          abnormal ? 'text-rose-300' : 'text-emerald-300/90'
        )}
      >
        {ch.rate.toFixed(1)}%
        <span className="text-muted-foreground/60">
          {' '}
          {ch.oneTime}/{ch.closed}
        </span>
      </span>
    </div>
  );
}

function GroupCard({
  label,
  icon: Icon,
  agg,
  channels,
}: {
  label: string;
  icon: typeof Headset;
  agg: Aggregate;
  channels: OneTouchChannel[];
}) {
  const abnormal = agg.rate < CUTOFF;
  const present = channels.filter((c) => c.closed > 0).sort((a, b) => b.closed - a.closed);
  return (
    <div className="rounded-xl border border-border/50 bg-background/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground">
          <Icon className={cn('size-3.5', abnormal ? 'text-rose-300' : 'text-emerald-300')} />
          {label}
        </div>
        <div className="text-right">
          <span className={cn('text-sm font-black tabular-nums', abnormal ? 'text-rose-300' : 'text-emerald-300')}>
            {agg.rate.toFixed(2)}%
          </span>
          <span className="ml-1 font-mono text-[9px] text-muted-foreground">
            {agg.oneTime}/{agg.closed}
          </span>
        </div>
      </div>
      <RateBar rate={agg.rate} className="mt-2" />
      <div className="mt-2 space-y-1.5">
        {present.map((ch) => (
          <ChannelRow key={ch.name} ch={ch} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

interface OneTouchSectionProps {
  state: OneTouchReportState;
  showAbnormal: boolean;
  onRetry: () => void;
  /** Compact mode: hide parliament chart and channel breakdown, keep overall rate. */
  mini?: boolean;
}

export function OneTouchSection({ state, showAbnormal, onRetry, mini = false }: OneTouchSectionProps) {
  const report = state.status === 'ready' ? state.report : null;
  const [hovered, setHovered] = useState<Seat | null>(null);

  const seats = useMemo(() => (report ? buildSeats(report.agents) : []), [report]);

  const bandCounts = useMemo(() => {
    const counts: Record<Band, number> = { below: 0, fair: 0, good: 0, great: 0 };
    for (const s of seats) counts[s.band]++;
    return counts;
  }, [seats]);

  const belowCount = bandCounts.below;

  const groups = useMemo(() => {
    if (!report) return [];
    return CHANNEL_GROUPS.map((g) => ({
      ...g,
      agg: aggregate(report.total.channels, g.names),
      channels: g.names
        .map((name) => report.total.channels.find((c) => c.name === name))
        .filter((c): c is OneTouchChannel => Boolean(c)),
    }));
  }, [report]);

  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-card/40 backdrop-blur-md">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-2 border-b border-border/40 px-4 py-3">
        <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/15 ring-1 ring-amber-500/30">
          <Zap className="size-4 text-amber-300" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">One Touch — MTD</h2>
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
        {report && belowCount > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-300 ring-1 ring-rose-500/40">
            <AlertTriangle className="size-2.5" />
            {belowCount} below {CUTOFF}%
          </span>
        )}
      </header>

      {state.status === 'loading' && (
        <div className="grid animate-pulse gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="h-[400px] rounded-xl bg-muted-foreground/10" />
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-muted-foreground/10" />
            ))}
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-rose-500/15 ring-1 ring-rose-500/40">
            <AlertTriangle className="size-5 text-rose-300" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Couldn’t load the One-touch report</p>
            <p className="mt-1 max-w-md text-[11px] text-muted-foreground">{state.message}</p>
          </div>
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-amber-500/50 hover:text-amber-200"
          >
            <RefreshCw className="size-3.5" />
            Retry
          </button>
        </div>
      )}

      {report && (
        <div className={cn('grid gap-5 p-4', mini ? 'grid-cols-1' : 'lg:grid-cols-[minmax(0,1fr)_340px]')}>
          {/* Left — parliament (hidden in mini mode) */}
          {!mini && (
          <div className="flex flex-col rounded-xl border border-border/50 bg-background/30 p-3">
            <div className="relative flex-1">
              <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="h-auto w-full" role="img" aria-label="One touch rate by agent, parliament chart">
                {seats.map((s, i) => {
                  const meta = BAND_META[s.band];
                  const dimmed = showAbnormal && s.band !== 'below';
                  const isHovered = hovered === s;
                  return (
                    <g
                      key={`${s.agent.owner}-${i}`}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHovered(s)}
                      onMouseLeave={() => setHovered((cur) => (cur === s ? null : cur))}
                    >
                      <circle
                        cx={s.x}
                        cy={s.y}
                        r={isHovered ? 13 : 10.5}
                        fill={meta.color}
                        fillOpacity={dimmed ? 0.08 : 0.92}
                        stroke={isHovered ? '#ffffff' : dimmed ? meta.color : 'rgba(0,0,0,0.35)'}
                        strokeWidth={isHovered ? 1.8 : 1}
                        style={{
                          transition: 'r 120ms ease, fill-opacity 200ms ease',
                          filter: isHovered ? `drop-shadow(0 0 7px ${meta.glow})` : undefined,
                        }}
                      />
                      <text
                        x={s.x}
                        y={s.y + 23}
                        textAnchor="middle"
                        fontSize={9}
                        fontWeight={isHovered ? 700 : 500}
                        fill={isHovered ? '#ffffff' : 'var(--muted-foreground)'}
                        fillOpacity={dimmed ? 0.14 : isHovered ? 1 : 0.85}
                        style={{ pointerEvents: 'none', transition: 'fill-opacity 200ms ease' }}
                      >
                        {s.label}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* Center label */}
              <div className="pointer-events-none absolute inset-x-0 top-[74%] flex -translate-y-1/2 flex-col items-center">
                {showAbnormal ? (
                  <>
                    <span className="text-3xl font-black tabular-nums text-rose-300">{belowCount}</span>
                    <span className="text-[10px] uppercase tracking-wider text-rose-300/70">below {CUTOFF}%</span>
                  </>
                ) : (
                  <>
                    <span className="text-3xl font-black tabular-nums text-foreground">{seats.length}</span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">agents · MTD</span>
                  </>
                )}
              </div>

              {/* Hover panel */}
              {hovered && (
                <div
                  className="pointer-events-none absolute z-10 w-[210px] -translate-x-1/2 -translate-y-full rounded-xl border border-border/80 bg-[#0d1117]/95 px-3.5 py-3 shadow-2xl shadow-black/50 backdrop-blur-md"
                  style={{
                    left: `${Math.min(86, Math.max(14, (hovered.x / VB_W) * 100))}%`,
                    top: `${(hovered.y / VB_H) * 100}%`,
                    marginTop: -16,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-bold text-foreground">{hovered.agent.owner}</span>
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ring-1"
                      style={{
                        color: BAND_META[hovered.band].color,
                        background: `${BAND_META[hovered.band].color}26`,
                        boxShadow: `inset 0 0 0 1px ${BAND_META[hovered.band].color}66`,
                      }}
                    >
                      {hovered.band === 'below' ? 'Below KPI' : 'On track'}
                    </span>
                  </div>
                  <div
                    className="mt-1 text-2xl font-black leading-none tabular-nums"
                    style={{ color: BAND_META[hovered.band].color }}
                  >
                    {hovered.agent.rate.toFixed(2)}
                    <span className="text-sm font-bold">%</span>
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                    {hovered.agent.oneTime} / {hovered.agent.closed} one-touch closed
                  </div>
                  <div className="mt-2 space-y-1 border-t border-border/50 pt-2">
                    {CHANNEL_GROUPS.map((g) => {
                      const a = aggregate(hovered.agent.channels, g.names);
                      if (a.closed === 0) return null;
                      return (
                        <div key={g.key} className="flex items-center justify-between text-[10px]">
                          <span className="text-muted-foreground">{g.label}</span>
                          <span
                            className={cn(
                              'font-mono font-bold tabular-nums',
                              a.rate < CUTOFF ? 'text-rose-300' : 'text-emerald-300/90'
                            )}
                          >
                            {a.rate.toFixed(1)}%
                            <span className="text-muted-foreground/60">
                              {' '}
                              {a.oneTime}/{a.closed}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border/40 pt-2.5">
              {(Object.keys(BAND_META) as Band[]).map((b) => (
                <span key={b} className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span
                    className="inline-block size-2.5 rounded-full"
                    style={{ backgroundColor: BAND_META[b].color, boxShadow: `0 0 5px ${BAND_META[b].glow}` }}
                  />
                  {BAND_META[b].label}
                  <span className="font-mono font-bold" style={{ color: BAND_META[b].color }}>
                    {bandCounts[b]}
                  </span>
                </span>
              ))}
            </div>
          </div>

          )}

          {/* Right — overall + channel groups */}
          <div className="space-y-3">
            {/* Overall */}
            <div
              className={cn(
                'rounded-xl border p-3.5',
                report.total.rate < CUTOFF
                  ? 'border-rose-500/30 bg-rose-500/10'
                  : 'border-emerald-500/30 bg-emerald-500/10'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Total one-touch rate
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1',
                    report.total.rate < CUTOFF
                      ? 'bg-rose-500/15 text-rose-300 ring-rose-500/40'
                      : 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40'
                  )}
                >
                  {report.total.rate < CUTOFF ? <AlertTriangle className="size-2.5" /> : <BadgeCheck className="size-2.5" />}
                  cutoff {CUTOFF}%
                </span>
              </div>
              <div className="mt-1 flex items-end gap-2">
                <span
                  className={cn(
                    'text-4xl font-black leading-none tabular-nums tracking-tight',
                    report.total.rate < CUTOFF ? 'text-rose-300' : 'text-emerald-300'
                  )}
                >
                  {report.total.rate.toFixed(2)}
                  <span className="text-lg">%</span>
                </span>
                <span className="pb-0.5 font-mono text-[10px] text-muted-foreground">
                  {report.total.oneTime.toLocaleString()} / {report.total.closed.toLocaleString()} cases
                </span>
              </div>
              <RateBar rate={report.total.rate} className="mt-2.5 h-2" />
            </div>

            {!mini &&
              groups.map((g) => (
                <GroupCard key={g.key} label={g.label} icon={g.icon} agg={g.agg} channels={g.channels} />
              ))}
          </div>
        </div>
      )}
    </section>
  );
}
