import { describe, expect, it } from "vitest";
import { todaysFive } from "@/content/sample-questions";
import { fixtureQuestions } from "@/content/test-fixtures";
import { boardQueryString, dayText, matchesFilter, topMovers, parseBoardQuery, sortRows, toBoardRow, type BoardRow } from "@/lib/board";
import { BOARD_SPREAD, NEW_HOURS, isNew, eventHub, eventIsUp, heatOf, isBreaking, isTrending, spreadByHeat, TODAY_SPREAD, TRENDING_CALLS, TRENDING_HOURS, upcomingEvents } from "@/lib/heat";
import { questionSchema, type Category, type Question, type Spotlight } from "@/lib/question";

const NOW = new Date("2026-11-26T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

let n = 0;
function q(spotlight?: Spotlight, extra: Partial<Question> = {}): Question {
  n += 1;
  return questionSchema.parse({
    slug: `q-${n}`,
    category: "economy",
    question: { en: "Will it?", fr: "Est-ce que?" },
    scored: true,
    closesAt: inHours(24 * 20),
    forecasters: 100,
    history: [50, 50],
    provinces: { BC: 50, AB: 50, PR: 50, ON: 50, QC: 50, AT: 50 },
    events: [],
    resolution: { source: { name: { en: "S", fr: "S" }, url: "https://example.ca/" }, rule: { en: "R", fr: "R" }, resolvesAt: inHours(24 * 21) },
    ...(spotlight ? { spotlight } : {}),
    ...extra,
  });
}

describe("heat score", () => {
  it("is zero with no engine spotlight and no recent calls, so the editors' order stands", () => {
    expect(heatOf(q(), NOW, 0)).toEqual({ score: 0, breaking: false, trending: false });
  });
  it("counts calls right now, not totals", () => {
    const busy = q(undefined, { forecasters: 10 });
    const big = q(undefined, { forecasters: 50_000 });
    expect(heatOf(busy, NOW, 40).score).toBeGreaterThan(heatOf(big, NOW, 0).score);
  });
  it("grows with calls but less and less, so one flood doesn't swamp everything", () => {
    const a = heatOf(q(), NOW, 10).score;
    const b = heatOf(q(), NOW, 100).score;
    const c = heatOf(q(), NOW, 10_000).score;
    expect(b - a).toBeGreaterThan(c - b);
  });
  it("likes bigger news and fresher questions", () => {
    expect(heatOf(q({ newsSize: 90, publishedAt: hoursAgo(1) }), NOW).score).toBeGreaterThan(heatOf(q({ newsSize: 20, publishedAt: hoursAgo(1) }), NOW).score);
    expect(heatOf(q({ newsSize: 50, publishedAt: hoursAgo(1) }), NOW).score).toBeGreaterThan(heatOf(q({ newsSize: 50, publishedAt: hoursAgo(48) }), NOW).score);
  });
});

describe("breaking and trending", () => {
  it("breaking lasts until the engine's breakingUntil", () => {
    expect(isBreaking(q({ newsSize: 80, publishedAt: hoursAgo(2), breakingUntil: inHours(4) }), NOW)).toBe(true);
    expect(isBreaking(q({ newsSize: 80, publishedAt: hoursAgo(7), breakingUntil: hoursAgo(1) }), NOW)).toBe(false);
  });
  it("an engine trend gets its window, then cools off", () => {
    expect(isTrending(q({ newsSize: 20, publishedAt: hoursAgo(TRENDING_HOURS - 1), trending: true }), NOW)).toBe(true);
    expect(isTrending(q({ newsSize: 20, publishedAt: hoursAgo(TRENDING_HOURS + 1), trending: true }), NOW)).toBe(false);
  });
  it("stays trending while calls keep pouring in, engine flag or not", () => {
    expect(isTrending(q({ newsSize: 20, publishedAt: hoursAgo(30), trending: true }), NOW, TRENDING_CALLS)).toBe(true);
    expect(isTrending(q(), NOW, TRENDING_CALLS)).toBe(true);
    expect(isTrending(q(), NOW, TRENDING_CALLS - 1)).toBe(false);
  });
});

describe("variety at the top", () => {
  const item = (category: Category, heat: number, trending = false) => ({ category, heat, trending, id: `${category}-${heat}` });
  it("caps one topic and trending questions in the top places, keeping the rest in order after", () => {
    const items = [item("sports", 0.9, true), item("sports", 0.8, true), item("sports", 0.7, true), item("economy", 0.6), item("culture", 0.5, true), item("weather", 0.4)];
    const ids = spreadByHeat(items, TODAY_SPREAD).map((x) => x.id);
    expect(ids.slice(0, 5)).toEqual(["sports-0.9", "sports-0.8", "economy-0.6", "weather-0.4", "sports-0.7"]);
    expect(ids).toHaveLength(6);
  });
  it("tops up from what was held back rather than leave places empty", () => {
    const items = [item("sports", 0.9), item("sports", 0.8), item("sports", 0.7)];
    expect(spreadByHeat(items, TODAY_SPREAD)).toHaveLength(3);
  });
  it("keeps the incoming order when nothing has heat yet", () => {
    const items = [item("sports", 0), item("sports", 0), item("sports", 0), item("culture", 0)];
    expect(spreadByHeat(items, { top: 3, perCategory: 1, trending: 1 })).toEqual(items);
  });
});

describe("board and Today's five", () => {
  const base: BoardRow = { slug: "x", title: { en: "x", fr: "x" }, category: "economy", state: "open", crowd: 50, change: 0, forecasters: 0, closesAt: inHours(48), scored: true, spark: [50], heat: 0, day: 0 };
  it("the hot sort puts heat first, ties by most called, and settled questions last", () => {
    const rows: BoardRow[] = [
      { ...base, slug: "settled", state: "resolved", heat: 0.9 },
      { ...base, slug: "popular", forecasters: 9_000 },
      { ...base, slug: "hot", heat: 0.5 },
      { ...base, slug: "quiet", forecasters: 10 },
    ];
    expect(sortRows(rows, "hot").map((r) => r.slug)).toEqual(["hot", "popular", "quiet", "settled"]);
  });
  it("board rows carry the tags", () => {
    const row = toBoardRow(q({ newsSize: 80, publishedAt: hoursAgo(1), breakingUntil: inHours(5), trending: true }), NOW);
    expect(row).toMatchObject({ breaking: true, trending: true });
    expect(row.heat).toBeGreaterThan(0);
    expect(BOARD_SPREAD.top).toBe(10);
  });
  it("Today's five takes the hottest, at most two trending", () => {
    const list = [q(), q(), q(), q({ newsSize: 10, publishedAt: hoursAgo(1), trending: true }), q({ newsSize: 10, publishedAt: hoursAgo(1), trending: true }), q({ newsSize: 10, publishedAt: hoursAgo(1), trending: true }), q({ newsSize: 95, publishedAt: hoursAgo(1) })];
    const five = todaysFive(NOW, list);
    expect(five).toHaveLength(5);
    expect(five[0]).toBe(list[6]);
    expect(five.filter((x) => x.spotlight?.trending).length).toBe(2);
  });
});

describe("event pages", () => {
  const gala = { id: "gala", name: { en: "Gala", fr: "Gala" }, at: inHours(48) };
  it("are up from three days before to a day after the start", () => {
    expect(eventIsUp({ at: inHours(24 * 3 - 1) }, NOW)).toBe(true);
    expect(eventIsUp({ at: inHours(24 * 3 + 1) }, NOW)).toBe(false);
    expect(eventIsUp({ at: hoursAgo(23) }, NOW)).toBe(true);
    expect(eventIsUp({ at: hoursAgo(25) }, NOW)).toBe(false);
  });
  it("group an event's questions, and need at least two", () => {
    const list = [q({ newsSize: 50, publishedAt: hoursAgo(1), event: gala }), q({ newsSize: 50, publishedAt: hoursAgo(1), event: gala }), q({ newsSize: 50, publishedAt: hoursAgo(1), event: { ...gala, id: "solo" } })];
    expect(upcomingEvents(list, NOW).map((h) => [h.event.id, h.questions.length])).toEqual([["gala", 2]]);
    expect(eventHub(list, "solo", NOW)).toBeUndefined();
    expect(eventHub(list, "gala", new Date(Date.parse(gala.at) + 2 * 86_400_000))).toBeUndefined();
  });
  it("the e2e fixtures hold a breaking, a trending and one event", () => {
    const fx = fixtureQuestions().map((f) => questionSchema.parse(f));
    const at = new Date("2026-11-06T12:00:00Z");
    expect(fx.some((f) => isBreaking(f, at))).toBe(true);
    expect(fx.some((f) => isTrending(f, at))).toBe(true);
    expect(upcomingEvents(fx, at).map((h) => h.event.id)).toEqual(["fixture-gala"]);
  });
});

describe("board tabs: trending, breaking, new", () => {
  const base: BoardRow = { slug: "x", title: { en: "x", fr: "x" }, category: "economy", state: "open", crowd: 50, change: 0, forecasters: 0, closesAt: inHours(48), scored: true, spark: [50], heat: 0, day: 0 };
  const none = new Set<string>();
  it("each tab keeps only open questions with that tag", () => {
    const rows: BoardRow[] = [
      { ...base, slug: "t", trending: true },
      { ...base, slug: "b", breaking: true },
      { ...base, slug: "n", fresh: true },
      { ...base, slug: "old-b", breaking: true, state: "resolved" },
      { ...base, slug: "plain" },
    ];
    const pick = (filter: "trending" | "breaking" | "new") => rows.filter((r) => matchesFilter(r, filter, none)).map((r) => r.slug);
    expect(pick("trending")).toEqual(["t"]);
    expect(pick("breaking")).toEqual(["b"]);
    expect(pick("new")).toEqual(["n"]);
  });
  it("new means live in the last two days, and hand-written questions never count", () => {
    expect(isNew(q({ newsSize: 10, publishedAt: hoursAgo(NEW_HOURS - 1) }), NOW)).toBe(true);
    expect(isNew(q({ newsSize: 10, publishedAt: hoursAgo(NEW_HOURS + 1) }), NOW)).toBe(false);
    expect(isNew(q(), NOW)).toBe(false);
    expect(toBoardRow(q({ newsSize: 10, publishedAt: hoursAgo(2) }), NOW).fresh).toBe(true);
  });
  it("the URL keeps the tab", () => {
    expect(parseBoardQuery({ show: "breaking" }).filter).toBe("breaking");
    expect(boardQueryString({ filter: "new", topic: "all", sort: "hot" })).toBe("?show=new");
  });
});

describe("since yesterday and top movers", () => {
  const base: BoardRow = { slug: "x", title: { en: "x", fr: "x" }, category: "economy", state: "open", crowd: 50, change: 0, forecasters: 0, closesAt: inHours(48), scored: true, spark: [50], heat: 0, day: 0 };
  it("says how far the crowd moved since yesterday, or nothing", async () => {
    const { default: en } = await import("@/i18n/dictionaries/en");
    const { default: fr } = await import("@/i18n/dictionaries/fr");
    expect(dayText(7, en.board)).toBe("Up 7 pts since yesterday");
    expect(dayText(-1, en.board)).toBe("Down 1 pt since yesterday");
    expect(dayText(0, en.board)).toBeNull();
    expect(dayText(7, fr.board)).toBe("En hausse de 7 points depuis hier");
  });
  it("board rows carry the one-day move", () => {
    expect(toBoardRow(q(undefined, { history: [40, 47] }), NOW).day).toBe(7);
  });
  it("top movers: open questions that moved 3+ points, biggest first, at most three", () => {
    const rows: BoardRow[] = [
      { ...base, slug: "a", day: 4 },
      { ...base, slug: "b", day: -9 },
      { ...base, slug: "c", day: 2 },
      { ...base, slug: "d", day: 12, state: "resolved" },
      { ...base, slug: "e", day: 5 },
      { ...base, slug: "f", day: 3 },
    ];
    expect(topMovers(rows).map((r) => r.slug)).toEqual(["b", "e", "a"]);
    expect(topMovers([{ ...base, day: 2 }])).toEqual([]);
  });
});
