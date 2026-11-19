import { describe, expect, it } from "vitest";
import { initialLocale, negotiateLocale } from "@/i18n/config";
import { formatCount, formatDayHeading, formatEasternTime, formatLongDate, formatPercent, formatShortDate } from "@/lib/format";
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
  it("shows an evening Eastern timestamp on its Eastern day, not the next UTC day (LEX)", () => {
    // 9 p.m. ET on Nov 3 is 02:00 UTC on Nov 4.
    expect(formatLongDate("2026-11-04T02:00:00Z", "en")).toBe("November 3, 2026");
    expect(formatLongDate("2026-11-04T02:00:00Z", "fr")).toBe("3 novembre 2026");
    expect(formatShortDate("2026-11-04T02:00:00Z", "en")).toBe("Nov 3");
    expect(formatShortDate("2026-11-04T02:00:00Z", "fr")).toBe("3 nov.");
  });
  it("keeps a date-only string on its own day, whatever the zone", () => {
    expect(formatLongDate("2026-08-02", "en")).toBe("August 2, 2026");
    expect(formatLongDate("2026-08-02", "fr")).toBe("2 août 2026");
    expect(formatShortDate("2026-08-02", "en")).toBe("Aug 2");
  });
  it("reads a T04:59:00Z close as the end of the previous Eastern day", () => {
    expect(formatLongDate("2026-11-30T04:59:00Z", "en")).toBe("November 29, 2026");
    expect(formatLongDate("2026-11-30T04:59:00Z", "fr")).toBe("29 novembre 2026");
    expect(formatShortDate("2026-11-30T04:59:00Z", "en")).toBe("Nov 29");
    // Summer (EDT, UTC−4): 04:59 UTC is 12:59 a.m., already the same day.
    expect(formatLongDate("2026-07-15T04:59:00Z", "en")).toBe("July 15, 2026");
  });
  it("writes the first of the month as « 1er » in French, and only the first", () => {
    expect(formatLongDate("2026-11-01", "fr")).toBe("1er novembre 2026");
    expect(formatShortDate("2026-11-01", "fr")).toBe("1er nov.");
    // An Eastern evening timestamp on the first: 9 p.m. ET on Nov 1 is 01:00 UTC on Nov 2.
    expect(formatLongDate("2026-11-02T01:00:00Z", "fr")).toBe("1er novembre 2026");
    expect(formatShortDate("2026-11-02T01:00:00Z", "fr")).toBe("1er nov.");
    expect(formatDayHeading("2026-11-01T12:00:00Z", "fr")).toBe("dimanche 1er novembre");
    expect(formatEasternTime("2026-11-01T23:00:00Z", "fr")).toMatch(/^1er nov\.,\s18\sh$/u);
    // Other days stay cardinal, including 10, 11, 21 and 31.
    for (const [iso, long] of [["2026-11-10", "10 novembre 2026"], ["2026-11-11", "11 novembre 2026"], ["2026-11-21", "21 novembre 2026"], ["2026-12-31", "31 décembre 2026"]] as const) {
      expect(formatLongDate(iso, "fr")).toBe(long);
    }
    // English never takes an ordinal.
    expect(formatLongDate("2026-11-01", "en")).toBe("November 1, 2026");
    expect(formatShortDate("2026-11-01", "en")).toBe("Nov 1");
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
