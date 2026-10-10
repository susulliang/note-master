// KPI thresholds — sourced from the "KPI Money Go High!" matrix threshold
// column. direction 'higher' means value must be >= threshold to be healthy.
// Shared by the Dash sections (CSAT report widget, Money Go High matrix).

export type Direction = 'higher' | 'lower';

export interface MetricThreshold {
  value: number;
  direction: Direction;
}

export const THRESHOLDS: Record<string, MetricThreshold> = {
  csat: { value: 85, direction: 'higher' }, // CSAT threshold 85%
  csatMtd: { value: 95, direction: 'higher' }, // CSAT MTD (excluding DTC + OR) threshold 95%
  oneTouch: { value: 68, direction: 'higher' }, // One-touch weekly threshold 68%
  oneTouchMtd: { value: 72, direction: 'higher' }, // One-touch MTD abnormality cutoff 72%
  chatResponse: { value: 26, direction: 'lower' }, // Chat avg response ≤ 26s
  emailFirstResponse: { value: 4, direction: 'lower' }, // Email first reply ≤ 4h
  emailAvgResponse: { value: 4, direction: 'lower' }, // Email avg reply ≤ 4h
};

export function isAbnormal(metric: string, value: number): boolean {
  const t = THRESHOLDS[metric];
  if (!t) return false;
  return t.direction === 'higher' ? value < t.value : value > t.value;
}
