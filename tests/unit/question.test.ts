import { describe, expect, it } from "vitest";
import { SAMPLE_NOW, getQuestion, sampleQuestions, todaysFive } from "@/content/sample-questions";
import { CLOSING_SOON_MS, callsCloseAt, crowdChange, crowdVerdict, eventStart, hasStarted, nextUp, provinceExtremes, questionSchema, questionState, topicRecord, weekMove, type Question } from "@/lib/question";

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

  it("offers open questions to call next, same topic first, never itself or a closed one", () => {
    const next = nextUp(base, sampleQuestions, SAMPLE_NOW, 5);
    expect(next.length).toBe(5);
    expect(next.map((o) => o.slug)).not.toContain(base.slug);
    for (const o of next) expect(["open", "closingSoon"]).toContain(questionState(o, SAMPLE_NOW));
    const firstOther = next.findIndex((o) => o.category !== base.category);
    if (firstOther > 0) for (const o of next.slice(0, firstOther)) expect(o.category).toBe(base.category);
    if (firstOther >= 0) for (const o of next.slice(firstOther)) expect(o.category).not.toBe(base.category);
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

describe("sports start time", () => {
  const game = getQuestion("leafs-playoffs-2027")!;

  it("closes calls at the earlier of closesAt and startsAt", () => {
    expect(callsCloseAt(game)).toBe(game.closesAt);
    const early = { ...game, startsAt: "2027-04-15T00:00:00Z" };
    expect(callsCloseAt(early)).toBe("2027-04-15T00:00:00Z");
    expect(questionState(early, at("2027-04-15T00:00:01Z"))).toBe("closed");
    expect(questionState(early, at("2027-04-14T20:00:00Z"))).toBe("closingSoon");
  });

  it("ignores startsAt for other categories", () => {
    expect(callsCloseAt({ ...base, startsAt: "2020-01-01T00:00:00Z" })).toBe(base.closesAt);
  });

  it("requires startsAt on a sports question only", () => {
    const noStart: Record<string, unknown> = { ...game };
    delete noStart.startsAt;
    expect(questionSchema.safeParse(noStart).success).toBe(false);
    expect(questionSchema.safeParse({ ...noStart, category: "economy" }).success).toBe(true);
  });
});

describe("game questions", () => {
  const game = getQuestion("canadiens-leafs-nov-21-2026")!;
  const raw: Record<string, unknown> = { ...game };

  it("accepts a game as text: league, home, away and a start time, nothing else", () => {
    expect(game.game).toEqual({ league: "NHL", home: "Canadiens", away: "Maple Leafs", startsAt: "2026-11-22T00:00:00Z" });
    expect(questionSchema.safeParse(raw).success).toBe(true);
    expect(questionSchema.safeParse({ ...raw, game: { ...game.game, logo: "https://example.com/logo.png" } }).success).toBe(false);
    expect(questionSchema.safeParse({ ...raw, game: { ...game.game, startsAt: "November 21" } }).success).toBe(false);
    expect(questionSchema.safeParse({ ...raw, game: { ...game.game, home: "" } }).success).toBe(false);
  });

  it("allows a game on sports questions only, and its start must match startsAt when both are set", () => {
    expect(questionSchema.safeParse({ ...raw, category: "culture" }).success).toBe(false);
    expect(questionSchema.safeParse({ ...raw, startsAt: game.game!.startsAt }).success).toBe(true);
    expect(questionSchema.safeParse({ ...raw, startsAt: "2026-11-22T01:00:00Z" }).success).toBe(false);
  });

  it("closes calls at the start of the game at the latest", () => {
    expect(callsCloseAt(game)).toBe("2026-11-22T00:00:00Z");
    // A close time written after the start never wins: calls still stop at the start.
    const late = { ...game, closesAt: "2026-11-23T00:00:00Z" };
    expect(callsCloseAt(late)).toBe("2026-11-22T00:00:00Z");
    expect(questionState(late, at("2026-11-21T23:59:59Z"))).toBe("closingSoon");
    expect(questionState(late, at("2026-11-22T00:00:00Z"))).toBe("closed");
    // An earlier close time still applies.
    expect(callsCloseAt({ ...game, closesAt: "2026-11-21T12:00:00Z" })).toBe("2026-11-21T12:00:00Z");
  });

  it("has started from the scheduled start on, so the panel stops offering a call even on an older page", () => {
    const start = eventStart(game);
    expect(start).toBe("2026-11-22T00:00:00Z");
    expect(hasStarted(start, at("2026-11-21T23:59:59Z"))).toBe(false);
    expect(hasStarted(start, at("2026-11-22T00:00:00Z"))).toBe(true);
    expect(hasStarted(undefined, at("2030-01-01T00:00:00Z"))).toBe(false);
  });
});

describe("cancelled questions", () => {
  const cancelled = getQuestion("oilers-canucks-nov-3-2026")!;

  it("accepts cancelled as a result, and rejects anything else", () => {
    const withOutcome = (outcome: string) => ({ ...cancelled, resolution: { ...cancelled.resolution, result: { outcome, publishedAt: "2026-11-04T03:00:00Z" } } });
    for (const o of ["yes", "no", "cancelled"]) expect(questionSchema.safeParse(withOutcome(o)).success, o).toBe(true);
    expect(questionSchema.safeParse(withOutcome("postponed")).success).toBe(false);
  });

  it("has its own state, whatever the clock says, and takes no calls", () => {
    expect(questionState(cancelled, SAMPLE_NOW)).toBe("cancelled");
    expect(questionState(cancelled, at("2026-01-01T00:00:00Z"))).toBe("cancelled");
    expect(sampleQuestions.filter((q) => questionState(q, SAMPLE_NOW) === "cancelled").map((q) => q.slug)).toEqual(["oilers-canucks-nov-3-2026"]);
    expect(nextUp(base, sampleQuestions, SAMPLE_NOW, 100).map((q) => q.slug)).not.toContain(cancelled.slug);
  });

  it("is never scored: no crowd score, no verdict, and nothing added to the crowd or topic record", async () => {
    const { crowdBrier, crowdRecord } = await import("@/lib/question");
    expect(cancelled.scored).toBe(true);
    expect(crowdBrier(cancelled)).toBeNull();
    expect(crowdVerdict(cancelled)).toBeNull();
    const others = sampleQuestions.filter((q) => q.slug !== cancelled.slug);
    expect(crowdRecord(sampleQuestions)).toEqual(crowdRecord(others));
    // The same question settled NO would have counted as a miss for a crowd at 57%; cancelled counts as nothing.
    const asNo: Question = { ...cancelled, resolution: { ...cancelled.resolution, result: { outcome: "no", publishedAt: "2026-11-04T03:00:00Z", disputed: false } } };
    expect(crowdVerdict(asNo)).toBe("wrong");
    expect(crowdRecord([...others, asNo]).resolved).toBe(crowdRecord(others).resolved + 1);
    const right: Question = { ...asNo, history: [50, 30] };
    expect(topicRecord(right, [right, right, right])).toEqual({ right: 3, total: 3 });
    expect(topicRecord(right, [right, right, right, cancelled])).toEqual({ right: 3, total: 3 });
  });
});
