/**
 * The crowd from real saved calls. Framework-free and unit-tested.
 *
 * Privacy floor: a number is shown only when at least MIN_CROWD people are behind it. Below that, the question
 * keeps its sample numbers (the site says "Sample questions and numbers while we build"), so one person's call
 * can never be read off "Canada says".
 */
import type { Question } from "@/lib/question";

export const MIN_CROWD = 5;

/** One row from `crowd_summary`: a count and a sum of probabilities for a question, region and language. */
export type CrowdRow = { slug: string; region: string | null; locale: string | null; n: number; total: number };

export type LiveCrowd = { n: number; mean: number };

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
  for (const [slug, a] of acc) if (a.n >= MIN_CROWD) out.set(slug, { n: a.n, mean: Math.round(a.total / a.n) });
  return out;
}

/**
 * The question with Canada's number and forecaster count from real calls. The history becomes a flat line at
 * today's real number rather than mixing real and sample points; it fills in as daily history is kept.
 */
export function applyLive<T extends Question>(q: T, live: LiveCrowd | undefined): T {
  if (!live) return q;
  return { ...q, forecasters: live.n, history: [live.mean, live.mean] };
}
