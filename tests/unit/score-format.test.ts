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

describe("formatDayHeading", () => {
  it("uses the Eastern calendar day when asked, not UTC", async () => {
    const { formatDayHeading } = await import("@/lib/format");
    // 11:30 p.m. ET Monday Nov 16 is already Tuesday in UTC.
    const iso = "2026-11-17T04:30:00Z";
    expect(formatDayHeading(iso, "en", "America/Toronto")).toBe("Monday, November 16");
    expect(formatDayHeading(iso, "fr", "America/Toronto")).toBe("lundi 16 novembre");
    expect(formatDayHeading(iso, "en")).toBe("Tuesday, November 17");
  });
});
