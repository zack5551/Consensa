/**
 * Leaderboards rank accuracy, never points (LEX). One person, one forecast, weighted by skill, not wallet.
 *
 * Ranking uses a shrunk skill score so three lucky calls can't top the board:
 *   adjusted Brier = (Σ your Brier + k × crowd Brier) ÷ (n + k)
 * which pulls small records toward the crowd (skill 0) until they've earned their place.
 */
import { callBrier, crowdBrier, skillVsCrowd, streaks, type ScoredCall } from "./record";
import type { Region } from "./regions";

export type ForecasterRecord = {
  handle: string;
  displayName: string;
  region: Region;
  /** ISO date the forecaster joined. */
  joinedAt: string;
  calls: readonly ScoredCall[];
};

export type LeaderboardRow = {
  rank: number;
  handle: string;
  displayName: string;
  region: Region;
  count: number;
  brier: number;
  crowdBrier: number;
  /** Raw skill vs the crowd on the same questions. */
  skill: number | null;
  /** Shrunk skill used for ranking. */
  adjustedSkill: number;
  currentStreak: number;
};

export type RankOptions = {
  /** Minimum resolved calls to appear on the board. */
  minCalls?: number;
  /** Strength of the pull toward the crowd, in "virtual calls". */
  prior?: number;
  region?: Region;
};

export const DEFAULT_MIN_CALLS = 5;
export const DEFAULT_PRIOR = 5;

export function adjustedSkill(calls: readonly ScoredCall[], prior = DEFAULT_PRIOR): number {
  if (calls.length === 0) return 0;
  const n = calls.length;
  const user = calls.reduce((s, c) => s + callBrier(c), 0);
  const crowdMean = calls.reduce((s, c) => s + crowdBrier(c), 0) / n;
  if (crowdMean === 0) return 0;
  const adjusted = (user + prior * crowdMean) / (n + prior);
  return 1 - adjusted / crowdMean;
}

/**
 * Builds a ranked board. Ties share a rank (1, 2, 2, 4) and are listed by more calls, then handle,
 * so the order is stable across renders.
 */
export function rankForecasters(records: readonly ForecasterRecord[], options: RankOptions = {}): LeaderboardRow[] {
  const minCalls = options.minCalls ?? DEFAULT_MIN_CALLS;
  const prior = options.prior ?? DEFAULT_PRIOR;

  const rows = records
    .filter((r) => (options.region ? r.region === options.region : true) && r.calls.length >= minCalls)
    .map((r) => {
      const n = r.calls.length;
      const brier = r.calls.reduce((s, c) => s + callBrier(c), 0) / n;
      const crowd = r.calls.reduce((s, c) => s + crowdBrier(c), 0) / n;
      return {
        rank: 0,
        handle: r.handle,
        displayName: r.displayName,
        region: r.region,
        count: n,
        brier,
        crowdBrier: crowd,
        skill: skillVsCrowd(brier, crowd),
        adjustedSkill: adjustedSkill(r.calls, prior),
        currentStreak: streaks(r.calls).current,
      } satisfies LeaderboardRow;
    })
    .sort((a, b) => b.adjustedSkill - a.adjustedSkill || b.count - a.count || a.handle.localeCompare(b.handle));

  const EPS = 1e-12;
  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    row.rank = prev && Math.abs(prev.adjustedSkill - row.adjustedSkill) < EPS ? prev.rank : i + 1;
  });
  return rows;
}

/** Share of the board you're ahead of, 0–100, rounded down so "top 10%" is never generous. Null off the board. */
export function percentileOf(handle: string, rows: readonly LeaderboardRow[]): number | null {
  const row = rows.find((r) => r.handle === handle);
  if (!row || rows.length < 2) return null;
  const behind = rows.filter((r) => r.rank > row.rank).length;
  return Math.floor((behind / (rows.length - 1)) * 100);
}

const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * "Sharpest forecasters" line: a skill-weighted average in logit space, so a sharp 90% counts as
 * more certain than two 50%s average out to. Only forecasters with positive skill carry weight.
 * Inputs and output are whole percents. Null when nobody qualifies.
 */
export function skillWeightedConsensus(entries: ReadonlyArray<{ percent: number; skill: number }>): number | null {
  let sumW = 0;
  let sumX = 0;
  for (const e of entries) {
    if (!(e.skill > 0)) continue;
    const p = Math.min(99, Math.max(1, e.percent)) / 100;
    sumW += e.skill;
    sumX += e.skill * logit(p);
  }
  if (sumW === 0) return null;
  return Math.round(sigmoid(sumX / sumW) * 100);
}
