import { describe, expect, it } from "vitest";
import { initialLocale, negotiateLocale } from "@/i18n/config";
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

describe("initialLocale", () => {
  it("keeps a saved choice", () => {
    expect(initialLocale({ saved: "en", acceptLanguage: "fr-CA", country: "CA", region: "QC" })).toBe("en");
  });
  it("puts French first for visitors in Quebec", () => {
    expect(initialLocale({ acceptLanguage: "en-CA,en;q=0.9", country: "CA", region: "QC" })).toBe("fr");
  });
  it("follows the browser elsewhere", () => {
    expect(initialLocale({ acceptLanguage: "en-CA", country: "CA", region: "ON" })).toBe("en");
    expect(initialLocale({ acceptLanguage: "fr-CA", country: "CA", region: "ON" })).toBe("fr");
    expect(initialLocale({ acceptLanguage: "en-US", country: "US", region: "QC" })).toBe("en");
    expect(initialLocale({ acceptLanguage: null })).toBe("en");
  });
});
