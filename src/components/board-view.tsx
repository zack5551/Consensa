"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { EmptyState } from "@/components/empty-state";
import { Sparkline } from "@/components/sparkline";
import { StateBadge } from "@/components/state-badge";
import { YourCallBadge } from "@/components/your-call-badge";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { track } from "@/lib/analytics";
import { applyBoardQuery, boardFilters, boardQueryString, boardSorts, defaultBoardQuery, parseBoardQuery, type BoardQuery, type BoardRow } from "@/lib/board";
import { readAllCalls, subscribeCalls } from "@/lib/calls-store";
import { formatCount, formatPercent, formatShortDate } from "@/lib/format";
import { categories, isOpen, type Category } from "@/lib/question";
import { fill } from "@/lib/text";

export type BoardStrings = {
  board: Dictionary["board"];
  browse: Pick<Dictionary["browse"], "sortLabel" | "sorts" | "shown" | "shownOne" | "tableCaption">;
  states: Dictionary["states"];
  question: Pick<Dictionary["question"], "poll" | "yourCall" | "canadaSays">;
};

type Props = {
  rows: readonly BoardRow[];
  locale: Locale;
  t: BoardStrings;
  /** On a category board the topic is fixed and its chips are hidden. */
  fixedTopic?: Category;
  /** Where "Start with today's five" points in the empty "your calls" state. */
  todayHref: string;
};

/**
 * The dense board: filter, topic and sort, all reflected in the URL so a view can be shared.
 * Desktop gets a scannable table; phones get compact rows with the same information in the same order.
 */
export function BoardView({ rows, locale, t, fixedTopic, todayHref }: Props) {
  const [query, setQuery] = useState<BoardQuery>({ ...defaultBoardQuery, topic: fixedTopic ?? "all" });
  const ids = useId();

  // Read ?show=&topic=&sort= after hydration so the page itself stays static and fast.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const q = parseBoardQuery({ show: p.get("show"), topic: p.get("topic"), sort: p.get("sort") });
    setQuery(fixedTopic ? { ...q, topic: fixedTopic } : q);
  }, [fixedTopic]);

  const slugs = useMemo(() => rows.map((r) => r.slug), [rows]);
  const callsKey = useSyncExternalStore(
    subscribeCalls,
    () => Object.keys(readAllCalls(slugs)).sort().join(","),
    () => "",
  );
  const called = useMemo(() => new Set(callsKey ? callsKey.split(",") : []), [callsKey]);

  const shown = useMemo(() => applyBoardQuery(rows, query, called), [rows, query, called]);

  function update(next: Partial<BoardQuery>) {
    const q = { ...query, ...next, ...(fixedTopic ? { topic: fixedTopic } : {}) };
    setQuery(q);
    const qs = boardQueryString(fixedTopic ? { ...q, topic: "all" } : q);
    window.history.replaceState(null, "", `${window.location.pathname}${qs}`);
    track("board_filtered", { locale, filter: q.filter, topic: q.topic });
  }

  const pct = (v: number) => formatPercent(v, locale);
  const count = shown.length === 1 ? t.browse.shownOne : fill(t.browse.shown, { n: formatCount(shown.length, locale) });
  const changeText = (n: number) => (n === 0 ? t.board.noChange : `${n > 0 ? "+" : "−"}${fill(t.board.change, { n: Math.abs(n) })}`);
  const changeLabel = (n: number) => (n === 0 ? t.board.noChange : n > 0 ? fill(t.board.changeLabel, { up: n }) : fill(t.board.changeDownLabel, { down: Math.abs(n) }));
  const href = (slug: string) => `/${locale}/q/${slug}`;

  return (
    <div className="grid gap-5">
      {/* Toolbar */}
      <div className="grid gap-3">
        <div role="group" aria-labelledby={`${ids}-show`} className="flex flex-wrap items-center gap-2">
          <span id={`${ids}-show`} className="sr-only">
            {t.board.filterLabel}
          </span>
          {boardFilters.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={query.filter === f}
              onClick={() => update({ filter: f })}
              className="min-h-10 rounded-full border border-line px-4 py-1.5 text-body-sm font-semibold text-ink-2 transition-colors duration-[var(--cn-duration-fast)] hover:bg-sunken aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper"
            >
              {t.board.filters[f]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          {!fixedTopic ? (
            <div role="group" aria-labelledby={`${ids}-topic`} className="flex min-w-0 flex-wrap items-center gap-2">
              <span id={`${ids}-topic`} className="text-caption font-semibold uppercase tracking-wide text-ink-2">
                {t.board.topicLabel}
              </span>
              {(["all", ...categories] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={query.topic === c}
                  onClick={() => update({ topic: c })}
                  className="min-h-8 rounded-full bg-sunken px-3 py-1 text-caption font-semibold text-ink-2 transition-colors duration-[var(--cn-duration-fast)] hover:text-ink aria-pressed:bg-side-a-soft aria-pressed:text-side-a-text"
                >
                  {c === "all" ? t.board.allTopics : t.board.categories[c]}
                </button>
              ))}
            </div>
          ) : (
            <span />
          )}
          <label className="flex items-center gap-2 text-body-sm text-ink-2">
            {t.browse.sortLabel}
            <select
              value={query.sort}
              onChange={(e) => update({ sort: e.target.value as BoardQuery["sort"] })}
              className="min-h-10 rounded-control border border-control bg-surface px-3 py-1.5 text-body-sm font-semibold text-ink"
            >
              {boardSorts.map((s) => (
                <option key={s} value={s}>
                  {t.browse.sorts[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="m-0 text-caption text-ink-2" aria-live="polite">
          {count}
        </p>
      </div>

      {shown.length === 0 ? (
        query.filter === "mine" ? (
          <EmptyState
            title={t.board.emptyMineTitle}
            body={t.board.emptyMineBody}
            action={
              <Link href={todayHref} className="rounded-control bg-ink px-4 py-2 text-body-sm font-bold text-paper hover:opacity-90">
                {t.board.emptyMineAction}
              </Link>
            }
          />
        ) : (
          <EmptyState
            title={t.board.emptyTitle}
            body={t.board.emptyBody}
            action={
              <button type="button" onClick={() => update({ filter: "all", topic: "all" })} className="rounded-control bg-ink px-4 py-2 text-body-sm font-bold text-paper hover:opacity-90">
                {t.board.emptyAction}
              </button>
            }
          />
        )
      ) : (
        <>
          {/* Desktop and tablet: a real table, scannable by column. */}
          <div className="hidden border-t-2 border-ink md:block">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">{t.browse.tableCaption}</caption>
              <thead>
                <tr className="border-b border-line text-caption uppercase tracking-wide text-ink-2">
                  <th scope="col" className="py-3 pl-0 pr-4 font-semibold">{t.board.columns.question}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t.board.columns.canada}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t.board.columns.change}</th>
                  <th scope="col" className="hidden px-4 py-3 text-right font-semibold lg:table-cell">{t.board.columns.forecasters}</th>
                  <th scope="col" className="py-3 pl-4 pr-0 text-right font-semibold">{t.board.columns.closes}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.slug} className="group relative border-b border-line">
                    <th scope="row" className="max-w-[28rem] py-3 pl-0 pr-4 text-left align-top font-normal">
                      <span className="mb-1 flex flex-wrap items-center gap-2">
                        <StateBadge state={r.state} label={t.states[r.state]} />
                        <span className="text-caption text-ink-2">{t.board.categories[r.category]}</span>
                        {!r.scored && <span className="rounded-full bg-side-b-soft px-2 py-0.5 text-caption text-side-b-text">{t.question.poll}</span>}
                        <YourCallBadge slug={r.slug} template={t.question.yourCall} format={locale} />
                      </span>
                      <Link href={href(r.slug)} className="font-display text-body font-bold leading-snug text-balance text-ink after:absolute after:inset-0 hover:underline focus-visible:underline">
                        {r.title[locale]}
                      </Link>
                    </th>
                    <td className="px-4 py-3 align-middle">
                      <span className="flex items-center gap-3">
                        <span className={`w-14 font-display text-title-sm font-bold tabular ${isOpen(r.state) ? "text-ink" : "text-ink-2"}`}>{pct(r.crowd)}</span>
                        <span className="block h-1.5 w-16 overflow-hidden rounded-full bg-side-b" aria-hidden="true">
                          <span className="block h-full bg-side-a" style={{ width: `${r.crowd}%` }} />
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <span className="flex items-center gap-3">
                        <Sparkline values={r.spark} className="h-6 w-16" />
                        <span className={`text-body-sm font-semibold tabular ${r.change > 0 ? "text-side-a-text" : r.change < 0 ? "text-side-b-text" : "text-ink-2"}`} aria-label={changeLabel(r.change)}>
                          {changeText(r.change)}
                        </span>
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-right align-middle text-body-sm text-ink-2 tabular lg:table-cell">{formatCount(r.forecasters, locale)}</td>
                    <td className="py-3 pl-4 pr-0 text-right align-middle text-body-sm text-ink-2 tabular">{formatShortDate(r.closesAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phones: compact rows, same order of information. */}
          <ul className="m-0 grid list-none border-t-2 border-ink p-0 md:hidden">
            {shown.map((r) => (
              <li key={r.slug} className="relative grid gap-2 border-b border-line py-4">
                <span className="flex flex-wrap items-center gap-2">
                  <StateBadge state={r.state} label={t.states[r.state]} />
                  <span className="text-caption text-ink-2">{t.board.categories[r.category]}</span>
                  {!r.scored && <span className="rounded-full bg-side-b-soft px-2 py-0.5 text-caption text-side-b-text">{t.question.poll}</span>}
                </span>
                <Link href={href(r.slug)} className="font-display text-body font-bold leading-snug text-balance text-ink after:absolute after:inset-0">
                  {r.title[locale]}
                </Link>
                <span className="flex items-center justify-between gap-3">
                  <span className="flex items-baseline gap-2">
                    <span className="font-display text-title-sm font-bold tabular">{pct(r.crowd)}</span>
                    <span className={`text-caption font-semibold tabular ${r.change > 0 ? "text-side-a-text" : r.change < 0 ? "text-side-b-text" : "text-ink-2"}`} aria-label={changeLabel(r.change)}>
                      {changeText(r.change)}
                    </span>
                  </span>
                  <Sparkline values={r.spark} className="h-6 w-20" />
                </span>
                <span className="flex flex-wrap items-center justify-between gap-2 text-caption text-ink-2 tabular">
                  <span>
                    {formatCount(r.forecasters, locale)} · {formatShortDate(r.closesAt, locale)}
                  </span>
                  <YourCallBadge slug={r.slug} template={t.question.yourCall} format={locale} />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
