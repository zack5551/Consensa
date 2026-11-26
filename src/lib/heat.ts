import type { Category, Question } from "@/lib/question";

/**
 * The heat score: what the board, the lead question and Today's five put first.
 *
 * zack's brief (2026-11-25): not "most hits". Blend how many calls are coming in *right now* (not totals), how big
 * the news is and how fresh the question is. Trending questions get a few hours in the spotlight, then cool off unless
 * calls keep pouring in, and the top of any list stays varied by topic. Pure and framework-free, so it's unit-tested
 * and the server and the browser agree.
 */

/** The window "calls right now" counts over. */
export const RECENT_CALLS_HOURS = 6;
/** How long an engine-trending question keeps its spotlight boost and tag (zack: 6 to 12 hours). */
export const TRENDING_HOURS = 9;
/** Calls in the recent window that make a question trending on its own, whatever the engine said. */
export const TRENDING_CALLS = 25;
/** Recent calls at which the "right now" part is full. More still counts, just less and less. */
const VELOCITY_FULL = 200;
/** Freshness halves every this many hours. */
const FRESH_HALF_LIFE_HOURS = 12;

const WEIGHTS = { velocity: 0.45, news: 0.3, fresh: 0.25, breaking: 0.2, trending: 0.15 } as const;

const HOUR = 60 * 60 * 1000;

export type Heat = {
  /** 0 and up; about 0–1.35. Only the order matters. */
  score: number;
  breaking: boolean;
  trending: boolean;
};

export type HeatInput = Pick<Question, "spotlight">;

/** How long a question counts as "New" on the board after it goes live. */
export const NEW_HOURS = 48;

/** Went live within the last NEW_HOURS. Hand-written questions (no spotlight) never count as new. */
export function isNew(q: HeatInput, now: Date): boolean {
  const at = q.spotlight?.publishedAt;
  if (at === undefined) return false;
  const age = now.getTime() - Date.parse(at);
  return age >= 0 && age < NEW_HOURS * HOUR;
}

/** True while the engine's "Breaking" window is open. */
export function isBreaking(q: HeatInput, now: Date): boolean {
  const until = q.spotlight?.breakingUntil;
  return until !== undefined && Date.parse(until) > now.getTime();
}

/**
 * Trending: the engine flagged it and it went live less than TRENDING_HOURS ago, or calls are pouring in right now.
 * So a trend cools off on its own unless people keep calling it.
 */
export function isTrending(q: HeatInput, now: Date, recentCalls = 0): boolean {
  if (recentCalls >= TRENDING_CALLS) return true;
  const s = q.spotlight;
  if (!s?.trending) return false;
  const age = now.getTime() - Date.parse(s.publishedAt);
  return age >= 0 && age < TRENDING_HOURS * HOUR;
}

export function heatOf(q: HeatInput, now: Date, recentCalls = 0): Heat {
  const s = q.spotlight;
  const velocity = Math.min(1, Math.log1p(Math.max(0, recentCalls)) / Math.log1p(VELOCITY_FULL));
  const news = s ? s.newsSize / 100 : 0;
  const ageHours = s ? Math.max(0, (now.getTime() - Date.parse(s.publishedAt)) / HOUR) : Infinity;
  const fresh = Number.isFinite(ageHours) ? 0.5 ** (ageHours / FRESH_HALF_LIFE_HOURS) : 0;
  const breaking = isBreaking(q, now);
  const trending = isTrending(q, now, recentCalls);
  const score =
    WEIGHTS.velocity * velocity + WEIGHTS.news * news + WEIGHTS.fresh * fresh + (breaking ? WEIGHTS.breaking : 0) + (trending ? WEIGHTS.trending : 0);
  return { score: Math.round(score * 1000) / 1000, breaking, trending };
}

export type Rankable = { category: Category; heat: number; trending?: boolean };

export type SpreadOptions = {
  /** How many places at the top the caps apply to. */
  top: number;
  /** At most this many of one topic in the top places. */
  perCategory: number;
  /** At most this many trending questions in the top places. */
  trending: number;
};

/**
 * Hottest first, with variety at the top: within the first `top` places no topic takes more than `perCategory`
 * and trending questions take at most `trending`. Whatever a cap holds back keeps its order and follows right after.
 * Ties keep the incoming order, so callers decide what breaks them.
 */
export function spreadByHeat<T extends Rankable>(items: readonly T[], opts: SpreadOptions): T[] {
  // No signal at all (no engine spotlight, no recent calls): the incoming order is the editors' order. Keep it.
  if (!items.some((x) => x.heat > 0 || x.trending)) return [...items];
  const sorted = items.map((item, i) => ({ item, i })).sort((a, b) => b.item.heat - a.item.heat || a.i - b.i).map((x) => x.item);
  const head: T[] = [];
  const held: T[] = [];
  const perCat = new Map<Category, number>();
  let trending = 0;
  for (const item of sorted) {
    if (head.length >= opts.top) {
      held.push(item);
      continue;
    }
    const cat = perCat.get(item.category) ?? 0;
    if (cat >= opts.perCategory || (item.trending && trending >= opts.trending)) {
      held.push(item);
      continue;
    }
    head.push(item);
    perCat.set(item.category, cat + 1);
    if (item.trending) trending += 1;
  }
  // Fewer than `top` items fit the caps: top up from what was held back rather than leave places empty, relaxing the
  // topic cap first and the trending cap only as a last resort.
  for (const relaxTrending of [false, true]) {
    for (let i = 0; i < held.length && head.length < opts.top; ) {
      const item = held[i]!;
      if (!relaxTrending && item.trending && trending >= opts.trending) {
        i += 1;
        continue;
      }
      head.push(item);
      held.splice(i, 1);
      if (item.trending) trending += 1;
    }
  }
  return [...head, ...held];
}

/** The board's caps: the first ten rows mix topics and hold at most three trending questions. */
export const BOARD_SPREAD: SpreadOptions = { top: 10, perCategory: 3, trending: 3 };
/** Today's five: at most two trending and two of one topic (zack: trending shouldn't hog the spotlight). */
export const TODAY_SPREAD: SpreadOptions = { top: 5, perCategory: 2, trending: 2 };

/** Questions grouped for one big event appear from this many days before it starts... */
export const EVENT_LEAD_DAYS = 3;
/** ...until this many hours after it starts, then the event page goes away. */
export const EVENT_TAIL_HOURS = 24;

export type EventRef = NonNullable<NonNullable<Question["spotlight"]>["event"]>;

/** True while an event's page is up: from EVENT_LEAD_DAYS before it starts to EVENT_TAIL_HOURS after. */
export function eventIsUp(event: Pick<EventRef, "at">, now: Date): boolean {
  const at = Date.parse(event.at);
  return now.getTime() >= at - EVENT_LEAD_DAYS * 24 * HOUR && now.getTime() < at + EVENT_TAIL_HOURS * HOUR;
}

export type EventHub = { event: EventRef; questions: Question[] };

/** Events that are up now, soonest first, each with its questions. An event needs at least two questions to get a page. */
export function upcomingEvents(questions: readonly Question[], now: Date): EventHub[] {
  const hubs = new Map<string, EventHub>();
  for (const q of questions) {
    const e = q.spotlight?.event;
    if (!e || !eventIsUp(e, now)) continue;
    const hub = hubs.get(e.id);
    if (hub) hub.questions.push(q);
    else hubs.set(e.id, { event: e, questions: [q] });
  }
  return [...hubs.values()].filter((h) => h.questions.length >= 2).sort((a, b) => Date.parse(a.event.at) - Date.parse(b.event.at));
}

/** One event's hub, or undefined when it isn't up (not yet, already over, or unknown). */
export function eventHub(questions: readonly Question[], id: string, now: Date): EventHub | undefined {
  return upcomingEvents(questions, now).find((h) => h.event.id === id);
}
