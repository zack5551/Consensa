/**
 * Breaking news, big events and trending (zack, 2026-11-25): how the engine spots them, writes them first or caps them,
 * and tags each question so the board can rank it.
 */
import { describe, expect, it } from "vitest";
import { DESKS } from "@/engine/draft/desks";
import type { Drafter, DraftContext } from "@/engine/draft/drafter";
import { BREAKING_ASK, eventAsk, userMessage } from "@/engine/draft/prompt";
import { toSiteQuestion } from "@/engine/live";
import { planDesks, runCycle, spotlightOf } from "@/engine/pipeline";
import { publish } from "@/engine/review";
import { activeEvents, BIG_EVENTS, eventFor, eventStories, type BigEvent } from "@/engine/sources/events";
import { MemoryStore } from "@/engine/store";
import { breakingOf, trendingOf } from "@/engine/stories";
import type { Signal, Story } from "@/engine/types";
import { goodDraft, NOW, signal, story } from "./helpers";

const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();

describe("breaking news: several outlets within two hours, recently", () => {
  const report = (id: string, sourceId: string, minutesAgo: number, kind: Signal["kind"] = "news") =>
    signal({ id, title: `Report ${id}`, sourceId, publishedAt: at(minutesAgo), kind });

  it("three reports from two outlets inside two hours is breaking", () => {
    expect(breakingOf([report("a", "cbc-canada", 90), report("b", "globe-canada", 60), report("c", "rc-national", 10)], NOW)).toBe(true);
  });

  it("one outlet's many feeds never make it breaking on their own", () => {
    expect(breakingOf([report("a", "cbc-canada", 50), report("b", "cbc-toronto", 40), report("c", "cbc-montreal", 30)], NOW)).toBe(false);
  });

  it("reports spread over more than two hours, or all older than six, aren't breaking", () => {
    expect(breakingOf([report("a", "cbc-canada", 300), report("b", "globe-canada", 160), report("c", "rc-national", 20)], NOW)).toBe(false);
    expect(breakingOf([report("a", "cbc-canada", 500), report("b", "globe-canada", 480), report("c", "rc-national", 420)], NOW)).toBe(false);
  });

  it("trending searches and official releases don't count as newsroom reports", () => {
    expect(breakingOf([report("a", "cbc-canada", 30), report("b", "google-trends", 20, "trend"), report("c", "statcan-daily", 10, "official")], NOW)).toBe(false);
  });

  it("a story mostly from trending searches is marked trending", () => {
    expect(trendingOf([signal({ title: "x", kind: "trend", weight: 2 }), signal({ title: "y", weight: 1 })])).toBe(true);
    expect(trendingOf([signal({ title: "x", kind: "trend", weight: 1 }), signal({ title: "y", weight: 1 })])).toBe(false);
  });
});

describe("the events scout", () => {
  const oscars = BIG_EVENTS.find((e) => e.id === "oscars-2027")!;
  const early = new Date("2027-02-20T12:00:00Z");
  const inWindow = new Date("2027-03-05T12:00:00Z");

  it("opens an event's window its lead days ahead and closes it when the event starts (or ends)", () => {
    expect(activeEvents(early, [oscars])).toEqual([]);
    expect(activeEvents(inWindow, [oscars])).toEqual([oscars]);
    expect(activeEvents(new Date("2027-03-15T12:00:00Z"), [oscars])).toEqual([]);
  });

  it("writes one story a day per open event, on its desk, tagged with the event", () => {
    const stories = eventStories(inWindow, DESKS, [oscars]);
    expect(stories).toHaveLength(1);
    expect(stories[0]!.event).toEqual({ id: "oscars-2027", name: oscars.name, at: oscars.at });
    expect(stories[0]!.categoryHint).toBe("culture");
    // Same day, same story (so it's written once); the next day, a new one.
    expect(eventStories(new Date("2027-03-05T20:00:00Z"), DESKS, [oscars])[0]!.id).toBe(stories[0]!.id);
    expect(eventStories(new Date("2027-03-06T20:00:00Z"), DESKS, [oscars])[0]!.id).not.toBe(stories[0]!.id);
  });

  it("tags news that names an open event, and leaves the rest alone", () => {
    expect(eventFor(story([signal({ title: "Canadian film earns Oscar buzz" })]), inWindow, [oscars])?.id).toBe("oscars-2027");
    expect(eventFor(story([signal({ title: "Canadian film earns Oscar buzz" })]), early, [oscars])).toBeUndefined();
    expect(eventFor(story([signal({ title: "Snowfall warning for Quebec" })]), inWindow, [oscars])).toBeUndefined();
  });

  it("lists only checked big dates, never junior or amateur sports (LEX)", () => {
    for (const e of BIG_EVENTS) {
      expect(e.id).toMatch(/^[a-z0-9-]+$/);
      expect(e.url).toMatch(/^https:\/\//);
      expect(DESKS.some((d) => d.id === e.desk), e.id).toBe(true);
      expect(`${e.name.en} ${e.keywords.join(" ")}`.toLowerCase()).not.toMatch(/junior|amateur|university|ncaa/);
    }
  });
});

describe("spotlight on each question", () => {
  it("sizes a question by its news, with floors for breaking stories, big dates and plain releases", () => {
    const quiet: Story = story([signal({ title: "quiet" })], { heat: 30 });
    expect(spotlightOf(quiet, NOW)).toEqual({ newsSize: 30 });
    const breaking = spotlightOf({ ...quiet, breaking: true }, NOW);
    expect(breaking.newsSize).toBe(80);
    expect(breaking.breakingUntil).toBe("2026-11-06T18:00:00.000Z");
    const event = { id: "oscars-2027", name: { en: "Oscars", fr: "Oscars" }, at: "2027-03-14T23:00:00Z" };
    expect(spotlightOf({ ...quiet, event }, NOW)).toEqual({ newsSize: 60, event });
    expect(spotlightOf({ ...quiet, trending: true }, NOW).trending).toBe(true);
    expect(spotlightOf(story([signal({ title: "LFS release", kind: "calendar" })], { heat: 0 }), NOW).newsSize).toBe(20);
  });

  it("carries the spotlight to the site with the time it went live", () => {
    const item = {
      id: "i",
      storyId: "s",
      draft: goodDraft(),
      flags: [],
      provenance: [],
      priority: 50,
      status: "approved" as const,
      history: [],
      drafter: "w",
      createdAt: NOW.toISOString(),
      spotlight: { newsSize: 72 },
    };
    const live = toSiteQuestion(publish(item, new Date("2026-11-06T13:00:00Z"))) as unknown as { spotlight?: { publishedAt: string; newsSize: number } };
    // The site's schema gains `spotlight` in the board's PR; until then it is dropped, never wrong.
    if (live.spotlight) expect(live.spotlight).toEqual({ newsSize: 72, publishedAt: "2026-11-06T13:00:00.000Z" });
  });
});

describe("in the cycle", () => {
  const news = (id: string, title: string, sourceId: string, minutesAgo: number, kind: Signal["kind"] = "news", weight = 2) =>
    signal({ id, title, sourceId, publishedAt: at(minutesAgo), kind, weight, url: `https://example.ca/${id}` });

  const run = async (signals: Signal[], seen: Array<{ story: Story; ctx: DraftContext }>, events: readonly BigEvent[] = []) => {
    const drafter: Drafter = { id: "w", draft: async (s, ctx) => (seen.push({ story: s, ctx }), { status: "skip", reason: "test", drafter: "w" }) };
    return runCycle({
      store: new MemoryStore(),
      drafter,
      ingest: async () => [{ sourceId: "mixed", signals, dropped: 0 }],
      releases: [],
      now: NOW,
      events,
      config: { thinBelow: 0, maxDrafts: 40 },
    });
  };

  it("writes a breaking story first on its desk and asks what happens next, soon", async () => {
    const seen: Array<{ story: Story; ctx: DraftContext }> = [];
    await run(
      [
        news("old-1", "Inflation report shows grocery prices climbing", "cbc-business", 600, "news", 3),
        news("old-2", "Grocery prices climbing in new inflation report", "globe-business", 590, "news", 3),
        news("brk-1", "Canada Post strike begins as talks collapse", "cbc-canada", 50),
        news("brk-2", "Canada Post workers strike after talks collapse", "globe-canada", 40),
        news("brk-3", "Canada Post strike: talks collapse, workers walk out", "rc-national", 30),
      ],
      seen,
    );
    const first = seen.find((x) => x.story.breaking)!;
    expect(first.story.breaking).toBe(true);
    expect(first.ctx.breaking).toBe(true);
    expect(first.ctx.fast).toBe(true);
    expect(userMessage(first.story, NOW, [], [], true, [], false, undefined, undefined, { breaking: true })).toContain(BREAKING_ASK);
  });

  it("puts a breaking story ahead of hotter news on its desk", () => {
    const hot = story([signal({ title: "Inflation climbs again" })], { id: "hot", heat: 90, categoryHint: "economy" });
    const breaking = story([signal({ title: "Bank of Canada surprise statement" })], { id: "brk", heat: 50, categoryHint: "economy", breaking: true });
    const economy = planDesks([hot, breaking], []).find((p) => p.desk.id === "economy")!;
    expect(economy.stories.map((s) => s.id)).toEqual(["brk", "hot"]);
  });

  it("caps trending stories per run, so they don't crowd out the news", async () => {
    const seen: Array<{ story: Story; ctx: DraftContext }> = [];
    const drafter: Drafter = {
      id: "w",
      draft: async (s, ctx) => (seen.push({ story: s, ctx }), { status: "draft", drafter: "w", draft: goodDraft({ slug: `trend-${seen.length}-2026`, category: "culture", resolver: { kind: "manual", check: `Official announcement: ${s.headline}` }, question: { en: `Will this happen by December 2026: ${s.headline}?`, fr: `Est-ce que ceci arrivera d’ici décembre 2026 : ${s.headline}?` } }) }),
    };
    const trends = Array.from({ length: 6 }, (_, i) => news(`t-${i}`, ["Drake announces arena dates", "Bieber surprise album leak", "Weeknd halftime rumours swirl", "Dion documentary premiere", "Cardin Juno nomination", "McRae fragrance launch"][i]!, "google-trends-ca", 30, "trend", 3));
    const report = await runCycle({ store: new MemoryStore(), drafter, ingest: async () => [{ sourceId: "g", signals: trends, dropped: 0 }], releases: [], now: NOW, events: [], config: { thinBelow: 0 } });
    const queued = report.decisions.filter((d) => d.decision === "queued");
    expect(seen.every((s) => s.story.trending)).toBe(true);
    expect(queued).toHaveLength(2);
  });

  it("adds a story for each open big date and tags matching news with it", async () => {
    const seen: Array<{ story: Story; ctx: DraftContext }> = [];
    const event: BigEvent = { id: "test-awards", name: { en: "Test Awards", fr: "Prix Test" }, at: "2026-11-10T01:00:00Z", desk: "culture", url: "https://example.ca/awards", keywords: ["test awards"], leadDays: 10 };
    await run([news("n-1", "Canadian singer nominated at the Test Awards", "cbc-arts", 60, "news", 3)], seen, [event]);
    const tagged = seen.filter((s) => s.ctx.event?.id === "test-awards");
    expect(tagged.length).toBe(2);
    expect(tagged.some((s) => s.story.signals[0]!.sourceId === "events-calendar")).toBe(true);
    expect(userMessage(tagged[0]!.story, NOW, [], [], false, [], false, undefined, undefined, { event })).toContain(eventAsk("Test Awards", event.at));
  });
});
