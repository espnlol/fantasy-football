/** Percentile rank of `value` within `values`, in [0,100]. */
export function percentileRank(values: number[], value: number, higherIsBetter = true): number {
  if (values.length === 0) return 50;
  let countBelow = 0;
  let countEqual = 0;
  for (const v of values) {
    if (v < value) countBelow++;
    else if (v === value) countEqual++;
  }
  const pct = ((countBelow + 0.5 * countEqual) / values.length) * 100;
  return higherIsBetter ? pct : 100 - pct;
}

export type Tier = 'Elite' | 'Good' | 'Average' | 'Below Average' | 'Poor';

export function tierFromPercentile(pct: number): Tier {
  if (pct >= 80) return 'Elite';
  if (pct >= 60) return 'Good';
  if (pct >= 40) return 'Average';
  if (pct >= 20) return 'Below Average';
  return 'Poor';
}

export interface ScoreComponent {
  label: string;
  /** 0-100, higher = more favorable for the fantasy player being evaluated. */
  percentile: number;
  weight: number;
  detail: string;
  sampleSize?: number;
}

export type Lean = 'Strong Start' | 'Start' | 'Flex' | 'Bench' | 'Avoid';

export function leanFromPercentile(pct: number): Lean {
  if (pct >= 75) return 'Strong Start';
  if (pct >= 58) return 'Start';
  if (pct >= 42) return 'Flex';
  if (pct >= 25) return 'Bench';
  return 'Avoid';
}

export interface CompositeResult {
  lean: Lean;
  score: number;
  components: ScoreComponent[];
}

/** A transparent weighted average of component percentiles — every input stays visible, this never hides behind one opaque number. */
export function compositeLean(components: ScoreComponent[]): CompositeResult {
  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const score =
    totalWeight > 0 ? components.reduce((s, c) => s + c.percentile * c.weight, 0) / totalWeight : 50;
  return { lean: leanFromPercentile(score), score: Math.round(score * 10) / 10, components };
}
