import { isPublishable } from "@/lib/regions";

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
