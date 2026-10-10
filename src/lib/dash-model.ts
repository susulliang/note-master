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
