import { describe, expect, it } from "vitest";
import { brierTrend, byCategory, calibrationError, confidenceLean, callBrier, skillVsCrowd, streaks, summarizeRecord, verdict, type ScoredCall } from "@/lib/record";

const call = (over: Partial<ScoredCall> & Pick<ScoredCall, "slug">): ScoredCall => ({
  category: "economy",
  userPercent: 70,
  crowdPercent: 60,
  outcome: 1,
  resolvedAt: "2026-10-01",
  ...over,
});

describe("verdict", () => {
  it("is 'called it' on the side that happened", () => {
    expect(verdict(70, 1)).toBe("calledIt");
    expect(verdict(20, 0)).toBe("calledIt");
  });
  it("is a miss on the other side and neutral at exactly 50%", () => {
    expect(verdict(70, 0)).toBe("missed");
    expect(verdict(50, 1)).toBe("tossUp");
  });
});

describe("skillVsCrowd", () => {
  it("is positive when sharper than the crowd", () => {
    expect(skillVsCrowd(0.1, 0.2)).toBeCloseTo(0.5, 10);
    expect(skillVsCrowd(0.3, 0.2)).toBeCloseTo(-0.5, 10);
  });
  it("is null with nothing to compare", () => {
    expect(skillVsCrowd(null, 0.2)).toBeNull();
    expect(skillVsCrowd(0.1, 0)).toBeNull();
  });
});

describe("streaks", () => {
  it("counts consecutive hits in resolution order, whatever the input order", () => {
    const calls = [
      call({ slug: "c", resolvedAt: "2026-10-03" }),
      call({ slug: "a", resolvedAt: "2026-10-01" }),
      call({ slug: "b", resolvedAt: "2026-10-02", outcome: 0 }),
      call({ slug: "d", resolvedAt: "2026-10-04" }),
    ];
    expect(streaks(calls)).toEqual({ current: 2, best: 2 });
  });
  it("lets a toss-up pass without breaking the streak", () => {
    const calls = [call({ slug: "a", resolvedAt: "2026-10-01" }), call({ slug: "b", resolvedAt: "2026-10-02", userPercent: 50 }), call({ slug: "c", resolvedAt: "2026-10-03" })];
    expect(streaks(calls)).toEqual({ current: 2, best: 2 });
  });
  it("is zero for an empty record", () => {
    expect(streaks([])).toEqual({ current: 0, best: 0 });
  });
});

describe("brierTrend", () => {
  it("is a running mean for user and crowd", () => {
    const trend = brierTrend([call({ slug: "a", resolvedAt: "2026-10-01", userPercent: 100 - 0, crowdPercent: 50 }), call({ slug: "b", resolvedAt: "2026-10-02", userPercent: 0, crowdPercent: 50 })]);
    expect(trend.map((t) => t.user)).toEqual([0, 0.5]);
    expect(trend.map((t) => t.crowd)).toEqual([0.25, 0.25]);
  });
});

describe("byCategory", () => {
  it("only lists categories with calls, in a fixed order", () => {
    const lines = byCategory([call({ slug: "a", category: "weather" }), call({ slug: "b", category: "economy" }), call({ slug: "c", category: "weather" })]);
    expect(lines.map((l) => [l.category, l.count])).toEqual([["economy", 1], ["weather", 2]]);
  });
});

describe("summarizeRecord", () => {
  it("handles an empty record without inventing numbers", () => {
    const s = summarizeRecord([]);
    expect(s.count).toBe(0);
    expect(s.brier).toBeNull();
    expect(s.skill).toBeNull();
    expect(s.hitRate).toBeNull();
    expect(s.bestCall).toBeNull();
    expect(s.calibration).toEqual([]);
    expect(s.recent).toEqual([]);
  });

  it("scores a small record against the crowd", () => {
    const s = summarizeRecord([
      call({ slug: "a", userPercent: 80, crowdPercent: 60, outcome: 1, resolvedAt: "2026-10-01" }),
      call({ slug: "b", userPercent: 30, crowdPercent: 40, outcome: 0, resolvedAt: "2026-10-02" }),
      call({ slug: "c", userPercent: 70, crowdPercent: 55, outcome: 0, resolvedAt: "2026-10-03" }),
    ]);
    expect(s.count).toBe(3);
    expect(s.brier).toBeCloseTo((0.04 + 0.09 + 0.49) / 3, 10);
    expect(s.crowdBrier).toBeCloseTo((0.16 + 0.16 + 0.3025) / 3, 10);
    expect(s.calledIt).toBe(2);
    expect(s.missed).toBe(1);
    expect(s.hitRate).toBeCloseTo(2 / 3, 10);
    expect(s.bestCall?.slug).toBe("a");
    expect(s.recent.map((r) => r.slug)).toEqual(["c", "b", "a"]);
    expect(s.recent[0]?.verdict).toBe("missed");
    expect(s.streaks).toEqual({ current: 0, best: 2 });
  });

  it("has no best call when the crowd beat every call", () => {
    expect(summarizeRecord([call({ slug: "a", userPercent: 55, crowdPercent: 90 })]).bestCall).toBeNull();
  });
});

describe("calibrationError", () => {
  it("is zero when forecasts match outcomes and null when empty", () => {
    expect(calibrationError([])).toBeNull();
    expect(calibrationError([{ lower: 0.4, upper: 0.6, meanForecast: 0.5, observedRate: 0.5, count: 4 }])).toBe(0);
  });
  it("weights each bin by its size", () => {
    const e = calibrationError([
      { lower: 0.8, upper: 1, meanForecast: 0.9, observedRate: 0.6, count: 3 },
      { lower: 0, upper: 0.2, meanForecast: 0.1, observedRate: 0.1, count: 1 },
    ]);
    expect(e).toBeCloseTo(0.225, 10);
  });
});

describe("callBrier", () => {
  it("scores whole percents as probabilities", () => {
    expect(callBrier({ userPercent: 70, outcome: 1 })).toBeCloseTo(0.09, 10);
  });
});

describe("confidenceLean", () => {
  const bin = (meanForecast: number, observedRate: number, count: number) => ({ lower: 0, upper: 1, meanForecast, observedRate, count });
  it("says nothing on a thin record", () => {
    expect(confidenceLean([bin(0.7, 1, 3)])).toBeNull();
  });
  it("spots underconfidence on both sides of 50%", () => {
    expect(confidenceLean([bin(0.7, 0.9, 5), bin(0.3, 0.1, 5)])).toEqual({ lean: "underconfident", points: 20 });
  });
  it("spots overconfidence", () => {
    expect(confidenceLean([bin(0.9, 0.6, 10)])).toEqual({ lean: "overconfident", points: 30 });
  });
  it("calls small gaps calibrated", () => {
    expect(confidenceLean([bin(0.7, 0.72, 10)])?.lean).toBe("calibrated");
  });
});
