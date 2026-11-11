import { describe, expect, it } from "vitest";
import { provinceSummary } from "@/lib/province-summary";

const t = {
  summary: "Highest in {high} at {highValue}, lowest in {low} at {lowValue}.",
  notEnough: "Not enough calls yet.",
  names: { BC: "BC", AB: "Alberta", PR: "Prairies", ON: "Ontario", QC: "Quebec", AT: "Atlantic" },
};
const pct = (v: number) => `${v}%`;
const provinces = { BC: 70, AB: 10, PR: 30, ON: 40, QC: 50, AT: 20 };

describe("provinceSummary", () => {
  it("names the highest and lowest region", () => {
    expect(provinceSummary({ provinces }, t, pct)).toBe("Highest in BC at 70%, lowest in Alberta at 10%.");
  });
  it("skips hidden regions", () => {
    expect(provinceSummary({ provinces, hiddenProvinces: ["BC", "AB"] }, t, pct)).toBe("Highest in Quebec at 50%, lowest in Atlantic at 20%.");
  });
  it("says so when fewer than two regions can be shown", () => {
    expect(provinceSummary({ provinces, hiddenProvinces: ["BC", "AB", "PR", "ON", "QC"] }, t, pct)).toBe("Not enough calls yet.");
  });
});
