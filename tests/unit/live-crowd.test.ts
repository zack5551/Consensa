import { describe, expect, it } from "vitest";
import { sampleQuestions } from "@/content/sample-questions";
import { applyLive, MIN_CROWD, summarize } from "@/lib/live-crowd";
import { crowdNow } from "@/lib/question";

describe("summarize", () => {
  it("adds regions and languages into one plain average per question", () => {
    const live = summarize([
      { slug: "a-q", region: "QC", locale: "fr", n: 3, total: 180 },
      { slug: "a-q", region: "ON", locale: "en", n: 2, total: 60 },
    ]);
    expect(live.get("a-q")).toEqual({ n: 5, mean: 48 });
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
