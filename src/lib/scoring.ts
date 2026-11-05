/**
 * Forecast scoring. Probabilities are 0–1 here; the UI works in whole percents.
 * Brier score: (p − outcome)², lower is better, 0 is perfect, 0.25 is a coin flip.
 */
export type Outcome = 0 | 1;

function assertProbability(p: number): void {
  if (!Number.isFinite(p) || p < 0 || p > 1) throw new RangeError(`Probability must be between 0 and 1, got ${p}`);
}

export function brierScore(p: number, outcome: Outcome): number {
  assertProbability(p);
  return (p - outcome) ** 2;
}

export function meanBrier(forecasts: ReadonlyArray<{ p: number; outcome: Outcome }>): number | null {
  if (forecasts.length === 0) return null;
  return forecasts.reduce((sum, f) => sum + brierScore(f.p, f.outcome), 0) / forecasts.length;
}

/** Natural-log score, clamped so a 0% or 100% miss stays finite. Higher (closer to 0) is better. */
export function logScore(p: number, outcome: Outcome, epsilon = 1e-4): number {
  assertProbability(p);
  const q = Math.min(1 - epsilon, Math.max(epsilon, outcome === 1 ? p : 1 - p));
  return Math.log(q);
}

export type CalibrationBin = { lower: number; upper: number; meanForecast: number; observedRate: number; count: number };

/** Groups forecasts into equal-width bins and compares the average forecast with how often it happened. */
export function calibration(forecasts: ReadonlyArray<{ p: number; outcome: Outcome }>, bins = 10): CalibrationBin[] {
  const buckets = Array.from({ length: bins }, () => ({ sumP: 0, hits: 0, count: 0 }));
  for (const f of forecasts) {
    assertProbability(f.p);
    const i = Math.min(bins - 1, Math.floor(f.p * bins));
    const b = buckets[i]!;
    b.sumP += f.p;
    b.hits += f.outcome;
    b.count += 1;
  }
  return buckets.flatMap((b, i) =>
    b.count === 0 ? [] : [{ lower: i / bins, upper: (i + 1) / bins, meanForecast: b.sumP / b.count, observedRate: b.hits / b.count, count: b.count }],
  );
}

/** Whole-point gap between a user's call and the crowd, both 0–100. Positive = more confident in yes. */
export function gapToCrowd(userPercent: number, crowdPercent: number): number {
  return Math.round(userPercent) - Math.round(crowdPercent);
}
