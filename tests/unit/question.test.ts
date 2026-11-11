import { describe, expect, it } from "vitest";
import { SAMPLE_NOW, getQuestion, sampleQuestions, todaysFive } from "@/content/sample-questions";
import { CLOSING_SOON_MS, crowdChange, crowdVerdict, provinceExtremes, questionState, topicRecord, weekMove, type Question } from "@/lib/question";

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

  it("states the week's move only once a week of history exists", () => {
    expect(weekMove({ ...base, history: [40, 41, 42, 43, 44, 45, 46] })).toBeNull();
    expect(weekMove({ ...base, history: [40, 40, 40, 40, 40, 40, 40, 44] })).toEqual({ direction: "up", points: 4 });
    expect(weekMove({ ...base, history: [50, 50, 50, 50, 50, 50, 50, 49] })).toEqual({ direction: "down", points: 1 });
    expect(weekMove({ ...base, history: [30, 90, 10, 30, 30, 30, 30, 30] })).toEqual({ direction: "flat", points: 0 });
  });

  it("says whether the crowd leaned the right way, only for undisputed scored results", () => {
    const settle = (history: number[], outcome: "yes" | "no", extra: Partial<Question> = {}, disputed = false): Question => ({
      ...base,
      ...extra,
      history,
      resolution: { ...base.resolution, result: { outcome, publishedAt: base.resolution.resolvesAt, disputed } },
    });
    expect(crowdVerdict(base)).toBeNull();
    expect(crowdVerdict(settle([50, 70], "yes"))).toBe("right");
    expect(crowdVerdict(settle([50, 30], "yes"))).toBe("wrong");
    expect(crowdVerdict(settle([40, 50], "no"))).toBe("split");
    expect(crowdVerdict(settle([50, 70], "yes", {}, true))).toBeNull();
    expect(crowdVerdict(settle([50, 70], "yes", { scored: false }))).toBeNull();

    const right = settle([50, 70], "yes");
    expect(topicRecord(right, [right, right])).toBeNull();
    expect(topicRecord(right, [right, right, settle([50, 30], "yes"), base])).toEqual({ right: 2, total: 3 });
    expect(topicRecord(right, [right, right, settle([50, 70], "yes", { category: "weather" })])).toBeNull();
  });

  it("finds the highest and lowest regions", () => {
    expect(provinceExtremes(base.provinces)).toEqual({ high: "AB", low: "QC" });
  });
});

describe("crowd record", () => {
  it("scores the crowd only on resolved, undisputed, scored questions", async () => {
    const { crowdBrier, crowdRecord } = await import("@/lib/question");
    expect(crowdBrier(getQuestion("cpi-sept-2026")!)).toBeCloseTo((0.71 - 1) ** 2);
    expect(crowdBrier(getQuestion("box-office-oct-2026")!)).toBeNull();
    expect(crowdBrier(getQuestion("boc-cut-dec-2026")!)).toBeNull();
    const record = crowdRecord(sampleQuestions);
    // cpi-sept, boc-hold-oct, mtl-snow, plus boc-cut-oct from the extra questions.
    expect(record.resolved).toBe(4);
    expect(record.rightSide).toBe(100);
  });
});
