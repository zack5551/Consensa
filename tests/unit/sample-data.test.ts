import { describe, expect, it } from "vitest";
import { getForecaster, SAMPLE_ME, sampleForecasters } from "@/content/sample-forecasters";
import { sampleResults } from "@/content/sample-results";
import { rankForecasters } from "@/lib/leaderboard";
import { MIN_CELL, regions } from "@/lib/regions";

describe("sample results", () => {
  it("have unique slugs, newest first, and a national number from the region cells", () => {
    const slugs = sampleResults.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const dates = sampleResults.map((r) => r.resolvedAt);
    expect([...dates].sort().reverse()).toEqual(dates);
    for (const r of sampleResults) {
      expect(r.forecasters).toBe(regions.reduce((s, g) => s + r.regions[g].forecasters, 0));
      expect(r.national).toBeGreaterThanOrEqual(1);
      expect(r.national).toBeLessThanOrEqual(99);
    }
  });

  it("include at least one cell under the minimum size, so suppression is exercised", () => {
    expect(sampleResults.some((r) => regions.some((g) => r.regions[g].forecasters < MIN_CELL))).toBe(true);
  });

  it("follow Quebec typography in French: non-breaking spaces before % and units, curly apostrophes", () => {
    const fr = sampleResults.flatMap((r) => [r.question.fr, r.source.fr]);
    expect(fr.filter((s) => / [:%»]|« |'|\d (mm|cm|%)/.test(s))).toEqual([]);
  });
});

describe("sample forecasters", () => {
  it("are deterministic and include the signed-in sample person", () => {
    expect(getForecaster(SAMPLE_ME)?.calls.length).toBeGreaterThan(10);
    const handles = sampleForecasters.map((f) => f.handle);
    expect(new Set(handles).size).toBe(handles.length);
  });

  it("only call questions that resolved after they joined", () => {
    for (const f of sampleForecasters) for (const c of f.calls) expect(c.resolvedAt >= f.joinedAt || f.handle === SAMPLE_ME).toBe(true);
  });

  it("leave at least one region below the board's minimum, for the empty state", () => {
    expect(regions.some((r) => rankForecasters(sampleForecasters, { region: r }).length < MIN_CELL)).toBe(true);
  });
});
