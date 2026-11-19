import { describe, expect, it } from "vitest";
import { crowdLeansOtherWay, crowdOnSide, fromProbability, SURE_DEFAULT, sureGap, toProbability } from "@/lib/call-side";

describe("side and sureness to a stored probability", () => {
  it("keeps yes as it is and flips no", () => {
    expect(toProbability("yes", 80)).toBe(80);
    expect(toProbability("no", 80)).toBe(20);
    expect(toProbability("yes", 50)).toBe(50);
    expect(toProbability("no", 50)).toBe(50);
    expect(toProbability("yes", 99)).toBe(99);
    expect(toProbability("no", 99)).toBe(1);
  });

  it("never leaves the 1–99 range a call may hold", () => {
    expect(toProbability("yes", 140)).toBe(99);
    expect(toProbability("no", 140)).toBe(1);
    expect(toProbability("yes", 10)).toBe(50);
    expect(toProbability("no", 62.4)).toBe(38);
    expect(toProbability("yes", Number.NaN)).toBe(SURE_DEFAULT);
  });
});

describe("a stored probability back to a side and sureness", () => {
  it("reads 50 and up as yes, below 50 as no", () => {
    expect(fromProbability(80)).toEqual({ side: "yes", sure: 80 });
    expect(fromProbability(30)).toEqual({ side: "no", sure: 70 });
    expect(fromProbability(50)).toEqual({ side: "yes", sure: 50 });
    expect(fromProbability(49)).toEqual({ side: "no", sure: 51 });
    expect(fromProbability(1)).toEqual({ side: "no", sure: 99 });
    expect(fromProbability(99)).toEqual({ side: "yes", sure: 99 });
  });

  it("round-trips every call from 1 to 99", () => {
    for (let p = 1; p <= 99; p += 1) {
      const { side, sure } = fromProbability(p);
      expect(sure).toBe(Math.max(p, 100 - p));
      expect(toProbability(side, sure)).toBe(p);
    }
  });
});

describe("comparing with the crowd on your own side", () => {
  it("gives the crowd's share on each side", () => {
    expect(crowdOnSide("yes", 64)).toBe(64);
    expect(crowdOnSide("no", 64)).toBe(36);
  });

  it("is positive when you are more sure than the crowd", () => {
    expect(sureGap("yes", 75, 64)).toBe(11);
    expect(sureGap("no", 80, 38)).toBe(18);
    expect(sureGap("yes", 60, 80)).toBe(-20);
    expect(sureGap("no", 62, 38)).toBe(0);
  });

  it("knows when the crowd leans to the other answer", () => {
    expect(crowdLeansOtherWay("no", 64)).toBe(true);
    expect(crowdLeansOtherWay("yes", 64)).toBe(false);
    expect(crowdLeansOtherWay("yes", 38)).toBe(true);
    expect(crowdLeansOtherWay("no", 38)).toBe(false);
    expect(crowdLeansOtherWay("yes", 50)).toBe(false);
    expect(crowdLeansOtherWay("no", 50)).toBe(false);
  });
});
