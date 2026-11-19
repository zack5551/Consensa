import { z } from "zod";
import { askedBySchema } from "@/lib/asked-by";
import { socialPollSchema } from "@/lib/social";
import { socialPostSchema } from "@/lib/social-voting/types";

export const provinces = ["BC", "AB", "PR", "ON", "QC", "AT"] as const;
export const categories = ["economy", "weather", "housing", "culture", "science", "sports"] as const;
export type Category = (typeof categories)[number];
export type Province = (typeof provinces)[number];

const bilingual = z.object({ en: z.string().min(1), fr: z.string().min(1) });
const percent = z.number().min(0).max(100);

/** How a question can end. `cancelled`: the event never took place (a game called off or postponed), so nobody is scored. */
export const outcomes = ["yes", "no", "cancelled"] as const;
export type QuestionOutcome = (typeof outcomes)[number];

/** The leagues a game can name. Each has an EN and FR name in the dictionary (`question.leagues`), checked by a test. */
export const leagues = ["NHL", "CFL", "MLS", "CPL", "NBA", "MLB", "PWHL"] as const;
export type League = (typeof leagues)[number];

/** One game, as text only (LEX: names describe facts; no logos, jerseys or photos). `startsAt` is the scheduled start. */
export const gameSchema = z.object({ league: z.enum(leagues), home: z.string().min(1), away: z.string().min(1), startsAt: z.iso.datetime() }).strict();
export type Game = z.infer<typeof gameSchema>;

export const questionSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  category: z.enum(categories),
  question: bilingual,
  scored: z.boolean(),
  closesAt: z.iso.datetime(),
  /** When the game or event starts. Required for sports, which are pre-game only: calls close at the earlier of this and `closesAt`. */
  startsAt: z.iso.datetime().optional(),
  /** Sports only: the one game this question is about. Its start counts as `startsAt`. */
  game: gameSchema.optional(),
  forecasters: z.number().int().nonnegative(),
  /** Daily crowd probability (percent), oldest first. The last value is "now". */
  history: z.array(percent).min(2),
  provinces: z.record(z.enum(provinces), percent),
  /** The crowd's chance among calls made in English vs French: one crowd, two languages. */
  languages: z.object({ en: percent, fr: percent }).optional(),
  /** Regions with too few real calls to show (privacy floor). Their tiles read "—" and the summary skips them. */
  hiddenProvinces: z.array(z.enum(provinces)).optional(),
  /**
   * Our own official posts for this question (sprint 11). Only posts listed here are ever read for replies, and only
   * while SOCIAL_VOTING is on.
   */
  socialPosts: z.array(socialPostSchema).optional(),
  /**
   * A guest or brand question's "Asked by" / "Sponsored by" label (LEX). Shown on the page, the embed, the share card
   * and the share post. No shipped question has one yet.
   */
  askedBy: askedBySchema.optional(),
  /** A political question is never included in sponsor numbers. */
  political: z.boolean().optional(),
  events: z.array(z.object({ dayIndex: z.number().int().nonnegative(), label: bilingual })).default([]),
  why: z
    .object({ body: bilingual, sources: z.array(bilingual).min(1) })
    .optional(),
  /** Hand-entered native poll totals from official Cansensa posts. Shown apart from the crowd, never mixed into it. */
  socialPolls: z.array(socialPollSchema).optional(),
  resolution: z.object({
    /** `url` is the source's English page. `urlFr` is the same page in French, when the publisher has one; /fr links to it. */
    source: z.object({ name: bilingual, url: z.url(), urlFr: z.url().optional() }),
    rule: bilingual,
    resolvesAt: z.iso.datetime(),
    /** Set once the official source has published. `disputed` means the result is under review. */
    result: z
      .object({ outcome: z.enum(outcomes), publishedAt: z.iso.datetime(), disputed: z.boolean().default(false) })
      .optional(),
  }),
})
  .refine((q) => q.category !== "sports" || eventStart(q) !== undefined, { path: ["startsAt"], message: "Sports questions need startsAt." })
  .refine((q) => q.game === undefined || q.category === "sports", { path: ["game"], message: "Only sports questions have a game." })
  .refine((q) => q.game === undefined || q.startsAt === undefined || Date.parse(q.startsAt) === Date.parse(q.game.startsAt), { path: ["game", "startsAt"], message: "startsAt and game.startsAt must match." })
  // LEX: no political sponsors, so a political question can never carry a sponsor.
  .refine((q) => q.askedBy?.kind !== "sponsor" || q.political !== true, { path: ["askedBy"], message: "A political question cannot be sponsored." });

export type Question = z.infer<typeof questionSchema>;

/** When the game or event starts: the game's start when the question names one, otherwise `startsAt`. */
export function eventStart(q: { startsAt?: string; game?: { startsAt: string } }): string | undefined {
  return q.game?.startsAt ?? q.startsAt;
}

/** When calls stop: the close date, or the event start for sports if that comes first. Never after the start of a game. */
export function callsCloseAt(q: Pick<Question, "closesAt" | "startsAt" | "category" | "game">): string {
  const start = eventStart(q);
  return q.category === "sports" && start !== undefined && Date.parse(start) < Date.parse(q.closesAt) ? start : q.closesAt;
}

/** True once the game or event has started (`start` from `eventStart`): from then on, no new call is offered. */
export function hasStarted(start: string | undefined, now: Date): boolean {
  return start !== undefined && Date.parse(start) <= now.getTime();
}

export function crowdNow(q: Question): number {
  return q.history[q.history.length - 1] ?? 0;
}

export const questionStates = ["open", "closingSoon", "closed", "resolved", "disputed", "cancelled"] as const;
export type QuestionState = (typeof questionStates)[number];

/** Questions closing within this window show the "closing soon" state. */
export const CLOSING_SOON_MS = 72 * 60 * 60 * 1000;

/**
 * Where a question is in its life: open → closing soon → closed (waiting for the official result) → resolved.
 * A published result that's under review is "disputed" and isn't scored until the review ends.
 * "cancelled" is the other ending: the event never took place, so there is no answer and nobody is scored.
 */
export function questionState(q: Question, now: Date): QuestionState {
  const result = q.resolution.result;
  if (result) return result.disputed ? "disputed" : result.outcome === "cancelled" ? "cancelled" : "resolved";
  const msLeft = Date.parse(callsCloseAt(q)) - now.getTime();
  if (msLeft <= 0) return "closed";
  if (msLeft <= CLOSING_SOON_MS) return "closingSoon";
  return "open";
}

/**
 * The score badge a question carries: "scored" (counts toward your record), "poll" (never scored), or "notScored"
 * once the question is cancelled, because a cancelled question scores nobody whatever `scored` says (LEX).
 */
export function scoreBadge(q: Pick<Question, "scored" | "resolution">): "scored" | "poll" | "notScored" {
  if (q.resolution.result?.outcome === "cancelled") return "notScored";
  return q.scored ? "scored" : "poll";
}

/** The official source's link for a reader: the French page on /fr when there is one, the English page otherwise. */
export function sourceUrl(source: { url: string; urlFr?: string }, locale: "en" | "fr"): string {
  return locale === "fr" && source.urlFr ? source.urlFr : source.url;
}

export function isOpen(state: QuestionState): boolean {
  return state === "open" || state === "closingSoon";
}

/**
 * The heading over a question's resolution rule, in the tense its state calls for: "How this resolves" until a result is
 * published (a result under review still may change), "How it was resolved" after, "How it would have resolved" when cancelled.
 */
export function resolutionTitle(state: QuestionState, labels: { title: string; titleResolved: string; titleCancelled: string }): string {
  return state === "resolved" ? labels.titleResolved : state === "cancelled" ? labels.titleCancelled : labels.title;
}

/** Highest and lowest regions, for the province split's text summary. */
/** Highest and lowest region among those shown. Null when fewer than two regions can be shown. */
export function provinceExtremes(values: Record<Province, number>, hidden: readonly Province[] = []): { high: Province; low: Province } | null {
  const sorted = provinces.filter((p) => !hidden.includes(p)).sort((a, b) => values[b] - values[a]);
  const high = sorted[0];
  const low = sorted[sorted.length - 1];
  return high !== undefined && low !== undefined && high !== low ? { high, low } : null;
}

/** Whole-point change in the crowd's chance over the last `days` days. */
export function crowdChange(q: Question, days = 7): number {
  const now = crowdNow(q);
  const then = q.history[Math.max(0, q.history.length - 1 - days)] ?? now;
  return now - then;
}

/**
 * How the crowd moved over the last week, for the line under "Canada says". Null when the history is shorter than a
 * week, so a new question never claims a weekly move it hasn't had.
 */
export function weekMove(q: Question): { direction: "up" | "down" | "flat"; points: number } | null {
  if (q.history.length < 8) return null;
  const change = crowdChange(q, 7);
  return { direction: change > 0 ? "up" : change < 0 ? "down" : "flat", points: Math.abs(change) };
}

/** The crowd's chance when calls closed, scored against the result. Null until a non-disputed yes or no exists: a cancelled question is never scored. */
export function crowdBrier(q: Question): number | null {
  const r = q.resolution.result;
  if (!r || r.disputed || r.outcome === "cancelled" || !q.scored) return null;
  const p = crowdNow(q) / 100;
  return (p - (r.outcome === "yes" ? 1 : 0)) ** 2;
}

/** Whether the crowd's number at close leaned toward the answer. Null until a non-disputed result on a scored question. */
export function crowdVerdict(q: Question): "right" | "wrong" | "split" | null {
  if (crowdBrier(q) === null) return null;
  const now = crowdNow(q);
  if (now === 50) return "split";
  return (now > 50) === (q.resolution.result?.outcome === "yes") ? "right" : "wrong";
}

/**
 * The crowd's record on this question's topic: how many resolved, scored questions it leaned the right way on. Null
 * below `min` results, so a topic with one or two results never reads as a track record.
 */
export function topicRecord(q: Question, all: readonly Question[], min = 3): { right: number; total: number } | null {
  const verdicts = all.filter((o) => o.category === q.category).map(crowdVerdict).filter((v) => v !== null);
  if (verdicts.length < min) return null;
  return { right: verdicts.filter((v) => v === "right").length, total: verdicts.length };
}

/**
 * Up to `n` open questions to call next, after this one: same topic first, then the rest, each group by most called.
 * Never this question and never a closed one, so every link leads to a call that can still be made.
 */
export function nextUp(q: Question, all: readonly Question[], now: Date, n = 3): Question[] {
  const open = all.filter((o) => o.slug !== q.slug && isOpen(questionState(o, now)));
  const byCalls = (a: Question, b: Question) => b.forecasters - a.forecasters;
  const same = open.filter((o) => o.category === q.category).sort(byCalls);
  const rest = open.filter((o) => o.category !== q.category).sort(byCalls);
  return [...same, ...rest].slice(0, n);
}

/** The crowd's public record across resolved, scored questions. */
export function crowdRecord(qs: readonly Question[]): { resolved: number; meanBrier: number | null; rightSide: number | null } {
  const scored = qs.flatMap((q) => {
    const b = crowdBrier(q);
    const r = q.resolution.result;
    return b === null || !r ? [] : [{ b, right: crowdNow(q) !== 50 && (crowdNow(q) > 50) === (r.outcome === "yes") }];
  });
  if (scored.length === 0) return { resolved: 0, meanBrier: null, rightSide: null };
  return {
    resolved: scored.length,
    meanBrier: scored.reduce((s, x) => s + x.b, 0) / scored.length,
    rightSide: Math.round((scored.filter((x) => x.right).length / scored.length) * 100),
  };
}
