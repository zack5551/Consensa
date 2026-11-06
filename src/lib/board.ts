import { categories, crowdChange, crowdNow, isOpen, questionState, type Category, type Question, type QuestionState } from "@/lib/question";

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
    closesAt: q.closesAt,
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
