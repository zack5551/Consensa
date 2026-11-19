/**
 * A call is stored as a whole-percent probability of YES, from 1 to 99. The panel asks it the way a poll does:
 * tap a side, then say how sure you are (50 = toss-up, 99 = certain). These functions map between the two, so
 * scoring, the leaderboard, the API and every stored call keep the same 1–99 number.
 */
export type Side = "yes" | "no";

export const SURE_MIN = 50;
export const SURE_MAX = 99;
export const SURE_DEFAULT = 75;

function clampSure(sure: number): number {
  if (!Number.isFinite(sure)) return SURE_DEFAULT;
  return Math.min(SURE_MAX, Math.max(SURE_MIN, Math.round(sure)));
}

/** Yes at 80% sure is 80. No at 80% sure is 20. */
export function toProbability(side: Side, sure: number): number {
  const s = clampSure(sure);
  return side === "yes" ? s : 100 - s;
}

/** Any stored call, read back as a side and how sure. 50 and up is yes; 30 is "no, 70% sure". */
export function fromProbability(probability: number): { side: Side; sure: number } {
  const p = Math.round(probability);
  return p >= 50 ? { side: "yes", sure: clampSure(p) } : { side: "no", sure: clampSure(100 - p) };
}

/** The crowd's share on one side, from Canada's yes number (0–100). */
export function crowdOnSide(side: Side, crowdYes: number): number {
  const yes = Math.round(crowdYes);
  return side === "yes" ? yes : 100 - yes;
}

/** True when the crowd leans to the other answer than yours. A crowd at exactly 50 leans neither way. */
export function crowdLeansOtherWay(side: Side, crowdYes: number): boolean {
  const yes = Math.round(crowdYes);
  return yes !== 50 && (yes > 50 ? "yes" : "no") !== side;
}

/** Whole points between how sure you are of your side and the crowd's share on that side. Positive = more sure than the crowd. */
export function sureGap(side: Side, sure: number, crowdYes: number): number {
  return clampSure(sure) - crowdOnSide(side, crowdYes);
}
