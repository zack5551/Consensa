/**
 * Is this draft a question we already have (live, queued or recently rejected)?
 *
 * Two tests, either one is enough:
 * 1. Same resolver target. Two questions that settle on the same data point (the same StatCan vector and month,
 *    the same Bank of Canada decision) are the same question, however they're worded. Opposite directions of the
 *    same decision ("cut?" vs "hold?") also count: one question per decision keeps the slate clean.
 * 2. Same wording. Token overlap on the EN and FR text, taking the higher of the two.
 */
import { storyTokens } from "@/engine/stories";
import { jaccard } from "@/engine/text";
import type { Draft, Flag, Resolver } from "@/engine/types";

/** Above this the wording is a near-duplicate. Tuned on the sample slate: rewordings land 0.6–0.9, neighbours under 0.4. */
export const DUPLICATE_SIMILARITY = 0.55;

/** What two questions settle on. Null for manual resolvers, which compare on wording only. */
export function resolverKey(r: Resolver): string | null {
  switch (r.kind) {
    case "boc-policy-rate":
      return `boc:${r.decisionDate}`;
    case "statcan-vector":
      return `statcan:${r.vectorId}:${r.refPeriod}`;
    case "eccc-daily-climate":
      return `eccc:${r.climateId}:${r.element}:${r.from}:${r.to}`;
    case "manual":
      return null;
  }
}

export interface Comparable {
  slug: string;
  question: { en: string; fr: string };
  resolver?: Resolver;
}

export function similarity(a: Comparable, b: Comparable): number {
  return Math.max(
    jaccard(storyTokens(a.question.en), storyTokens(b.question.en)),
    jaccard(storyTokens(a.question.fr), storyTokens(b.question.fr)),
  );
}

export function findDuplicate(draft: Draft, existing: readonly Comparable[]): { of: string; reason: string } | null {
  const key = resolverKey(draft.resolver);
  for (const other of existing) {
    if (other.slug === draft.slug) return { of: other.slug, reason: "same slug" };
    if (key && other.resolver && resolverKey(other.resolver) === key) return { of: other.slug, reason: "settles on the same data" };
  }
  let best: { of: string; score: number } | null = null;
  for (const other of existing) {
    const score = similarity(draft, other);
    if (score >= DUPLICATE_SIMILARITY && (!best || score > best.score)) best = { of: other.slug, score };
  }
  return best ? { of: best.of, reason: `wording ${Math.round(best.score * 100)}% similar` } : null;
}

export function duplicateFlag(dup: { of: string; reason: string }): Flag {
  return { code: "duplicate", severity: "block", detail: `Duplicate of ${dup.of} (${dup.reason}).` };
}
