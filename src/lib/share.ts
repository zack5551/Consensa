import { questionState, type Question } from "@/lib/question";
import { isPublishable } from "@/lib/regions";

export const callSides = ["yes", "no"] as const;
export type CallSide = (typeof callSides)[number];

export function isCallSide(value: string): value is CallSide {
  return (callSides as readonly string[]).includes(value);
}

/**
 * Whether a "Called it!" card exists for this question and side: only once the official result is in and not under
 * review, and only for the side that happened. The card and its page are built from the question and the side alone,
 * so there is never anything about a person to check, store or show.
 */
export function hasCalledItCard(question: Question, side: string, now: Date): side is CallSide {
  return questionState(question, now) === "resolved" && question.resolution.result?.outcome === side;
}

/** Every "Called it!" card that exists right now: one per resolved question, for the side that happened. */
export function calledItCards(questions: readonly Question[], now: Date): { slug: string; side: CallSide }[] {
  return questions.flatMap((q) => callSides.filter((side) => hasCalledItCard(q, side, now)).map((side) => ({ slug: q.slug, side })));
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

/** Every character all three card fonts in brand/fonts/ttf can draw (read from their character maps). */
const notInCardFonts =
  /[^\u0020-\u007E\u00A0-\u00AC\u00AE-\u00FF\u0131\u0152\u0153\u02C6\u02DA\u02DC\u2013\u2014\u2018-\u201A\u201C-\u201E\u2022\u2026\u2039\u203A\u2044\u2074\u20AC\u2122\u2191\u2193\u2212]/g;

/**
 * Text the share card can draw with the brand fonts alone. The image renderer fetches a fallback font from an outside
 * font service for any character its fonts lack, and CLAUDE.md rule 7 allows no such call. So narrow and thin spaces
 * and odd hyphens become their plain forms, and anything else the fonts lack is dropped.
 * tests/unit/social.test.ts checks that no sample question or card label loses a character here.
 */
export function cardSafe(text: string): string {
  return text
    .replace(/\u202F/g, "\u00A0")
    .replace(/[\u2002-\u200A]/g, " ")
    .replace(/[\u2010\u2011]/g, "-")
    .replace(notInCardFonts, "");
}
