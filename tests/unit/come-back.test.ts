import { describe, expect, it } from "vitest";
import { sampleQuestions } from "@/content/sample-questions";
import {
  answeredQuestions,
  compareWithCanada,
  localizedAnswered,
  monthKey,
  monthRecap,
  newestAnswer,
  previousMonth,
  recapMonths,
  unseenAnswers,
  withCalls,
  type AnsweredQuestion,
} from "@/lib/come-back";
import { FIXED_TEST_NOW } from "@/lib/clock";

const q = (over: Partial<AnsweredQuestion> & Pick<AnsweredQuestion, "slug">): AnsweredQuestion => ({
  category: "economy",
  outcome: "no",
  publishedAt: "2026-10-15T14:00:00Z",
  crowd: 40,
  ...over,
});

describe("answeredQuestions", () => {
  const answered = answeredQuestions(sampleQuestions, FIXED_TEST_NOW);
  it("keeps scored questions with a yes or no answer that isn't under review", () => {
    const slugs = answered.map((a) => a.slug);
    expect(slugs).toContain("cpi-sept-2026");
    expect(slugs).toContain("mtl-snow-oct-2026");
    expect(slugs).not.toContain("box-office-oct-2026"); // disputed
    expect(slugs).not.toContain("boc-cut-dec-2026"); // open
  });
  it("carries the official answer and when it was published", () => {
    expect(answered.find((a) => a.slug === "cpi-sept-2026")).toMatchObject({ outcome: "yes", publishedAt: "2026-10-21T12:30:00Z" });
  });
  it("adds the text and page in one language", () => {
    const fr = localizedAnswered(sampleQuestions, "fr", FIXED_TEST_NOW).find((a) => a.slug === "cpi-sept-2026");
    expect(fr?.href).toBe("/fr/q/cpi-sept-2026");
    expect(fr?.question).toMatch(/inflation/);
  });
});

describe("withCalls", () => {
  it("keeps only questions this browser called, with the verdict", () => {
    const calls = withCalls([q({ slug: "a" }), q({ slug: "b", outcome: "yes" }), q({ slug: "c" })], { a: 30, b: 30 });
    expect(calls.map((c) => [c.slug, c.verdict])).toEqual([["a", "calledIt"], ["b", "missed"]]);
  });
});

describe("unseenAnswers", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  const calls = withCalls([q({ slug: "old", publishedAt: "2026-09-01T12:00:00Z" }), q({ slug: "mid", publishedAt: "2026-11-01T12:00:00Z" }), q({ slug: "new", publishedAt: "2026-11-17T02:00:00Z" })], { old: 20, mid: 20, new: 20 });

  it("shows answers published after the last one shown, newest first", () => {
    expect(unseenAnswers(calls, "2026-11-01T12:00:00Z", now).map((c) => c.slug)).toEqual(["new"]);
  });
  it("shows nothing once the newest answer has been shown", () => {
    expect(unseenAnswers(calls, newestAnswer(calls), now)).toEqual([]);
  });
  it("on a first visit, only digs back 30 days", () => {
    expect(unseenAnswers(calls, null, now).map((c) => c.slug)).toEqual(["new", "mid"]);
  });
});

describe("compareWithCanada", () => {
  it("compares mean Brier on questions with a real crowd number", () => {
    const calls = withCalls([q({ slug: "a", crowd: 40 }), q({ slug: "b", crowd: null })], { a: 30, b: 90 });
    const c = compareWithCanada(calls);
    expect(c?.n).toBe(1);
    expect(c?.you).toBeCloseTo(0.09, 10);
    expect(c?.crowd).toBeCloseTo(0.16, 10);
    expect(c?.lean).toBe("sharper");
  });
  it("is level when the difference rounds away", () => {
    const calls = withCalls([q({ slug: "a", crowd: 30 })], { a: 30 });
    expect(compareWithCanada(calls)?.lean).toBe("level");
  });
  it("is null with no real crowd numbers", () => {
    expect(compareWithCanada(withCalls([q({ slug: "a", crowd: null })], { a: 30 }))).toBeNull();
  });
});

describe("months", () => {
  it("uses the Eastern calendar", () => {
    // 1 a.m. UTC on Nov 1 is still Oct 31 in Toronto.
    expect(monthKey("2026-11-01T01:00:00Z")).toBe("2026-10");
    expect(monthKey("2026-11-01T17:00:00Z")).toBe("2026-11");
  });
  it("finds the previous month, across a new year", () => {
    expect(previousMonth(new Date("2026-11-06T12:00:00Z"))).toBe("2026-10");
    expect(previousMonth(new Date("2027-01-10T12:00:00Z"))).toBe("2026-12");
  });
  it("lists finished months that had an answer", () => {
    const answered = [q({ slug: "a", publishedAt: "2026-09-20T12:00:00Z" }), q({ slug: "b", publishedAt: "2026-10-20T12:00:00Z" }), q({ slug: "c", publishedAt: "2026-11-02T12:00:00Z" })];
    expect(recapMonths(answered, new Date("2026-11-06T12:00:00Z"))).toEqual(["2026-09", "2026-10"]);
  });
});

describe("monthRecap", () => {
  const month = [
    q({ slug: "w1", category: "weather", outcome: "yes", publishedAt: "2026-10-01T12:00:00Z", crowd: 58 }),
    q({ slug: "w2", category: "weather", outcome: "yes", publishedAt: "2026-10-02T12:00:00Z", crowd: 55 }),
    q({ slug: "e1", outcome: "yes", publishedAt: "2026-10-09T12:00:00Z", crowd: 52 }),
    q({ slug: "c1", category: "culture", outcome: "yes", publishedAt: "2026-10-14T12:00:00Z", crowd: 34 }),
    q({ slug: "e2", outcome: "no", publishedAt: "2026-10-28T14:00:00Z", crowd: 80 }),
    q({ slug: "nov", outcome: "no", publishedAt: "2026-11-06T13:30:00Z" }),
  ];
  const calls = withCalls(month, { w1: 70, w2: 60, e1: 55, c1: 30, e2: 75, nov: 40 });
  const recap = monthRecap(calls, "2026-10")!;

  it("counts the month's calls on the right side, oldest first", () => {
    expect(recap.calls.map((c) => c.slug)).toEqual(["w1", "w2", "e1", "c1", "e2"]);
    expect(recap.calledIt).toBe(3);
  });
  it("names the best call, the toughest miss, the best run and the strongest topic", () => {
    expect(recap.best?.slug).toBe("w1");
    expect(recap.toughest?.slug).toBe("e2");
    expect(recap.bestRun).toBe(3);
    expect(recap.topic).toEqual({ category: "weather", calledIt: 2, count: 2 });
  });
  it("is null for a month with no answered calls", () => {
    expect(monthRecap(calls, "2026-08")).toBeNull();
  });
});
