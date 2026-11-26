import { describe, expect, it } from "vitest";
import { SAMPLE_NOW, sampleQuestions } from "@/content/sample-questions";
import { applyBoardQuery, BOARD_PAGE_SIZE, boardPage, boardQueryString, changeLabel, changeText, parseBoardQuery, sortRows, toBoardRow, type BoardRow } from "@/lib/board";
import en from "@/i18n/dictionaries/en";
import fr from "@/i18n/dictionaries/fr";

const rows = sampleQuestions.map((q) => toBoardRow(q, SAMPLE_NOW));

function row(partial: Partial<BoardRow>): BoardRow {
  return { slug: "x", title: { en: "x", fr: "x" }, category: "economy", state: "open", crowd: 50, change: 0, forecasters: 0, closesAt: "2026-12-01T00:00:00Z", scored: true, spark: [50, 50], heat: 0, day: 0, ...partial };
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
    expect(parseBoardQuery({ show: "everything", topic: "politics", sort: "random" })).toEqual({ filter: "open", topic: "all", sort: "hot" });
  });
  it("round-trips and leaves defaults out of the URL", () => {
    const q = parseBoardQuery({ show: "results", topic: "housing", sort: "moved" });
    expect(boardQueryString(q)).toBe("?show=results&topic=housing&sort=moved");
    expect(boardQueryString(parseBoardQuery({}))).toBe("");
  });
});

describe("7-day change text", () => {
  it("says 1 pt and 2 pts, with a real minus sign", () => {
    expect(changeText(1, en.board)).toBe("+1 pt");
    expect(changeText(-1, en.board)).toBe("−1 pt");
    expect(changeText(2, en.board)).toBe("+2 pts");
    expect(changeText(-14, en.board)).toBe("−14 pts");
    expect(changeText(0, en.board)).toBe("No change");
    expect(changeText(1, fr.board)).toBe("+1 pt");
    expect(changeText(-3, fr.board)).toBe("−3 pts");
    expect(changeText(0, fr.board)).toBe("Aucune variation");
  });

  it("speaks 1 point and 2 points in the screen-reader label", () => {
    expect(changeLabel(1, en.board)).toBe("Up 1 point over 7 days");
    expect(changeLabel(-1, en.board)).toBe("Down 1 point over 7 days");
    expect(changeLabel(5, en.board)).toBe("Up 5 points over 7 days");
    expect(changeLabel(-2, en.board)).toBe("Down 2 points over 7 days");
    expect(changeLabel(1, fr.board)).toBe("En hausse de 1 point sur 7 jours");
    expect(changeLabel(-2, fr.board)).toBe("En baisse de 2 points sur 7 jours");
  });
});

describe("show more", () => {
  const list = Array.from({ length: 45 }, (_, i) => i);
  it("shows the first page and says how many the next click adds", () => {
    const p = boardPage(list, BOARD_PAGE_SIZE);
    expect(p.visible).toHaveLength(BOARD_PAGE_SIZE);
    expect(p.hidden).toBe(45 - BOARD_PAGE_SIZE);
    expect(p.next).toBe(BOARD_PAGE_SIZE);
  });
  it("the last click adds only what's left, then nothing is hidden", () => {
    expect(boardPage(list, 40).next).toBe(5);
    expect(boardPage(list, 60)).toMatchObject({ hidden: 0, next: 0 });
    expect(boardPage(list, 60).visible).toHaveLength(45);
  });
  it("a short list is shown whole, and a limit below one page still shows a full page", () => {
    expect(boardPage(list.slice(0, 7), BOARD_PAGE_SIZE)).toMatchObject({ hidden: 0, next: 0 });
    expect(boardPage(list, 3).visible).toHaveLength(BOARD_PAGE_SIZE);
  });
  it("has EN and FR labels with the count placeholders", () => {
    for (const t of [en, fr]) {
      expect(t.board.showMore).toContain("{n}");
      expect(t.board.showingOf).toContain("{shown}");
      expect(t.board.showingOf).toContain("{n}");
    }
  });
});
