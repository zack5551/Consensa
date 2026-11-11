/**
 * Automatic results for the site's hand-written questions. Each entry ties a question (by slug) to the free official
 * data that settles it, using the same resolvers and two-read rule as engine-drafted questions. Every cycle reads the
 * questions that are due; a confirmed result is saved to `engine_resolutions`, and the next build applies it to the
 * question (scripts/pull-live-questions.mjs → src/content/live-results.json), so it shows in the public results log.
 *
 * Only questions whose rule matches one reading exactly are listed. Anything needing judgment stays with an editor.
 */
import type { DueQuestion } from "@/engine/resolve/due";
import type { Resolver } from "@/engine/types";

/** Statistics Canada vector: unemployment rate, Canada, 15 years and over, seasonally adjusted (table 14-10-0287). */
export const LFS_UNEMPLOYMENT_VECTOR = 2062815;

export const siteResolvers: Readonly<Record<string, Resolver>> = {
  // Bank of Canada: the overnight target before and after each scheduled decision (Valet series V39079). Add the
  // January 2027 question once the Bank publishes its 2027 schedule, so the decision date is confirmed.
  "boc-hold-oct-2026": { kind: "boc-policy-rate", decisionDate: "2026-10-28", direction: "hold" },
  "boc-cut-oct-2026": { kind: "boc-policy-rate", decisionDate: "2026-10-28", direction: "cut" },
  "boc-cut-dec-2026": { kind: "boc-policy-rate", decisionDate: "2026-12-09", direction: "cut" },
  // Statistics Canada Labour Force Survey.
  "jobs-rate-oct-2026": { kind: "statcan-vector", vectorId: LFS_UNEMPLOYMENT_VECTOR, refPeriod: "2026-10", comparator: ">=", threshold: 7, unit: "%" },
};

/** The site questions with an automatic result, in the shape the resolve step takes. */
export function siteDueQuestions(questions: ReadonlyArray<{ slug: string; resolution: { resolvesAt: string } }>): DueQuestion[] {
  return questions.flatMap((q) => {
    const resolver = siteResolvers[q.slug];
    return resolver ? [{ slug: q.slug, resolver, resolvesAt: q.resolution.resolvesAt }] : [];
  });
}
