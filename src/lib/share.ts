import type { Side } from "@/lib/call-side";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { questionState, type Category, type Question } from "@/lib/question";
import { isPublishable } from "@/lib/regions";

const sides = ["yes", "no"] as const satisfies readonly Side[];

/**
 * Whether a "Called it!" card exists for this question and side: only on a scored question (an unscored poll has no
 * right side to call), only once the official result is in and not under review, and only for the side that happened.
 * The card and its page are built from the question and the side alone, so there is never anything about a person to
 * check, store or show.
 * LEX: a cancelled or voided question gets no card. A cancelled game is its own state and outcome, and the outcome is
 * also checked against yes and no explicitly, so any other outcome added later gets no card and no page by default.
 */
export function hasCalledItCard(question: Question, side: string, now: Date): side is Side {
  const outcome: string | undefined = question.resolution.result?.outcome;
  return question.scored && questionState(question, now) === "resolved" && isSide(outcome) && outcome === side;
}

function isSide(value: string | undefined): value is Side {
  return (sides as readonly (string | undefined)[]).includes(value);
}

/**
 * The legal lines under a "Called it!" card (LEX): the free/no-prize/no-value line on every card, and on a sports
 * question the fan-forecast line and the non-affiliation line too.
 */
export function calledItFooter(t: Pick<Dictionary, "share" | "legal">, category: Category): { footer: string; sports: readonly string[] } {
  return { footer: t.share.calledItFooter, sports: category === "sports" ? [t.share.calledItSports, t.legal.sportsFooter] : [] };
}

/** Every "Called it!" card that exists right now: one per resolved question, for the side that happened. */
export function calledItCards(questions: readonly Question[], now: Date): { slug: string; side: Side }[] {
  return questions.flatMap((q) => sides.filter((side) => hasCalledItCard(q, side, now)).map((side) => ({ slug: q.slug, side })));
}

/**
 * The crowd number a share card may show: only a real one, from at least 5 calls (the same floor as every other
 * published number). Otherwise null, and the card says "Make your call". A card travels without the site's
 * "sample numbers" notice, so a sample number never goes on one. Pass the question after live numbers are applied:
 * `hiddenProvinces` is set only by applyLive, which is how a real crowd is told from a sample one.
 */
export function crowdForCard(question: { forecasters: number; hiddenProvinces?: readonly unknown[] }, crowd: number): number | null {
  return question.hiddenProvinces !== undefined && isPublishable(question.forecasters) ? crowd : null;
}

/** Text the share card can draw: lives in card-text.ts so the question schema can use it without an import cycle. */
export { cardSafe } from "@/lib/card-text";
