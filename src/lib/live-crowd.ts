/**
 * The crowd from real saved calls. Framework-free and unit-tested.
 *
 * Privacy floor: a number is shown only when at least MIN_CROWD people are behind it. Below that, the question
 * keeps its sample numbers (the site says "Sample questions and numbers while we build"), so one person's call
 * can never be read off "Canada says".
 */
import { z } from "zod";
import { provinces, type Province, type Question } from "@/lib/question";

export const MIN_CROWD = 5;

/**
 * The region row's call count is coarser than the averages (AEGIS hold on #111). With an exact count beside a
 * small region's average, the change from one visit to the next gives away the call that was just made:
 * (n + 1) × new average − n × old average. So a count is published only from REGION_COUNT_MIN calls, rounded down
 * to a multiple of REGION_COUNT_STEP. From 50 calls up, the average is rounded to a whole percent, which alone
 * blurs any one call by ±25 points or more, and the count moves only once every 10 calls.
 */
export const REGION_COUNT_MIN = 50;
export const REGION_COUNT_STEP = 10;

/** The count the region row may show for `n` calls, or null below REGION_COUNT_MIN. */
export function publishedRegionCount(n: number): number | null {
  if (!Number.isInteger(n) || n < REGION_COUNT_MIN) return null;
  return Math.floor(n / REGION_COUNT_STEP) * REGION_COUNT_STEP;
}

/** One row from `crowd_summary`: a count and a sum of probabilities for a question, region and language. */
export type CrowdRow = { slug: string; region: string | null; locale: string | null; n: number; total: number };

/** Postgres returns bigint as a string through the API, so counts and sums are coerced, then checked. */
const crowdRowSchema = z.object({
  slug: z.string(),
  region: z.string().nullable(),
  locale: z.string().nullable(),
  n: z.coerce.number().int().nonnegative(),
  total: z.coerce.number().int().nonnegative(),
});

/** The rows from `crowd_summary`, validated. A malformed row is dropped rather than trusted. */
export function parseCrowdRows(data: unknown): CrowdRow[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((row) => {
    const parsed = crowdRowSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

export type LiveCrowd = {
  n: number;
  mean: number;
  /** Region and language averages, each only where at least MIN_CROWD people are behind it. */
  provinces?: Partial<Record<Province, number>>;
  /**
   * How many calls each shown region average is built from. Server-side only: it never goes onto the question, and
   * a visitor gets just their own region's count (see `regionCallCount`). Left out entirely when the calls outside
   * the shown regions (hidden regions plus calls with no region) number 1 to MIN_CROWD − 1, because Canada's total
   * minus the shown counts would then single those few people out.
   */
  provinceCounts?: Partial<Record<Province, number>>;
  languages?: { en?: number; fr?: number };
};

function isProvince(v: string | null): v is Province {
  return v !== null && (provinces as readonly string[]).includes(v);
}

/** Each cell's count and average, only where at least MIN_CROWD people are behind it. */
function cells<K extends string>(rows: readonly CrowdRow[], key: (r: CrowdRow) => K | null): Partial<Record<K, { n: number; mean: number }>> {
  const acc = new Map<K, { n: number; total: number }>();
  for (const r of rows) {
    const k = key(r);
    if (k === null) continue;
    const a = acc.get(k) ?? { n: 0, total: 0 };
    a.n += r.n;
    a.total += r.total;
    acc.set(k, a);
  }
  const out: Partial<Record<K, { n: number; mean: number }>> = {};
  for (const [k, a] of acc) if (a.n >= MIN_CROWD) out[k] = { n: a.n, mean: Math.round(a.total / a.n) };
  return out;
}

function pick<K extends string>(c: Partial<Record<K, { n: number; mean: number }>>, field: "n" | "mean"): Partial<Record<K, number>> {
  const entries = Object.entries(c) as [K, { n: number; mean: number }][];
  return Object.fromEntries(entries.map(([k, v]) => [k, v[field]])) as Partial<Record<K, number>>;
}

/** Every person counts once (one row per person per question in `calls`), so the mean is a plain average. */
export function summarize(rows: readonly CrowdRow[]): Map<string, LiveCrowd> {
  const acc = new Map<string, { n: number; total: number }>();
  for (const r of rows) {
    const a = acc.get(r.slug) ?? { n: 0, total: 0 };
    a.n += r.n;
    a.total += r.total;
    acc.set(r.slug, a);
  }
  const out = new Map<string, LiveCrowd>();
  for (const [slug, a] of acc) {
    if (a.n < MIN_CROWD) continue;
    const mine = rows.filter((r) => r.slug === slug);
    const regionCells = cells(mine, (r) => (isProvince(r.region) ? r.region : null));
    const counts = pick(regionCells, "n");
    // Complementary suppression: the remainder is everyone not in a shown region, and it is derivable from the total.
    const remainder = a.n - Object.values(counts).reduce((sum, n) => sum + n, 0);
    const countsSafe = remainder === 0 || remainder >= MIN_CROWD;
    out.set(slug, {
      n: a.n,
      mean: Math.round(a.total / a.n),
      provinces: pick(regionCells, "mean"),
      ...(countsSafe ? { provinceCounts: counts } : {}),
      languages: pick(cells(mine, (r) => (r.locale === "en" || r.locale === "fr" ? r.locale : null)), "mean"),
    });
  }
  return out;
}

/**
 * The question with Canada's number, forecaster count and splits from real calls, never mixed with sample numbers.
 * The history becomes a flat line at today's real number; it fills in as daily history is kept. A region with
 * fewer than MIN_CROWD calls is hidden (its tile reads "—"), and the language split shows only when both
 * languages reach the floor.
 */
export function applyLive<T extends Question>(q: T, live: LiveCrowd | undefined): T {
  if (!live) return q;
  const real = live.provinces ?? {};
  const shown = Object.fromEntries(provinces.map((p) => [p, real[p] ?? live.mean])) as Record<Province, number>;
  const hiddenProvinces = provinces.filter((p) => real[p] === undefined);
  const en = live.languages?.en;
  const fr = live.languages?.fr;
  return {
    ...q,
    forecasters: live.n,
    history: [live.mean, live.mean],
    provinces: shown,
    hiddenProvinces,
    languages: en !== undefined && fr !== undefined ? { en, fr } : undefined,
  };
}

/**
 * One region's call count for the call panel, rounded down to 10s, or null when it isn't published: under
 * REGION_COUNT_MIN calls, a hidden region, or complementary suppression.
 */
export function regionCallCount(live: LiveCrowd | undefined, region: Province): number | null {
  const n = live?.provinceCounts?.[region];
  return n === undefined ? null : publishedRegionCount(n);
}
