import { describe, expect, it } from "vitest";
import { validateDraft } from "@/engine/validate";
import { goodDraft, NOW } from "./helpers";

const codes = (d: ReturnType<typeof goodDraft>) => validateDraft(d, NOW).map((f) => `${f.severity}:${f.code}`);

describe("validateDraft", () => {
  it("passes a clean draft", () => expect(codes(goodDraft())).toEqual([]));

  it("needs at least a day to make a call, and a close before the answer", () => {
    expect(codes(goodDraft({ closesAt: "2026-11-06T18:00:00Z" }))).toContain("block:closesTooSoon");
    const d = goodDraft();
    expect(codes({ ...d, resolution: { ...d.resolution, resolvesAt: "2026-12-04T12:00:00Z" } })).toContain("block:closesAfterResult");
    expect(codes(goodDraft({ closesAt: "2028-01-01T00:00:00Z" }))).toContain("block:closesTooLate");
  });

  it("lets a whole-season sports question run while the season is underway, closing 7+ days before the last game (LEX, 2026-11-26)", () => {
    const d = goodDraft({ category: "sports" });
    const season = (closesAt: string, over: Partial<typeof d> = {}) =>
      codes({ ...d, closesAt, startsAt: "2027-04-15T23:00:00Z", season: true, resolution: { ...d.resolution, resolvesAt: "2027-04-18T12:00:00Z" }, ...over });
    expect(season("2027-04-08T23:00:00Z").filter((c) => c.startsWith("block:"))).toEqual([]);
    expect(season("2027-04-10T23:00:00Z")).toContain("block:seasonClosesLate");
    // A season question dated from opening day, as the writer did for Montréal vs Toronto: the hint says what to do.
    const opener = validateDraft({ ...d, startsAt: "2026-10-07T23:00:00Z" }, NOW).find((f) => f.code === "sportsClosesAfterStart");
    expect(opener?.detail).toContain("whole season");
    expect(season("2027-04-08T23:00:00Z", { question: { en: "Will the Oilers win tonight?", fr: "Les Oilers gagneront-ils ce soir?" } })).toContain("block:sportsLive");
    expect(codes(goodDraft({ question: { en: "Will a live album top the chart?", fr: "Un album en direct sera-t-il premier?" } }))).not.toContain("block:sportsLive");
  });

  it("needs a start time for sports, and calls close no later than it", () => {
    const sports = (over: Partial<ReturnType<typeof goodDraft>>) => codes(goodDraft({ category: "sports", ...over }));
    expect(sports({})).toContain("block:sportsNoStart");
    expect(sports({ startsAt: "2026-12-04T13:00:00Z" })).not.toContain("block:sportsNoStart");
    expect(sports({ startsAt: "2026-12-04T13:00:00Z" })).not.toContain("block:sportsClosesAfterStart");
    expect(sports({ startsAt: "2026-12-05T01:00:00Z" })).not.toContain("block:sportsClosesAfterStart");
    expect(sports({ startsAt: "2026-12-04T12:59:00Z" })).toContain("block:sportsClosesAfterStart");
    expect(sports({ startsAt: "2026-12-04T13:45:00Z" })).toContain("block:sportsStartsAfterResult");
    expect(codes(goodDraft())).not.toContain("block:sportsNoStart");
  });

  it("only takes official sources over https", () => {
    const d = goodDraft();
    expect(codes({ ...d, resolution: { ...d.resolution, source: { ...d.resolution.source, url: "https://www.cbc.ca/news" } } })).toContain("block:sourceNotOfficial");
  });

  it("enforces question marks, one question, and Quebec typography", () => {
    expect(codes(goodDraft({ question: { en: "Canada's unemployment rate in November 2026", fr: "Le chômage en novembre 2026?" } }))).toContain("block:questionMark.en");
    expect(codes(goodDraft({ question: { en: "Will it be 7%? Or 8%?", fr: "Sera-t-il de 7 %?" } }))).toContain("block:oneQuestion.en");
    expect(codes(goodDraft({ question: { en: "Will it be 7% in November 2026?", fr: "Sera-t-il de 7 % en novembre 2026 ?" } }))).toContain("block:frTypography");
  });

  it("flags EN and FR carrying different numbers", () => {
    expect(codes(goodDraft({ question: { en: "Will it be 7% or higher in November 2026?", fr: "Sera-t-il de 8 % ou plus en novembre 2026?" } }))).toContain("review:numbersDiffer.question");
  });

  it("checks the resolver against the dates and the rule", () => {
    expect(codes(goodDraft({ resolver: { kind: "boc-policy-rate", decisionDate: "2026-12-10", direction: "cut" } }))).toContain("block:resolverAfterResult");
    expect(codes(goodDraft({ resolver: { kind: "statcan-vector", vectorId: 2062815, refPeriod: "2026-11", comparator: ">=", threshold: 7.5, unit: "%" } }))).toContain(
      "review:thresholdNotInRule",
    );
    expect(codes(goodDraft({ resolver: { kind: "manual", check: "Winner on the prize site" } }))).toContain("review:manualResolver");
  });
});

describe("draftSchema source link (AEGIS)", () => {
  it("accepts only https", async () => {
    const { draftSchema } = await import("@/engine/types");
    const d = goodDraft();
    expect(draftSchema.safeParse(d).success).toBe(true);
    for (const url of ["javascript:alert(1)", "data:text/html,hi", "http://example.ca/"]) {
      expect(draftSchema.safeParse({ ...d, resolution: { ...d.resolution, source: { ...d.resolution.source, url } } }).success).toBe(false);
    }
  });
});
