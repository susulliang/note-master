import type {
  CsatAgentRow,
  OneTouchRow,
  ResponseTimeReport,
} from '@/lib/sf-reports';
import { THRESHOLDS } from '@/lib/kpi-thresholds';

export type DashMetricId = 'csat' | 'oneTouch' | 'chat' | 'emailFirst' | 'emailAvg';
export type DashMetricValue = number | null;

export interface DashAgent {
  key: string;
  name: string;
  csat: CsatAgentRow | null;
  oneTouch: OneTouchRow | null;
  chat: number | null;
  emailFirst: number | null;
  emailAvg: number | null;
}

export interface MetricMeta {
  id: DashMetricId;
  label: string;
  shortLabel: string;
  unit: '%' | 's' | 'h';
  threshold: number;
  direction: 'higher' | 'lower';
  decimals: number;
}

export const DASH_METRICS: MetricMeta[] = [
  { id: 'csat', label: 'CSAT', shortLabel: 'CSAT', unit: '%', threshold: THRESHOLDS.csat.value, direction: 'higher', decimals: 1 },
  { id: 'oneTouch', label: 'One-Touch', shortLabel: 'Touch', unit: '%', threshold: THRESHOLDS.oneTouchMtd.value, direction: 'higher', decimals: 1 },
  { id: 'chat', label: 'Chat response', shortLabel: 'Chat', unit: 's', threshold: THRESHOLDS.chatResponse.value, direction: 'lower', decimals: 1 },
  { id: 'emailFirst', label: 'Email first response', shortLabel: 'Email 1st', unit: 'h', threshold: THRESHOLDS.emailFirstResponse.value, direction: 'lower', decimals: 2 },
  { id: 'emailAvg', label: 'Email avg response', shortLabel: 'Email avg', unit: 'h', threshold: THRESHOLDS.emailAvgResponse.value, direction: 'lower', decimals: 2 },
];

export function normalizeAgentName(name: string): string {
  return name
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildDashAgents(
  csat: CsatAgentRow[],
  touch: OneTouchRow[],
  response: Pick<ResponseTimeReport, 'agents'>[],
): DashAgent[] {
  const agents = new Map<string, DashAgent>();
  const get = (name: string) => {
    const key = normalizeAgentName(name);
    let agent = agents.get(key);
    if (!agent) {
      agent = { key, name, csat: null, oneTouch: null, chat: null, emailFirst: null, emailAvg: null };
      agents.set(key, agent);
    } else if (name.length > agent.name.length) {
      agent.name = name;
    }
    return agent;
  };

  for (const row of csat) get(row.owner).csat = row;
  for (const row of touch) get(row.owner).oneTouch = row;
  response.forEach((report, index) => {
    for (const row of report.agents) {
      const agent = get(row.owner);
      if (index === 0) agent.chat = row.value;
      else if (index === 1) agent.emailFirst = row.value;
      else if (index === 2) agent.emailAvg = row.value;
    }
  });

  return [...agents.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function metricValue(agent: DashAgent, metric: DashMetricId): DashMetricValue {
  switch (metric) {
    case 'csat':
      return agent.csat && agent.csat.good + agent.csat.bad > 0 ? agent.csat.csat : null;
    case 'oneTouch':
      return agent.oneTouch && agent.oneTouch.closed > 0 ? agent.oneTouch.rate : null;
    case 'chat':
      return agent.chat;
    case 'emailFirst':
      return agent.emailFirst;
    case 'emailAvg':
      return agent.emailAvg;
  }
}

export function metricMeta(id: DashMetricId): MetricMeta {
  return DASH_METRICS.find((metric) => metric.id === id)!;
}

export function isMetricAbnormal(id: DashMetricId, value: number): boolean {
  const metric = metricMeta(id);
  return metric.direction === 'higher' ? value < metric.threshold : value > metric.threshold;
}

// Stage levels from the "KPI Money Go High!" matrix: threshold (minimum
// acceptable), target and challenge. Powers the agent signal matrix stage
// coloring. NOTE: the email response-time thresholds here intentionally
// mirror the KPI matrix photo (8h/10h) and differ from THRESHOLDS (4h).
export interface MetricStageLevels {
  threshold: number;
  target: number;
  challenge: number;
}

export const METRIC_STAGES: Record<DashMetricId, MetricStageLevels> = {
  csat: { threshold: 85, target: 90, challenge: 95 },
  oneTouch: { threshold: 68, target: 72, challenge: 76 },
  chat: { threshold: 26, target: 23, challenge: 20 },
  emailFirst: { threshold: 8, target: 4, challenge: 2 },
  emailAvg: { threshold: 10, target: 6, challenge: 4 },
};

export type MetricStage = 'breach' | 'warn' | 'target' | 'challenge';

export function metricStage(id: DashMetricId, value: number): MetricStage {
  const levels = METRIC_STAGES[id];
  const direction = metricMeta(id).direction;
  if (direction === 'higher') {
    if (value < levels.threshold) return 'breach';
    if (value < levels.target) return 'warn';
    if (value < levels.challenge) return 'target';
    return 'challenge';
  }
  if (value > levels.threshold) return 'breach';
  if (value > levels.target) return 'warn';
  if (value > levels.challenge) return 'target';
  return 'challenge';
}

/** Stage chip styles shared by matrix cells and the legend. */
export const METRIC_STAGE_STYLES: Record<MetricStage, string> = {
  breach: 'bg-rose-500/10 text-rose-300 hover:bg-rose-500/20',
  warn: 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/20',
  target: 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20',
  challenge: 'bg-sky-500/10 text-sky-300 hover:bg-sky-500/20',
};

export const METRIC_STAGE_LEGEND: { stage: MetricStage; label: string; dot: string }[] = [
  { stage: 'breach', label: 'below threshold', dot: 'bg-rose-400' },
  { stage: 'warn', label: 'threshold → target', dot: 'bg-amber-400' },
  { stage: 'target', label: 'target → challenge', dot: 'bg-emerald-400' },
  { stage: 'challenge', label: '≥ challenge', dot: 'bg-sky-400' },
];

/** Breach count against the KPI-matrix stage thresholds (see METRIC_STAGES). */
export function metricBreachCount(agent: DashAgent): number {
  return DASH_METRICS.reduce((count, metric) => {
    const value = metricValue(agent, metric.id);
    return count + (value !== null && metricStage(metric.id, value) === 'breach' ? 1 : 0);
  }, 0);
}

export function agentBreachCount(agent: DashAgent): number {
  return DASH_METRICS.reduce((count, metric) => {
    const value = metricValue(agent, metric.id);
    return count + (value !== null && isMetricAbnormal(metric.id, value) ? 1 : 0);
  }, 0);
}

export function formatMetric(id: DashMetricId, value: number): string {
  const metric = metricMeta(id);
  return `${value.toFixed(metric.decimals)}${metric.unit}`;
}

export function metricGap(id: DashMetricId, value: number): string {
  const metric = metricMeta(id);
  const delta = metric.direction === 'higher' ? value - metric.threshold : metric.threshold - value;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(metric.decimals)}${metric.unit === '%' ? ' pp' : metric.unit}`;
}
