import { describe, expect, it } from "vitest";
import { SAMPLE_NOW, sampleQuestions } from "@/content/sample-questions";
import { applyBoardQuery, boardQueryString, parseBoardQuery, sortRows, toBoardRow, type BoardRow } from "@/lib/board";

const rows = sampleQuestions.map((q) => toBoardRow(q, SAMPLE_NOW));

function row(partial: Partial<BoardRow>): BoardRow {
  return { slug: "x", title: { en: "x", fr: "x" }, category: "economy", state: "open", crowd: 50, change: 0, forecasters: 0, closesAt: "2026-12-01T00:00:00Z", scored: true, spark: [50, 50], ...partial };
}

describe("board rows", () => {
  it("are built from every sample question with a two-week sparkline", () => {
    expect(rows).toHaveLength(sampleQuestions.length);
    for (const r of rows) expect(r.spark.length).toBeLessThanOrEqual(14);
  });
});

describe("filters", () => {
  const none = new Set<string>();
  it("open keeps open and closing-soon questions only", () => {
    const open = applyBoardQuery(rows, { filter: "open", topic: "all", sort: "popular" }, none);
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((r) => r.state === "open" || r.state === "closingSoon")).toBe(true);
  });
  it("results keeps closed, resolved and disputed questions", () => {
    const results = applyBoardQuery(rows, { filter: "results", topic: "all", sort: "popular" }, none);
    expect(results.map((r) => r.state).sort()).toEqual(results.map((r) => r.state).filter((s) => s !== "open" && s !== "closingSoon").sort());
    expect(results.length).toBeGreaterThan(0);
  });
  it("your calls shows only questions you've called", () => {
    const mine = applyBoardQuery(rows, { filter: "mine", topic: "all", sort: "popular" }, new Set(["boc-cut-dec-2026"]));
    expect(mine.map((r) => r.slug)).toEqual(["boc-cut-dec-2026"]);
  });
  it("topic narrows to one category", () => {
    const weather = applyBoardQuery(rows, { filter: "all", topic: "weather", sort: "popular" }, none);
    expect(weather.length).toBeGreaterThan(0);
    expect(weather.every((r) => r.category === "weather")).toBe(true);
  });
});

describe("sorts", () => {
  it("biggest moves ranks by size of change, either direction", () => {
    const sorted = sortRows([row({ slug: "a", change: 3 }), row({ slug: "b", change: -9 }), row({ slug: "c", change: 5 })], "moved");
    expect(sorted.map((r) => r.slug)).toEqual(["b", "c", "a"]);
  });
  it("closing soonest puts open questions first, then the most recently settled", () => {
    const sorted = sortRows(
      [
        row({ slug: "late", closesAt: "2027-01-01T00:00:00Z" }),
        row({ slug: "settledOld", state: "resolved", closesAt: "2026-09-01T00:00:00Z" }),
        row({ slug: "soon", state: "closingSoon", closesAt: "2026-11-07T00:00:00Z" }),
        row({ slug: "settledNew", state: "closed", closesAt: "2026-11-01T00:00:00Z" }),
      ],
      "closing",
    );
    expect(sorted.map((r) => r.slug)).toEqual(["soon", "late", "settledNew", "settledOld"]);
  });
});

describe("URL state", () => {
  it("falls back to defaults for unknown values", () => {
    expect(parseBoardQuery({ show: "everything", topic: "politics", sort: "random" })).toEqual({ filter: "open", topic: "all", sort: "popular" });
  });
  it("round-trips and leaves defaults out of the URL", () => {
    const q = parseBoardQuery({ show: "results", topic: "housing", sort: "moved" });
    expect(boardQueryString(q)).toBe("?show=results&topic=housing&sort=moved");
    expect(boardQueryString(parseBoardQuery({}))).toBe("");
  });
});
