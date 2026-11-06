import { describe, expect, it } from "vitest";
import { brierScore, calibration, gapToCrowd, logScore, meanBrier } from "@/lib/scoring";

describe("brierScore", () => {
  it("is 0 for a perfect forecast and 1 for a confident miss", () => {
    expect(brierScore(1, 1)).toBe(0);
    expect(brierScore(0, 1)).toBe(1);
  });
  it("is 0.25 for a coin flip either way", () => {
    expect(brierScore(0.5, 1)).toBe(0.25);
    expect(brierScore(0.5, 0)).toBe(0.25);
  });
  it("matches the textbook value for 70% on a yes", () => {
    expect(brierScore(0.7, 1)).toBeCloseTo(0.09, 10);
  });
  it("rejects probabilities outside 0–1", () => {
    expect(() => brierScore(1.2, 1)).toThrow(RangeError);
    expect(() => brierScore(Number.NaN, 0)).toThrow(RangeError);
  });
});

describe("meanBrier", () => {
  it("averages and returns null when empty", () => {
    expect(meanBrier([])).toBeNull();
    expect(meanBrier([{ p: 1, outcome: 1 }, { p: 0.5, outcome: 0 }])).toBeCloseTo(0.125, 10);
  });
});

describe("logScore", () => {
  it("stays finite on a 0% miss and is 0 at certainty", () => {
    expect(Number.isFinite(logScore(0, 1))).toBe(true);
    expect(logScore(1, 1)).toBeCloseTo(Math.log(1 - 1e-4), 10);
  });
});

describe("calibration", () => {
  it("bins forecasts and reports the observed rate", () => {
    const bins = calibration([
      { p: 0.72, outcome: 1 },
      { p: 0.71, outcome: 0 },
      { p: 0.05, outcome: 0 },
    ]);
    expect(bins).toHaveLength(2);
    const seventy = bins.find((b) => b.lower === 0.7)!;
    expect(seventy.count).toBe(2);
    expect(seventy.observedRate).toBe(0.5);
  });
  it("puts 100% in the top bin", () => {
    expect(calibration([{ p: 1, outcome: 1 }])[0]!.lower).toBe(0.9);
  });
});

describe("gapToCrowd", () => {
  it("is signed whole points", () => {
    expect(gapToCrowd(50, 38)).toBe(12);
    expect(gapToCrowd(30, 38)).toBe(-8);
  });
});
