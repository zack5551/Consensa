import { describe, expect, it } from "vitest";
import { SAMPLE_NOW, getQuestion, sampleQuestions, todaysFive } from "@/content/sample-questions";
import { CLOSING_SOON_MS, crowdChange, provinceExtremes, questionState, type Question } from "@/lib/question";

const base = getQuestion("boc-cut-dec-2026")!;
const at = (iso: string) => new Date(iso);

describe("questionState", () => {
  it("is open well before it closes", () => {
    expect(questionState(base, at("2026-11-01T00:00:00Z"))).toBe("open");
  });

  it("is closing soon inside the window, and closed once closesAt passes", () => {
    const closes = Date.parse(base.closesAt);
    expect(questionState(base, new Date(closes - CLOSING_SOON_MS + 1000))).toBe("closingSoon");
    expect(questionState(base, new Date(closes))).toBe("closed");
  });

  it("is resolved or disputed once a result exists, whatever the clock says", () => {
    const resolved: Question = { ...base, resolution: { ...base.resolution, result: { outcome: "no", publishedAt: base.resolution.resolvesAt, disputed: false } } };
    const disputed: Question = { ...base, resolution: { ...base.resolution, result: { outcome: "no", publishedAt: base.resolution.resolvesAt, disputed: true } } };
    expect(questionState(resolved, at("2026-01-01T00:00:00Z"))).toBe("resolved");
    expect(questionState(disputed, at("2026-01-01T00:00:00Z"))).toBe("disputed");
  });
});

describe("sample data", () => {
  it("covers every state the preview needs", () => {
    const states = new Set(sampleQuestions.map((q) => questionState(q, SAMPLE_NOW)));
    for (const s of ["open", "closingSoon", "closed", "resolved"] as const) expect(states.has(s), s).toBe(true);
  });

  it("closes every question before its result is published", () => {
    for (const q of sampleQuestions) expect(Date.parse(q.closesAt), q.slug).toBeLessThan(Date.parse(q.resolution.resolvesAt));
  });

  it("puts five open questions in today's five", () => {
    const five = todaysFive();
    expect(five).toHaveLength(5);
    for (const q of five) expect(["open", "closingSoon"]).toContain(questionState(q, SAMPLE_NOW));
  });
});

describe("helpers", () => {
  it("measures the 7-day change in whole points", () => {
    const q: Question = { ...base, history: [10, 20, 30, 40, 50, 60, 70, 80, 90] };
    expect(crowdChange(q)).toBe(70);
    expect(crowdChange({ ...base, history: [40, 40] })).toBe(0);
  });

  it("finds the highest and lowest regions", () => {
    expect(provinceExtremes(base.provinces)).toEqual({ high: "AB", low: "QC" });
  });
});
