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
