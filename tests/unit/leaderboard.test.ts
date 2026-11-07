import { describe, expect, it } from "vitest";
import { adjustedSkill, percentileOf, rankForecasters, skillWeightedConsensus, type ForecasterRecord } from "@/lib/leaderboard";
import type { ScoredCall } from "@/lib/record";

function calls(n: number, userPercent: number, crowdPercent = 60, outcome: 0 | 1 = 1): ScoredCall[] {
  return Array.from({ length: n }, (_, i) => ({
    slug: `q${i}`,
    category: "economy",
    userPercent,
    crowdPercent,
    outcome,
    resolvedAt: `2026-10-${String(i + 1).padStart(2, "0")}`,
  }));
}

const person = (handle: string, c: ScoredCall[], region: ForecasterRecord["region"] = "ON"): ForecasterRecord => ({
  handle,
  displayName: handle,
  region,
  joinedAt: "2026-09-01",
  calls: c,
});

describe("adjustedSkill", () => {
  it("is 0 with no calls and shrinks small records toward the crowd", () => {
    expect(adjustedSkill([])).toBe(0);
    const few = adjustedSkill(calls(2, 90));
    const many = adjustedSkill(calls(40, 90));
    expect(few).toBeGreaterThan(0);
    expect(many).toBeGreaterThan(few);
  });
  it("matches the formula", () => {
    // user Brier 0.01 each, crowd 0.16 each, n=5, k=5 → (0.05 + 0.8) / 10 = 0.085 → 1 − 0.085/0.16
    expect(adjustedSkill(calls(5, 90))).toBeCloseTo(1 - 0.085 / 0.16, 10);
  });
});

describe("rankForecasters", () => {
  const board = [
    person("lucky", calls(5, 99)),
    person("steady", calls(30, 85)),
    person("behind", calls(30, 40)),
    person("new", calls(2, 99)),
    person("west", calls(30, 85), "BC"),
  ];

  it("leaves out records below the minimum and ranks by shrunk skill", () => {
    const rows = rankForecasters(board);
    expect(rows.map((r) => r.handle)).toEqual(["steady", "west", "lucky", "behind"]);
  });

  it("gives tied records the same rank and keeps the order stable", () => {
    const rows = rankForecasters(board);
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3, 4]);
  });

  it("filters by region", () => {
    expect(rankForecasters(board, { region: "BC" }).map((r) => r.handle)).toEqual(["west"]);
  });

  it("reports raw skill alongside the ranking score", () => {
    const behind = rankForecasters(board).find((r) => r.handle === "behind")!;
    expect(behind.skill).toBeLessThan(0);
    expect(behind.count).toBe(30);
  });
});

describe("percentileOf", () => {
  const rows = rankForecasters([person("a", calls(10, 90)), person("b", calls(10, 80)), person("c", calls(10, 70)), person("d", calls(10, 60))]);
  it("counts the share of the board behind you", () => {
    expect(percentileOf("a", rows)).toBe(100);
    expect(percentileOf("b", rows)).toBe(66);
    expect(percentileOf("d", rows)).toBe(0);
  });
  it("is null off the board or on a board of one", () => {
    expect(percentileOf("zz", rows)).toBeNull();
    expect(percentileOf("a", rows.slice(0, 1))).toBeNull();
  });
});

describe("skillWeightedConsensus", () => {
  it("ignores forecasters with no positive skill", () => {
    expect(skillWeightedConsensus([{ percent: 90, skill: 0 }, { percent: 10, skill: -0.2 }])).toBeNull();
  });
  it("pools in logit space so symmetric views cancel", () => {
    expect(skillWeightedConsensus([{ percent: 80, skill: 0.3 }, { percent: 20, skill: 0.3 }])).toBe(50);
  });
  it("leans toward the sharper forecaster", () => {
    const v = skillWeightedConsensus([{ percent: 80, skill: 0.4 }, { percent: 40, skill: 0.1 }])!;
    expect(v).toBeGreaterThan(60);
    expect(v).toBeLessThan(80);
  });
});
