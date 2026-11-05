import { describe, expect, it } from "vitest";
import { negotiateLocale } from "@/i18n/config";
import { formatCount, formatPercent } from "@/lib/format";
import { fill } from "@/lib/text";

describe("negotiateLocale", () => {
  it("defaults to English", () => {
    expect(negotiateLocale(null)).toBe("en");
    expect(negotiateLocale("de-DE,de;q=0.9")).toBe("en");
  });
  it("picks French when preferred", () => {
    expect(negotiateLocale("fr-CA,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(negotiateLocale("en-CA,en;q=0.9,fr;q=0.8")).toBe("en");
  });
});

describe("formatting", () => {
  it("formats percent per locale", () => {
    expect(formatPercent(38, "en")).toBe("38%");
    expect(formatPercent(38, "fr")).toMatch(/^38\s%$/u);
  });
  it("formats counts per locale", () => {
    expect(formatCount(18420, "en")).toBe("18,420");
    expect(formatCount(18420, "fr")).toMatch(/^18\s420$/u);
  });
  it("fills placeholders and leaves unknown ones visible", () => {
    expect(fill("{a} and {b}", { a: 1 })).toBe("1 and {b}");
  });
});
