import { describe, expect, it } from "vitest";
import { sampleQuestions } from "@/content/sample-questions";
import { applyLive, MIN_CROWD, parseCrowdRows, publishedRegionCount, REGION_COUNT_MIN, regionCallCount, summarize } from "@/lib/live-crowd";
import { formatCallCount } from "@/lib/format";
import { questionSchema } from "@/lib/question";
import { crowdNow } from "@/lib/question";

describe("summarize", () => {
  it("adds regions and languages into one plain average per question", () => {
    const live = summarize([
      { slug: "a-q", region: "QC", locale: "fr", n: 3, total: 180 },
      { slug: "a-q", region: "ON", locale: "en", n: 2, total: 60 },
    ]);
    expect(live.get("a-q")).toMatchObject({ n: 5, mean: 48 });
  });
  it(`shows nothing until ${MIN_CROWD} people have called, so one call can't be read off the page`, () => {
    expect(summarize([{ slug: "a-q", region: null, locale: "en", n: MIN_CROWD - 1, total: 300 }]).size).toBe(0);
  });
});

describe("applyLive", () => {
  const q = sampleQuestions[0]!;
  it("keeps sample numbers without a live crowd", () => {
    expect(applyLive(q, undefined)).toBe(q);
  });
  it("uses the real number and count, with no sample points mixed into the history", () => {
    const live = applyLive(q, { n: 1243, mean: 63 });
    expect(crowdNow(live)).toBe(63);
    expect(live.forecasters).toBe(1240);
    expect(live.fewCalls).toBeUndefined();
    expect(new Set(live.history)).toEqual(new Set([63]));
  });
  it("shows Canada's average from 5 calls, but no count until 50 (the exact count never leaves the server)", () => {
    const live = applyLive(q, { n: 12, mean: 63 });
    expect(crowdNow(live)).toBe(63);
    expect(live.forecasters).toBe(0);
    expect(live.fewCalls).toBe(true);
    expect(JSON.stringify(live)).not.toMatch(/"forecasters":12\b/);
    expect(questionSchema.safeParse(live).success).toBe(true);
    expect(formatCallCount(live, "en")).toBe("<50");
    expect(formatCallCount(live, "fr")).toBe("<\u00a050");
    expect(formatCallCount(applyLive(q, { n: 57, mean: 63 }), "en")).toBe("50");
  });
});

describe("live splits", () => {
  const q = sampleQuestions[0]!;
  const rows = [
    { slug: q.slug, region: "QC", locale: "fr", n: 5, total: 300 },
    { slug: q.slug, region: "ON", locale: "en", n: 6, total: 240 },
    { slug: q.slug, region: "BC", locale: "en", n: 2, total: 180 },
    { slug: q.slug, region: null, locale: "en", n: 1, total: 50 },
  ];

  it("shows a region or language only with at least 5 calls behind it", () => {
    const live = summarize(rows).get(q.slug)!;
    expect(live.provinces).toEqual({ QC: 60, ON: 40 });
    expect(live.languages).toEqual({ fr: 60, en: 52 });
  });

  it("hides thin regions and never mixes in sample numbers", () => {
    const out = applyLive(q, summarize(rows).get(q.slug));
    expect(out.provinces.QC).toBe(60);
    expect(out.provinces.ON).toBe(40);
    expect(out.hiddenProvinces).toEqual(["BC", "AB", "PR", "AT"]);
    expect(out.languages).toEqual({ en: 52, fr: 60 });
  });

  it("publishes no region counts when 1 to 4 calls sit outside the shown regions (the total would give them away)", () => {
    // 14 calls, 11 in shown regions: the 3 left over (2 in BC, 1 with no region) would be total − shown.
    expect(summarize(rows).get(q.slug)!.provinceCounts).toBeUndefined();
    for (let hidden = 1; hidden < MIN_CROWD; hidden += 1) {
      const live = summarize([...rows.slice(0, 2), { slug: q.slug, region: "BC", locale: "en", n: hidden, total: hidden * 50 }]).get(q.slug)!;
      expect(live.provinceCounts, `${hidden} hidden`).toBeUndefined();
      expect(live.provinces).toEqual({ QC: 60, ON: 40 });
    }
  });

  it("publishes region counts when nothing is left over", () => {
    expect(summarize(rows.slice(0, 2)).get(q.slug)!.provinceCounts).toEqual({ QC: 5, ON: 6 });
  });

  it("publishes region counts when at least 5 calls are left over, and never counts a thin region", () => {
    const live = summarize([...rows, { slug: q.slug, region: "AT", locale: "fr", n: 2, total: 100 }]).get(q.slug)!;
    expect(live.provinceCounts).toEqual({ QC: 5, ON: 6 });
  });

  it("keeps region counts off the question, so the page payload never carries them", () => {
    const out = applyLive(q, summarize(rows.slice(0, 2)).get(q.slug));
    expect(JSON.stringify(out)).not.toContain("provinceCounts");
    expect(questionSchema.safeParse(out).success).toBe(true);
  });

  it("gives out one region's count at a time, or null when it isn't published", () => {
    const big = summarize([
      { slug: q.slug, region: "QC", locale: "fr", n: 57, total: 57 * 60 },
      { slug: q.slug, region: "ON", locale: "en", n: 1243, total: 1243 * 40 },
    ]).get(q.slug);
    expect(regionCallCount(big, "QC")).toBe(50);
    expect(regionCallCount(big, "ON")).toBe(1240);
    expect(regionCallCount(big, "BC")).toBeNull();
    // Under 50 calls a region keeps its average but shows no count.
    const live = summarize(rows.slice(0, 2)).get(q.slug);
    expect(regionCallCount(live, "ON")).toBeNull();
    expect(regionCallCount(summarize(rows).get(q.slug), "ON")).toBeNull();
    expect(regionCallCount(undefined, "ON")).toBeNull();
  });

  it("drops the language split when one language is below the floor", () => {
    const out = applyLive(q, summarize(rows.filter((r) => r.region !== "QC")).get(q.slug));
    expect(out.languages).toBeUndefined();
  });
});

describe("parseCrowdRows", () => {
  it("reads bigint counts sent as strings", () => {
    expect(parseCrowdRows([{ slug: "a-q", region: "QC", locale: "fr", n: "7", total: "420" }])).toEqual([
      { slug: "a-q", region: "QC", locale: "fr", n: 7, total: 420 },
    ]);
  });
  it("drops malformed rows instead of trusting them", () => {
    const rows = parseCrowdRows([
      { slug: "a-q", region: null, locale: "en", n: 5, total: 250 },
      { slug: "a-q", region: "ON", locale: "en", n: -1, total: 10 },
      { slug: "a-q", region: "ON", locale: "en", n: "many", total: 10 },
      { region: "ON", locale: "en", n: 5, total: 10 },
      null,
    ]);
    expect(rows).toEqual([{ slug: "a-q", region: null, locale: "en", n: 5, total: 250 }]);
  });
  it("returns nothing for anything but an array", () => {
    expect(parseCrowdRows(null)).toEqual([]);
    expect(parseCrowdRows({ slug: "a-q" })).toEqual([]);
  });
});

describe("publishedRegionCount", () => {
  it("shows nothing under 50 calls, then rounds down to 10s", () => {
    for (const n of [0, 1, 5, 49]) expect(publishedRegionCount(n)).toBeNull();
    expect(publishedRegionCount(REGION_COUNT_MIN)).toBe(50);
    expect(publishedRegionCount(59)).toBe(50);
    expect(publishedRegionCount(60)).toBe(60);
    expect(publishedRegionCount(4317)).toBe(4310);
    expect(publishedRegionCount(Number.NaN)).toBeNull();
    expect(publishedRegionCount(50.5)).toBeNull();
  });

  it("doesn't move for nine calls in a row, so one new call can't be read off it", () => {
    const shown = new Set(Array.from({ length: 9 }, (_, i) => publishedRegionCount(61 + i)));
    expect([...shown]).toEqual([60]);
  });
});
