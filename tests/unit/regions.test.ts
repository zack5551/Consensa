import { describe, expect, it } from "vitest";
import { bellwether, isPublishable, MIN_CELL, meanDistance, regionalAccuracy, regionFromSlug, regionGaps, regions, regionSlug } from "@/lib/regions";

const split = (slug: string, national: number, values: [number, number, number, number, number, number]) => ({
  slug,
  national,
  provinces: Object.fromEntries(regions.map((r, i) => [r, values[i]!])) as Record<(typeof regions)[number], number>,
});

describe("slugs", () => {
  it("round-trip for every region and reject unknown ones", () => {
    for (const r of regions) expect(regionFromSlug(regionSlug(r))).toBe(r);
    expect(regionFromSlug("yukon")).toBeUndefined();
  });
});

describe("isPublishable", () => {
  it("enforces the minimum cell size", () => {
    expect(isPublishable(MIN_CELL)).toBe(true);
    expect(isPublishable(MIN_CELL - 1)).toBe(false);
    expect(isPublishable(Number.NaN)).toBe(false);
  });
});

describe("regionGaps", () => {
  it("sorts by the size of the gap, either direction", () => {
    const qs = [split("a", 50, [52, 50, 50, 50, 50, 50]), split("b", 50, [40, 50, 50, 50, 50, 50]), split("c", 50, [55, 50, 50, 50, 50, 50])];
    expect(regionGaps(qs, "BC").map((g) => [g.slug, g.gap])).toEqual([["b", -10], ["c", 5], ["a", 2]]);
  });
});

describe("meanDistance and bellwether", () => {
  const qs = [split("a", 50, [60, 40, 52, 49, 30, 55]), split("b", 30, [20, 45, 33, 31, 30, 40])];
  it("averages absolute distance", () => {
    expect(meanDistance(qs, "ON")).toBeCloseTo(1, 10);
    expect(meanDistance([], "ON")).toBeNull();
  });
  it("finds the region closest to Canada", () => {
    expect(bellwether(qs)).toEqual({ region: "ON", distance: 1 });
    expect(bellwether([])).toBeNull();
  });
});

describe("regionalAccuracy", () => {
  const cell = (percent: number, forecasters = 100) => ({ percent, forecasters });
  const q = (outcome: 0 | 1, values: number[], counts: number[] = [100, 100, 100, 100, 100, 100]) => ({
    outcome,
    regions: Object.fromEntries(regions.map((r, i) => [r, cell(values[i]!, counts[i]!)])) as Record<(typeof regions)[number], { percent: number; forecasters: number }>,
  });

  it("ranks the region whose crowd was closest to what happened", () => {
    const rows = regionalAccuracy([q(1, [60, 80, 70, 70, 90, 50]), q(0, [40, 20, 30, 30, 10, 50])]);
    expect(rows[0]).toMatchObject({ region: "QC", rank: 1, questions: 2 });
    expect(rows.find((r) => r.region === "AT")?.brier).toBeCloseTo(0.25, 10);
    expect(rows.filter((r) => r.rank === 3).map((r) => r.region)).toEqual(["PR", "ON"]);
  });

  it("skips cells under the minimum size, and regions with nothing publishable", () => {
    const rows = regionalAccuracy([q(1, [60, 80, 70, 70, 90, 50], [100, 100, 100, 100, 100, MIN_CELL - 1])]);
    expect(rows.map((r) => r.region)).not.toContain("AT");
    expect(rows).toHaveLength(5);
  });
});
