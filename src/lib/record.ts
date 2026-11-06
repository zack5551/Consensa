/**
 * A forecaster's accuracy record ("My record" / « Mon bilan »).
 * Pure functions over resolved calls. Probabilities arrive as whole percents (the UI unit) and are scored as 0–1.
 * Lower Brier is better. "Skill" compares a forecaster with the crowd on the same questions:
 * 1 − (your Brier ÷ crowd Brier). Positive means sharper than Canada, 0 means level, negative means behind.
 */
import { categories, type Category } from "./question";
import { brierScore, calibration, type CalibrationBin, type Outcome } from "./scoring";

export { categories, type Category };

/** One resolved call, joined with the crowd's final forecast on the same question. */
export type ScoredCall = {
  slug: string;
  category: Category;
  /** The forecaster's probability of yes, 1–99. */
  userPercent: number;
  /** Canada's crowd probability when the question closed, 1–99. */
  crowdPercent: number;
  outcome: Outcome;
  /** ISO date the official result was published. */
  resolvedAt: string;
};

export type Verdict = "calledIt" | "missed" | "tossUp";

/** "Called it!" means the call sat on the side that happened. Exactly 50% sits on neither side. */
export function verdict(userPercent: number, outcome: Outcome): Verdict {
  if (userPercent === 50) return "tossUp";
  return (userPercent > 50) === (outcome === 1) ? "calledIt" : "missed";
}

export function callBrier(c: Pick<ScoredCall, "userPercent" | "outcome">): number {
  return brierScore(c.userPercent / 100, c.outcome);
}

export function crowdBrier(c: Pick<ScoredCall, "crowdPercent" | "outcome">): number {
  return brierScore(c.crowdPercent / 100, c.outcome);
}

/** 1 − user ÷ crowd. Null when the crowd was perfect (no room to compare) or there's nothing to score. */
export function skillVsCrowd(userBrier: number | null, baseline: number | null): number | null {
  if (userBrier === null || baseline === null || baseline === 0) return null;
  return 1 - userBrier / baseline;
}

function byResolvedAt<T extends Pick<ScoredCall, "resolvedAt" | "slug">>(a: T, b: T): number {
  return a.resolvedAt === b.resolvedAt ? a.slug.localeCompare(b.slug) : a.resolvedAt.localeCompare(b.resolvedAt);
}

export type Streaks = { current: number; best: number };

/** Consecutive "Called it!" results, oldest to newest. A toss-up call neither extends nor breaks a streak. */
export function streaks(calls: readonly ScoredCall[]): Streaks {
  let current = 0;
  let best = 0;
  for (const c of [...calls].sort(byResolvedAt)) {
    const v = verdict(c.userPercent, c.outcome);
    if (v === "calledIt") {
      current += 1;
      best = Math.max(best, current);
    } else if (v === "missed") {
      current = 0;
    }
  }
  return { current, best };
}

export type TrendPoint = { resolvedAt: string; user: number; crowd: number };

/** Running mean Brier after each resolved call, for the user and for the crowd on the same questions. */
export function brierTrend(calls: readonly ScoredCall[]): TrendPoint[] {
  let sumUser = 0;
  let sumCrowd = 0;
  return [...calls].sort(byResolvedAt).map((c, i) => {
    sumUser += callBrier(c);
    sumCrowd += crowdBrier(c);
    return { resolvedAt: c.resolvedAt, user: sumUser / (i + 1), crowd: sumCrowd / (i + 1) };
  });
}

export type CategoryLine = { category: Category; count: number; brier: number; crowdBrier: number; skill: number | null };

export function byCategory(calls: readonly ScoredCall[]): CategoryLine[] {
  return categories.flatMap((category) => {
    const subset = calls.filter((c) => c.category === category);
    if (subset.length === 0) return [];
    const brier = subset.reduce((s, c) => s + callBrier(c), 0) / subset.length;
    const crowd = subset.reduce((s, c) => s + crowdBrier(c), 0) / subset.length;
    return [{ category, count: subset.length, brier, crowdBrier: crowd, skill: skillVsCrowd(brier, crowd) }];
  });
}

export type RecordSummary = {
  count: number;
  brier: number | null;
  crowdBrier: number | null;
  skill: number | null;
  calledIt: number;
  missed: number;
  /** Share of decided calls (not toss-ups) on the right side. Null with no decided calls. */
  hitRate: number | null;
  streaks: Streaks;
  /** The call that beat the crowd by the most, if any beat it at all. */
  bestCall: (ScoredCall & { edge: number }) | null;
  calibration: CalibrationBin[];
  categories: CategoryLine[];
  trend: TrendPoint[];
  /** Newest first. */
  recent: Array<ScoredCall & { verdict: Verdict; brier: number }>;
};

export function summarizeRecord(calls: readonly ScoredCall[], calibrationBins = 5): RecordSummary {
  const count = calls.length;
  const userSum = calls.reduce((s, c) => s + callBrier(c), 0);
  const crowdSum = calls.reduce((s, c) => s + crowdBrier(c), 0);
  const brier = count ? userSum / count : null;
  const crowd = count ? crowdSum / count : null;

  let calledIt = 0;
  let missed = 0;
  let bestCall: RecordSummary["bestCall"] = null;
  for (const c of calls) {
    const v = verdict(c.userPercent, c.outcome);
    if (v === "calledIt") calledIt += 1;
    if (v === "missed") missed += 1;
    const edge = crowdBrier(c) - callBrier(c);
    if (edge > 0 && (bestCall === null || edge > bestCall.edge)) bestCall = { ...c, edge };
  }

  return {
    count,
    brier,
    crowdBrier: crowd,
    skill: skillVsCrowd(brier, crowd),
    calledIt,
    missed,
    hitRate: calledIt + missed ? calledIt / (calledIt + missed) : null,
    streaks: streaks(calls),
    bestCall,
    calibration: calibration(
      calls.map((c) => ({ p: c.userPercent / 100, outcome: c.outcome })),
      calibrationBins,
    ),
    categories: byCategory(calls),
    trend: brierTrend(calls),
    recent: [...calls]
      .sort(byResolvedAt)
      .reverse()
      .map((c) => ({ ...c, verdict: verdict(c.userPercent, c.outcome), brier: callBrier(c) })),
  };
}

/**
 * Calibration error: the forecast-weighted average gap between what you said and what happened, 0–1.
 * 0 means every bin's average forecast matched its hit rate. Shown as "off by N points".
 */
export function calibrationError(bins: readonly CalibrationBin[]): number | null {
  const total = bins.reduce((s, b) => s + b.count, 0);
  if (total === 0) return null;
  return bins.reduce((s, b) => s + b.count * Math.abs(b.meanForecast - b.observedRate), 0) / total;
}

export type Lean = "underconfident" | "overconfident" | "calibrated";

/**
 * Which way your calibration leans. For calls above 50%, it's how much more often than you said it happened;
 * for calls below 50%, how much less often. Positive = you could have said more (underconfident).
 * Needs at least `minCalls` calls before it says anything.
 */
export function confidenceLean(bins: readonly CalibrationBin[], tolerance = 0.05, minCalls = 8): { lean: Lean; points: number } | null {
  const total = bins.reduce((s, b) => s + b.count, 0);
  if (total < minCalls) return null;
  const signed =
    bins.reduce((s, b) => {
      const gap = b.meanForecast >= 0.5 ? b.observedRate - b.meanForecast : b.meanForecast - b.observedRate;
      return s + b.count * gap;
    }, 0) / total;
  const points = Math.round(Math.abs(signed) * 100);
  if (signed > tolerance) return { lean: "underconfident", points };
  if (signed < -tolerance) return { lean: "overconfident", points };
  return { lean: "calibrated", points };
}
