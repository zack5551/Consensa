/**
 * A reason to come back: what happened to your calls while you were away ("Since your last visit") and a month in
 * review ("Your October"). Pure functions over answered questions and the calls saved in this browser.
 * The person's own numbers never leave their device: the server sends the answered questions, the browser adds the
 * calls. Accuracy only, never points.
 */
import { questionState, crowdNow, type Category, type Question } from "./question";
import { streaks, verdict, type Verdict } from "./record";
import { brierScore } from "./scoring";

/** A scored question with a non-disputed yes or no answer. `crowd` is null when the crowd is under the 5-call floor. */
export type AnsweredQuestion = {
  slug: string;
  category: Category;
  outcome: "yes" | "no";
  /** When the official answer was published (ISO). */
  publishedAt: string;
  /** Canada's chance of yes when calls closed, 1–99, or null below 5 calls. */
  crowd: number | null;
};

export type AnsweredCall<T extends AnsweredQuestion = AnsweredQuestion> = T & { you: number; verdict: Verdict };

/** Every scored question whose official yes or no is in and not under review. A cancelled game or a poll never counts. */
export function answeredQuestions(questions: readonly Question[], now: Date): AnsweredQuestion[] {
  return questions.flatMap((q) => {
    const outcome = q.resolution.result?.outcome;
    if (!q.scored || questionState(q, now) !== "resolved" || (outcome !== "yes" && outcome !== "no")) return [];
    return [{ slug: q.slug, category: q.category, outcome, publishedAt: q.resolution.result!.publishedAt, crowd: q.fewCalls ? null : crowdNow(q) }];
  });
}

/** Joins answered questions with this browser's calls. Questions without a call drop out. */
export function withCalls<T extends AnsweredQuestion>(answered: readonly T[], calls: Readonly<Record<string, number>>): AnsweredCall<T>[] {
  return answered.flatMap((q) => {
    const you = calls[q.slug];
    return you === undefined ? [] : [{ ...q, you, verdict: verdict(you, q.outcome === "yes" ? 1 : 0) }];
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The answers to show in "Since your last visit", newest first: published after `seenThrough` (the newest answer
 * this browser has already shown). With no marker yet, only answers from the last `firstVisitDays` days, so a first
 * panel never digs up old results.
 */
export function unseenAnswers<T extends AnsweredQuestion>(calls: readonly AnsweredCall<T>[], seenThrough: string | null, now: Date, firstVisitDays = 30): AnsweredCall<T>[] {
  const after = seenThrough ? Date.parse(seenThrough) : now.getTime() - firstVisitDays * DAY_MS;
  return calls.filter((c) => Date.parse(c.publishedAt) > after).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug));
}

/** The newest answer among these calls: stored once shown, so the same answers never show twice. */
export function newestAnswer(calls: readonly Pick<AnsweredQuestion, "publishedAt">[]): string | null {
  return calls.reduce<string | null>((max, c) => (max === null || c.publishedAt > max ? c.publishedAt : max), null);
}

export type Comparison = { you: number; crowd: number; n: number; lean: "sharper" | "behind" | "level" };

/**
 * Mean Brier for you and for Canada on the same answered questions (only those with a real crowd number).
 * "Level" within 0.005, so rounding to two places never shows a winner that isn't there.
 */
export function compareWithCanada(calls: readonly AnsweredCall[]): Comparison | null {
  const both = calls.filter((c): c is AnsweredCall & { crowd: number } => c.crowd !== null);
  if (both.length === 0) return null;
  const o = (c: AnsweredCall) => (c.outcome === "yes" ? 1 : 0);
  const you = both.reduce((s, c) => s + brierScore(c.you / 100, o(c)), 0) / both.length;
  const crowd = both.reduce((s, c) => s + brierScore(c.crowd / 100, o(c)), 0) / both.length;
  const lean = Math.abs(you - crowd) < 0.005 ? "level" : you < crowd ? "sharper" : "behind";
  return { you, crowd, n: both.length, lean };
}

/** "2026-10": the calendar month in Eastern time, the zone the site's dates use. */
export function monthKey(iso: string | Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit" }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}`;
}

/** The month before the one `now` falls in (Eastern time). */
export function previousMonth(now: Date): string {
  const [y, m] = monthKey(now).split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Every finished month (before `now`'s month) that has at least one answered question, oldest first. */
export function recapMonths(answered: readonly AnsweredQuestion[], now: Date): string[] {
  const current = monthKey(now);
  return [...new Set(answered.map((q) => monthKey(q.publishedAt)))].filter((m) => m < current).sort();
}

export type MonthRecap<T extends AnsweredQuestion = AnsweredQuestion> = {
  month: string;
  /** Oldest first, for the timeline. */
  calls: AnsweredCall<T>[];
  calledIt: number;
  compare: Comparison | null;
  /** The right call that was most accurate. */
  best: AnsweredCall<T> | null;
  /** The miss that was furthest off. */
  toughest: AnsweredCall<T> | null;
  /** Longest run of right calls in the month. */
  bestRun: number;
  /** The topic with 2+ calls and the best share on the right side (ties: more accurate). */
  topic: { category: Category; calledIt: number; count: number } | null;
};

const brierOf = (c: AnsweredCall) => brierScore(c.you / 100, c.outcome === "yes" ? 1 : 0);

/** The month in review for calls answered in `month`. Null when none were. */
export function monthRecap<T extends AnsweredQuestion>(all: readonly AnsweredCall<T>[], month: string): MonthRecap<T> | null {
  const calls = all.filter((c) => monthKey(c.publishedAt) === month).sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.slug.localeCompare(b.slug));
  if (calls.length === 0) return null;
  const right = calls.filter((c) => c.verdict === "calledIt");
  const missed = calls.filter((c) => c.verdict === "missed");
  const best = [...right].sort((a, b) => brierOf(a) - brierOf(b))[0] ?? null;
  const toughest = [...missed].sort((a, b) => brierOf(b) - brierOf(a))[0] ?? null;
  const run = streaks(calls.map((c) => ({ slug: c.slug, category: c.category, userPercent: c.you, crowdPercent: c.crowd ?? 50, outcome: c.outcome === "yes" ? 1 : 0, resolvedAt: c.publishedAt }))).best;

  const topics = [...new Set(calls.map((c) => c.category))].flatMap((category) => {
    const subset = calls.filter((c) => c.category === category);
    if (subset.length < 2) return [];
    const hits = subset.filter((c) => c.verdict === "calledIt").length;
    if (hits === 0) return [];
    return [{ category, calledIt: hits, count: subset.length, rate: hits / subset.length, brier: subset.reduce((s, c) => s + brierOf(c), 0) / subset.length }];
  });
  topics.sort((a, b) => b.rate - a.rate || a.brier - b.brier);
  const top = topics[0];

  return {
    month,
    calls,
    calledIt: right.length,
    compare: compareWithCanada(calls),
    best,
    toughest,
    bestRun: run,
    topic: top ? { category: top.category, calledIt: top.calledIt, count: top.count } : null,
  };
}

/** Answered questions with their text and page in one language, as the panel and the recap receive them. */
export function localizedAnswered(questions: readonly Question[], locale: "en" | "fr", now: Date): Array<AnsweredQuestion & { question: string; href: string }> {
  const bySlug = new Map(questions.map((q) => [q.slug, q]));
  return answeredQuestions(questions, now).map((a) => ({ ...a, question: bySlug.get(a.slug)!.question[locale], href: `/${locale}/q/${a.slug}` }));
}
