import { describe, expect, it } from "vitest";
import { sampleQuestions } from "@/content/sample-questions";
import { applyLive, MIN_CROWD, parseCrowdRows, summarize } from "@/lib/live-crowd";
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
    const live = applyLive(q, { n: 12, mean: 63 });
    expect(crowdNow(live)).toBe(63);
    expect(live.forecasters).toBe(12);
    expect(new Set(live.history)).toEqual(new Set([63]));
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

  it("counts the calls behind each shown region, and never counts a thin one", () => {
    const live = summarize(rows).get(q.slug)!;
    expect(live.provinceCounts).toEqual({ QC: 5, ON: 6 });
    expect(live.provinceCounts?.BC).toBeUndefined();
  });

  it("carries region counts onto the question, which still passes the question schema", () => {
    const out = applyLive(q, summarize(rows).get(q.slug));
    expect(out.provinceCounts).toEqual({ QC: 5, ON: 6 });
    expect(questionSchema.safeParse(out).success).toBe(true);
  });

  it("leaves sample questions without region counts", () => {
    expect(q.provinceCounts).toBeUndefined();
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
