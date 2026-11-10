/**
 * Turns a published queue item into the site's question shape, so the build can show it next to the samples.
 *
 * The crowd fields start empty: no forecasters and a flat 50% line. Real crowd numbers need calls stored on the
 * server (accounts, M2), which is why showing live questions on the site is a separate switch
 * (`CONSENSA_LIVE_QUESTIONS=1`, read by scripts/pull-live-questions.mjs) that stays off until then.
 */
import { toResult } from "@/engine/resolve/policy";
import type { QueueItem, ResolutionRecord } from "@/engine/types";
import { provinces, questionSchema, type Province, type Question } from "@/lib/question";

const EVEN = 50;

export function toSiteQuestion(item: QueueItem, record?: ResolutionRecord): Question {
  const { draft } = item;
  const result = record ? toResult(record) : null;
  return questionSchema.parse({
    slug: draft.slug,
    category: draft.category,
    question: draft.question,
    scored: draft.scored,
    closesAt: draft.closesAt,
    forecasters: 0,
    history: [EVEN, EVEN],
    provinces: Object.fromEntries(provinces.map((p) => [p, EVEN])) as Record<Province, number>,
    events: [],
    resolution: { ...draft.resolution, ...(result ? { result } : {}) },
  });
}
