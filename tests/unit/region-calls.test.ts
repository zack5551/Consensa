import { describe, expect, it } from "vitest";
import en from "@/i18n/dictionaries/en";
import fr from "@/i18n/dictionaries/fr";
import { formatCount } from "@/lib/format";
import { parseRegionCount, regionCallsLine, regionCountUrl } from "@/lib/region-calls";

const text = (l: { before: string; n: string | null; after: string }) => `${l.before}${l.n ?? ""}${l.after}`;

describe("regionCallsLine", () => {
  it("says how many calls the region's average is built from, in English", () => {
    const line = regionCallsLine(en.call, "Ontario", 12, "en");
    expect(line.n).toBe("12");
    expect(text(line)).toBe("Your region · Ontario · average of 12 calls");
  });

  it("says it in French, with the number kept beside its noun", () => {
    const line = regionCallsLine(fr.call, "Québec", 1240, "fr");
    expect(line.n).toBe(formatCount(1240, "fr"));
    expect(text(line)).toBe(`Votre région · Québec · moyenne de ${formatCount(1240, "fr")}\u00a0prévisions`);
  });

  it("uses the singular for one call", () => {
    expect(text(regionCallsLine(en.call, "Alberta", 1, "en"))).toBe("Your region · Alberta · average of 1 call");
    expect(text(regionCallsLine(fr.call, "Alberta", 1, "fr"))).toBe("Votre région · Alberta · moyenne de 1 prévision");
  });

  it("keeps the countless wording when there is no count", () => {
    for (const count of [undefined, 0, Number.NaN, 2.5]) {
      const line = regionCallsLine(en.call, "Ontario", count, "en");
      expect(line.n).toBeNull();
      expect(text(line)).toBe("Your region · Ontario · average of calls");
    }
    expect(text(regionCallsLine(fr.call, "Ontario", undefined, "fr"))).toBe("Votre région · Ontario · moyenne des prévisions");
  });
});

describe("parseRegionCount", () => {
  it("reads one count, and treats null or anything malformed as no count", () => {
    expect(parseRegionCount({ n: 12 })).toBe(12);
    expect(parseRegionCount({ n: null })).toBeUndefined();
    expect(parseRegionCount({ n: -1 })).toBeUndefined();
    expect(parseRegionCount({ n: "12" })).toBeUndefined();
    expect(parseRegionCount(null)).toBeUndefined();
  });
  it("asks for one question and one region", () => {
    expect(regionCountUrl("boc-cut-dec-2026", "QC")).toBe("/api/crowd/region?slug=boc-cut-dec-2026&region=QC");
  });
});
