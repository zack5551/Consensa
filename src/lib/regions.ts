/**
 * Province views. Consensa reports six regions (BC, Alberta, the Prairies, Ontario, Quebec, Atlantic),
 * the same set the question schema uses. Everything here works on aggregates only, and any cell built
 * from fewer than MIN_CELL forecasters is suppressed (LEX: aggregates only, minimum cell size).
 */
import { provinces, type Province } from "./question";
import { brierScore, type Outcome } from "./scoring";

export type Region = Province;
export const regions = provinces;

/** Fewest forecasters behind any number we publish for a region. */
export const MIN_CELL = 5;

/** URL slugs, the same in both languages so a shared link works for everyone. */
const slugs = { BC: "bc", AB: "alberta", PR: "prairies", ON: "ontario", QC: "quebec", AT: "atlantic" } as const satisfies Record<Region, string>;
export type RegionSlug = (typeof slugs)[Region];

export function regionSlug(region: Region): RegionSlug {
  return slugs[region];
}

export function regionFromSlug(slug: string): Region | undefined {
  return regions.find((r) => slugs[r] === slug);
}

export const regionSlugs: readonly RegionSlug[] = regions.map((r) => slugs[r]);

export function isPublishable(count: number): boolean {
  return Number.isInteger(count) && count >= MIN_CELL;
}

type SplitQuestion = { slug: string; provinces: Record<Region, number>; national: number };

export type RegionGap = { slug: string; region: number; national: number; gap: number };

/** How far a region sits from Canada on each question, biggest gaps first. Positive = more likely yes. */
export function regionGaps(questions: readonly SplitQuestion[], region: Region): RegionGap[] {
  return questions
    .map((q) => ({ slug: q.slug, region: q.provinces[region], national: q.national, gap: Math.round(q.provinces[region]) - Math.round(q.national) }))
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap) || a.slug.localeCompare(b.slug));
}

/** Mean absolute distance from Canada, in points. Small = a bellwether. Null with no questions. */
export function meanDistance(questions: readonly SplitQuestion[], region: Region): number | null {
  if (questions.length === 0) return null;
  return questions.reduce((s, q) => s + Math.abs(q.provinces[region] - q.national), 0) / questions.length;
}

/** The region closest to Canada across a set of questions. Ties go to the earlier region in the west-to-east order. */
export function bellwether(questions: readonly SplitQuestion[]): { region: Region; distance: number } | null {
  let best: { region: Region; distance: number } | null = null;
  for (const r of regions) {
    const d = meanDistance(questions, r);
    if (d !== null && (best === null || d < best.distance)) best = { region: r, distance: d };
  }
  return best;
}

type ResolvedSplit = {
  outcome: Outcome;
  /** Each region's final crowd percent and how many forecasters it came from. */
  regions: Record<Region, { percent: number; forecasters: number }>;
};

export type RegionAccuracy = { region: Region; brier: number; questions: number; rank: number };

/**
 * Which region's crowd called it best: mean Brier of each region's final forecast across resolved questions.
 * A question only counts for a region when that region's cell is publishable. Regions with no counted
 * questions are left out. Lower Brier ranks higher; ties share a rank.
 */
export function regionalAccuracy(resolved: readonly ResolvedSplit[]): RegionAccuracy[] {
  const rows = regions.flatMap((region) => {
    const counted = resolved.filter((q) => isPublishable(q.regions[region].forecasters));
    if (counted.length === 0) return [];
    const brier = counted.reduce((s, q) => s + brierScore(q.regions[region].percent / 100, q.outcome), 0) / counted.length;
    return [{ region, brier, questions: counted.length, rank: 0 }];
  });
  rows.sort((a, b) => a.brier - b.brier || regions.indexOf(a.region) - regions.indexOf(b.region));
  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    row.rank = prev && Math.abs(prev.brier - row.brier) < 1e-12 ? prev.rank : i + 1;
  });
  return rows;
}
