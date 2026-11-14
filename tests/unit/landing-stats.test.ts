import { describe, expect, it } from "vitest";
import { buildLandingStats } from "@/lib/landing-stats";

const base = {
  calls: "1,200",
  open: "9",
  labels: { forecasters: "calls", questions: "open", resolved: "resolved", calledRight: "right" },
  formatCount: (n: number) => String(n),
  formatPercent: (n: number) => `${n}%`,
};

describe("buildLandingStats", () => {
  it("shows four stats when the crowd has a record", () => {
    const { stats, columns } = buildLandingStats({ ...base, record: { resolved: 7, rightSide: 71, meanBrier: 0.2 } });
    expect(columns).toBe("lg:grid-cols-4");
    expect(stats).toEqual([["1,200", "calls"], ["9", "open"], ["7", "resolved"], ["71%", "right"]]);
  });

  it("shows only two stats, with no zero or dash, when nothing is resolved", () => {
    const { stats, columns } = buildLandingStats({ ...base, record: { resolved: 0, rightSide: null, meanBrier: null } });
    expect(columns).toBe("");
    for (const [value] of stats) expect(["0", "—"]).not.toContain(value);
    expect(stats).toEqual([["1,200", "calls"], ["9", "open"]]);
  });
});
