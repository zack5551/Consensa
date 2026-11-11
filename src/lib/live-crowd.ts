/**
 * The crowd from real saved calls. Framework-free and unit-tested.
 *
 * Privacy floor: a number is shown only when at least MIN_CROWD people are behind it. Below that, the question
 * keeps its sample numbers (the site says "Sample questions and numbers while we build"), so one person's call
 * can never be read off "Canada says".
 */
import { provinces, type Province, type Question } from "@/lib/question";

export const MIN_CROWD = 5;

/** One row from `crowd_summary`: a count and a sum of probabilities for a question, region and language. */
export type CrowdRow = { slug: string; region: string | null; locale: string | null; n: number; total: number };

export type LiveCrowd = {
  n: number;
  mean: number;
  /** Region and language averages, each only where at least MIN_CROWD people are behind it. */
  provinces?: Partial<Record<Province, number>>;
  languages?: { en?: number; fr?: number };
};

function isProvince(v: string | null): v is Province {
  return v !== null && (provinces as readonly string[]).includes(v);
}

function cells<K extends string>(rows: readonly CrowdRow[], key: (r: CrowdRow) => K | null): Partial<Record<K, number>> {
  const acc = new Map<K, { n: number; total: number }>();
  for (const r of rows) {
    const k = key(r);
    if (k === null) continue;
    const a = acc.get(k) ?? { n: 0, total: 0 };
    a.n += r.n;
    a.total += r.total;
    acc.set(k, a);
  }
  const out: Partial<Record<K, number>> = {};
  for (const [k, a] of acc) if (a.n >= MIN_CROWD) out[k] = Math.round(a.total / a.n);
  return out;
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
    out.set(slug, {
      n: a.n,
      mean: Math.round(a.total / a.n),
      provinces: cells(mine, (r) => (isProvince(r.region) ? r.region : null)),
      languages: cells(mine, (r) => (r.locale === "en" || r.locale === "fr" ? r.locale : null)),
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
