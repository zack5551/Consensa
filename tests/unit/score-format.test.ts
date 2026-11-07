import { describe, expect, it } from "vitest";
import { formatBrier, formatOneDecimal, formatSignedPoints, formatSignedSkill, formatSkill } from "@/lib/score-format";

describe("score formatting", () => {
  it("formats Brier scores to three decimals per locale", () => {
    expect(formatBrier(0.1314, "en")).toBe("0.131");
    expect(formatBrier(0.1314, "fr")).toBe("0,131");
  });
  it("formats skill unsigned and signed with a true minus", () => {
    expect(formatSkill(-0.258, "en")).toBe("26%");
    expect(formatSignedSkill(0.258, "en")).toBe("+26%");
    expect(formatSignedSkill(-0.08, "en")).toBe("−8%");
    expect(formatSignedSkill(0.001, "en")).toBe("0%");
    expect(formatSignedSkill(-0.08, "fr")).toMatch(/^−8\s%$/u);
  });
  it("formats signed points and one-decimal averages", () => {
    expect(formatSignedPoints(9.2, "en")).toBe("+9");
    expect(formatSignedPoints(-4, "fr")).toBe("−4");
    expect(formatSignedPoints(0, "en")).toBe("0");
    expect(formatOneDecimal(2.43, "fr")).toBe("2,4");
  });
});
