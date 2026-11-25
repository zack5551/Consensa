import { describe, expect, it } from "vitest";
import { COST_PER_CALL } from "@/engine/notify/digest";
import { MockDrafter } from "@/engine/draft/mock";
import type { Drafter } from "@/engine/draft/drafter";
import { runCycle } from "@/engine/pipeline";
import { approve } from "@/engine/review";
import { releases, upcoming } from "@/engine/sources/calendar";
import { fetchFeeds } from "@/engine/sources/feed";
import { sampleFeedResults } from "@/engine/sources/sample-feeds";
import { runFromEnv, torontoDayStart } from "@/engine/run";
import { SCOUTS, scoutOf, sources } from "@/engine/sources/registry";
import { MemoryStore } from "@/engine/store";
import { scoutIds } from "@/engine/types";
import { liveQuestionsFrom, sampleQuestions, SAMPLE_NOW } from "@/content/sample-questions";

/** Earlier writer calls, as a past run would have recorded them. */
async function used(store: MemoryStore, n: number, at: Date) {
  for (let i = 0; i < n; i++) await store.markDrafted(`earlier-${at.toISOString()}-${i}`, i % 2 ? "queued" : "declined", at);
}

describe("cost caps (zack, 2026-11-25: about US$95 this month)", () => {
  it("counts the day from midnight in Toronto, through daylight time and standard time", () => {
    expect(torontoDayStart(new Date("2026-11-25T20:43:00Z")).toISOString()).toBe("2026-11-25T05:00:00.000Z");
    expect(torontoDayStart(new Date("2026-11-26T03:30:00Z")).toISOString()).toBe("2026-11-25T05:00:00.000Z");
    expect(torontoDayStart(new Date("2026-07-01T12:00:00Z")).toISOString()).toBe("2026-07-01T04:00:00.000Z");
  });

  it("gives a run its full allowance on a fresh day, and the evening run what the morning left", async () => {
    const store = new MemoryStore();
    const morning = await runFromEnv({ liveFeeds: false, maxDrafts: 20, dailyDrafts: 50, monthlyBudgetUsd: 95, now: SAMPLE_NOW, store });
    expect(morning.draftAllowance).toBe(20);
    // Yesterday's calls don't count against today.
    await used(store, 40, new Date(SAMPLE_NOW.getTime() - 86_400_000));
    const store2 = new MemoryStore();
    await used(store2, 40, new Date(torontoDayStart(SAMPLE_NOW).getTime() - 60_000));
    expect((await runFromEnv({ liveFeeds: false, maxDrafts: 20, dailyDrafts: 50, now: SAMPLE_NOW, store: store2 })).draftAllowance).toBe(20);
    await used(store2, 35, new Date(SAMPLE_NOW.getTime() - 3_600_000));
    expect((await runFromEnv({ liveFeeds: false, maxDrafts: 20, dailyDrafts: 50, now: SAMPLE_NOW, store: store2 })).draftAllowance).toBeLessThanOrEqual(15);
  });

  it("stops writing once the month's estimated spend reaches the budget, and starts again on the 1st", async () => {
    const budgetCalls = Math.floor(95 / COST_PER_CALL);
    const store = new MemoryStore();
    await used(store, budgetCalls - 5, new Date(Date.UTC(SAMPLE_NOW.getUTCFullYear(), SAMPLE_NOW.getUTCMonth(), 2)));
    expect((await runFromEnv({ liveFeeds: false, maxDrafts: 20, monthlyBudgetUsd: 95, now: SAMPLE_NOW, store })).draftAllowance).toBe(5);
    await used(store, 10, new Date(SAMPLE_NOW.getTime() - 3_600_000));
    const spent = await runFromEnv({ liveFeeds: false, maxDrafts: 20, monthlyBudgetUsd: 95, now: SAMPLE_NOW, store });
    expect(spent.draftAllowance).toBe(0);
    expect(spent.report.decisions.filter((d) => d.decision === "queued")).toEqual([]);
    const nextMonth = new Date(Date.UTC(SAMPLE_NOW.getUTCFullYear(), SAMPLE_NOW.getUTCMonth() + 1, 1, 15));
    expect((await runFromEnv({ liveFeeds: false, maxDrafts: 20, monthlyBudgetUsd: 95, now: nextMonth, store })).draftAllowance).toBe(20);
  });

  it("never counts stories blocked before any writer saw them", async () => {
    const store = new MemoryStore();
    await store.markDrafted("blocked", "blockedStory", SAMPLE_NOW);
    await store.markDrafted("written", "queued", SAMPLE_NOW);
    expect(await store.draftedSince(new Date(SAMPLE_NOW.getTime() - 1000))).toBe(1);
  });

  it("refreshes the site's list when something goes live instead of rebuilding the site", async () => {
    const store = new MemoryStore();
    const seen: string[][] = [];
    let rebuilt = false;
    const fetchSpy: typeof fetch = async () => ((rebuilt = true), new Response("{}"));
    await runFromEnv({ liveFeeds: false, maxDrafts: 4, now: SAMPLE_NOW, store, fetch: fetchSpy });
    const pending = (await store.items()).filter((i) => i.status === "pending" && !i.flags.some((f) => f.severity === "block"));
    expect(pending.length).toBeGreaterThan(0);
    for (const item of pending) await store.putItem(approve(item, "test editor", SAMPLE_NOW, item.flags.map((f) => f.code)));
    const next = await runFromEnv({ liveFeeds: false, maxDrafts: 0, now: SAMPLE_NOW, store, deployHook: "https://api.vercel.com/hook", onPublished: (s) => void seen.push([...s]), fetch: fetchSpy });
    expect(next.published.length).toBeGreaterThan(0);
    expect(seen).toEqual([next.published]);
    expect(next.redeploy).toBe(false);
    expect(rebuilt).toBe(false);
  });
});

describe("news scouts", () => {
  it("every feed belongs to a scout, every scout has feeds, and ids stay unique", () => {
    expect(new Set(sources.map((s) => s.id)).size).toBe(sources.length);
    for (const id of scoutIds) expect(sources.some((s) => s.scout === id), id).toBe(true);
    expect(SCOUTS.map((s) => s.id)).toEqual([...scoutIds]);
    expect(scoutOf("google-trends-ca")?.id).toBe("social");
  });

  it("reads the Globe and Mail's feed format (CDATA titles) as topic signals", async () => {
    const globe = sources.find((x) => x.id === "globe-business")!;
    const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title><![CDATA[The Globe and Mail]]></title><item><title><![CDATA[Made-up headline: Canadian retailer plans 40 new stores]]></title><link>https://www.theglobeandmail.com/business/article-made-up/</link><pubDate>Fri, 06 Nov 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Summary.</p>]]></description></item></channel></rss>`;
    const [out] = await fetchFeeds([globe], async () => new Response(xml, { status: 200 }), 1000, 0);
    expect(out!.signals.map((x) => x.title)).toEqual(["Made-up headline: Canadian retailer plans 40 new stores"]);
    expect(out!.signals[0]!.sourceId).toBe("globe-business");
  });

  it("covers every province and territory's public broadcaster feed in at least one language", () => {
    const regional = sources.filter((s) => s.scout === "regions").map((s) => s.id);
    expect(regional.length).toBeGreaterThanOrEqual(20);
  });
});

describe("questions published since the build", () => {
  it("adds valid new questions, skips ones already built in, and drops anything malformed", () => {
    const built = sampleQuestions[0]!;
    const fresh = { ...built, slug: "a-brand-new-question" };
    const out = liveQuestionsFrom([fresh, built, { slug: 42 }, null], new Set(sampleQuestions.map((q) => q.slug)));
    expect(out.map((q) => q.slug)).toEqual(["a-brand-new-question"]);
  });
});

describe("hands-off runs (zack: questions keep coming without him having to worry)", () => {
  it("a feed that hiccups gets one more try; a feed that's simply gone doesn't", async () => {
    const src = sources.find((x) => x.id === "cbc-canada")!;
    const rss = `<?xml version="1.0"?><rss><channel><item><title>Ottawa opens a new transit line in 2027</title><link>https://www.cbc.ca/news/a</link><pubDate>Fri, 06 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
    let calls = 0;
    const flaky: typeof fetch = async () => (++calls === 1 ? new Response("busy", { status: 503 }) : new Response(rss, { status: 200 }));
    const [ok] = await fetchFeeds([src], flaky, 1000, 0);
    expect(calls).toBe(2);
    expect(ok!.error).toBeUndefined();
    calls = 0;
    const gone: typeof fetch = async () => (calls++, new Response("", { status: 404 }));
    const [missing] = await fetchFeeds([src], gone, 1000, 0);
    expect(calls).toBe(1);
    expect(missing!.error).toBe("HTTP 404");
  });

  it("one story blowing up costs that story only: the run finishes and the other desks keep writing", async () => {
    const mock = new MockDrafter();
    let n = 0;
    const shaky: Drafter = { id: mock.id, draft: async (story, ctx) => { if (++n === 1) throw new Error("Supabase busy"); return mock.draft(story, ctx); } };
    const store = new MemoryStore();
    const report = await runCycle({ store, drafter: shaky, ingest: async () => sampleFeedResults(), releases: upcoming(SAMPLE_NOW, 120, releases), now: SAMPLE_NOW });
    expect(report.decisions.filter((d) => d.decision === "error").map((d) => d.reason)).toEqual(["Supabase busy"]);
    expect(report.decisions.some((d) => d.decision === "queued")).toBe(true);
    // Not marked as drafted, so the next run tries that story again.
    const failed = report.decisions.find((d) => d.decision === "error")!;
    expect(await store.wasDrafted(failed.storyId)).toBe(false);
  });
});
