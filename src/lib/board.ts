import { fill } from "@/lib/text";
import { callsCloseAt, categories, crowdChange, crowdNow, isOpen, questionState, type Category, type Question, type QuestionState } from "@/lib/question";

/**
 * The Board's filters and sorts, kept pure so the server renders the first view and the browser
 * re-filters instantly with the same rules. URL params use these exact values.
 */
export const boardFilters = ["all", "open", "closingSoon", "results", "mine"] as const;
export type BoardFilter = (typeof boardFilters)[number];

export const boardSorts = ["popular", "closing", "moved"] as const;
export type BoardSort = (typeof boardSorts)[number];

/** Everything a board row needs, serializable so it can cross to the client without the whole Question. */
export type BoardRow = {
  slug: string;
  title: { en: string; fr: string };
  category: Category;
  state: QuestionState;
  crowd: number;
  change: number;
  forecasters: number;
  /** Under 50 live calls: show "<50" (see `publishedCallCount`). */
  fewCalls?: true;
  closesAt: string;
  scored: boolean;
  /** The last two weeks of the crowd's chance, for the sparkline. */
  spark: number[];
};

export function toBoardRow(q: Question, now: Date): BoardRow {
  return {
    slug: q.slug,
    title: q.question,
    category: q.category,
    state: questionState(q, now),
    crowd: crowdNow(q),
    change: crowdChange(q, 7),
    forecasters: q.forecasters,
    ...(q.fewCalls ? { fewCalls: true as const } : {}),
    closesAt: callsCloseAt(q),
    scored: q.scored,
    spark: q.history.slice(-14),
  };
}

export function matchesFilter(row: BoardRow, filter: BoardFilter, called: ReadonlySet<string>): boolean {
  switch (filter) {
    case "all":
      return true;
    case "open":
      return isOpen(row.state);
    case "closingSoon":
      return row.state === "closingSoon";
    case "results":
      return !isOpen(row.state);
    case "mine":
      return called.has(row.slug);
  }
}

export function sortRows(rows: readonly BoardRow[], sort: BoardSort): BoardRow[] {
  const copy = [...rows];
  switch (sort) {
    case "popular":
      return copy.sort((a, b) => b.forecasters - a.forecasters);
    case "moved":
      return copy.sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || b.forecasters - a.forecasters);
    case "closing":
      // Open questions first, soonest close at the top; settled questions after, most recent first.
      return copy.sort((a, b) => {
        const ao = isOpen(a.state);
        const bo = isOpen(b.state);
        if (ao !== bo) return ao ? -1 : 1;
        const d = Date.parse(a.closesAt) - Date.parse(b.closesAt);
        return ao ? d : -d;
      });
  }
}

export type BoardQuery = { filter: BoardFilter; topic: Category | "all"; sort: BoardSort };

export const defaultBoardQuery: BoardQuery = { filter: "open", topic: "all", sort: "popular" };

/** Reads ?show=&topic=&sort= leniently: anything unknown falls back to the default instead of erroring. */
export function parseBoardQuery(params: { show?: string | null; topic?: string | null; sort?: string | null }): BoardQuery {
  const pick = <T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T =>
    value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
  return {
    filter: pick(params.show, boardFilters, defaultBoardQuery.filter),
    topic: pick(params.topic, ["all", ...categories] as const, "all"),
    sort: pick(params.sort, boardSorts, defaultBoardQuery.sort),
  };
}

/** The query string for a board state, leaving defaults out so shared links stay short. */
export function boardQueryString(q: BoardQuery): string {
  const params = new URLSearchParams();
  if (q.filter !== defaultBoardQuery.filter) params.set("show", q.filter);
  if (q.topic !== "all") params.set("topic", q.topic);
  if (q.sort !== defaultBoardQuery.sort) params.set("sort", q.sort);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function applyBoardQuery(rows: readonly BoardRow[], q: BoardQuery, called: ReadonlySet<string>): BoardRow[] {
  return sortRows(
    rows.filter((r) => (q.topic === "all" || r.category === q.topic) && matchesFilter(r, q.filter, called)),
    q.sort,
  );
}

/** How many rows the Board shows at first, and how many more each "Show more" adds. */
export const BOARD_PAGE_SIZE = 20;

/**
 * One page of the filtered list: the rows to render now, how many are still hidden, and how many the next
 * "Show more" reveals. Pure, so the server and the browser agree and it's unit-tested.
 */
export function boardPage<T>(rows: readonly T[], limit: number, pageSize = BOARD_PAGE_SIZE): { visible: T[]; hidden: number; next: number } {
  const visible = rows.slice(0, Math.max(pageSize, limit));
  const hidden = rows.length - visible.length;
  return { visible, hidden, next: Math.min(hidden, pageSize) };
}

/** The Board's 7-day change strings: "1 pt" / "2 pts" in both languages, and "1 point" in the spoken label. */
export type ChangeLabels = {
  change: string;
  changeOne: string;
  noChange: string;
  changeLabel: string;
  changeLabelOne: string;
  changeDownLabel: string;
  changeDownLabelOne: string;
};

/** "+2 pts", "−1 pt" or "No change". The minus is a real minus sign. */
export function changeText(n: number, t: ChangeLabels): string {
  if (n === 0) return t.noChange;
  const size = Math.abs(n);
  return `${n > 0 ? "+" : "−"}${size === 1 ? t.changeOne : fill(t.change, { n: size })}`;
}

/** The screen-reader label for the same change: "Up 1 point over 7 days", "Down 3 points over 7 days". */
export function changeLabel(n: number, t: ChangeLabels): string {
  if (n === 0) return t.noChange;
  if (n > 0) return n === 1 ? t.changeLabelOne : fill(t.changeLabel, { up: n });
  return n === -1 ? t.changeDownLabelOne : fill(t.changeDownLabel, { down: -n });
}
