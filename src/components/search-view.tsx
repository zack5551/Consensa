"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/shell/icons";
import { StateBadge } from "@/components/state-badge";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import type { BoardRow } from "@/lib/board";
import { formatCount, formatPercent } from "@/lib/format";
import { highlight, search, type SearchField } from "@/lib/search";
import { fill } from "@/lib/text";

export type SearchDoc = { row: BoardRow; fields: SearchField[] };

type Props = {
  docs: readonly SearchDoc[];
  locale: Locale;
  t: Dictionary["search"];
  states: Dictionary["states"];
  categories: Dictionary["board"]["categories"];
  forecasters: string;
  browseHref: string;
};

/**
 * Instant, bilingual search over every question. The query lives in ?q= so results can be shared,
 * and a polite live region announces how many matched, without stealing focus from the input.
 */
export function SearchView({ docs, locale, t, states, categories, forecasters, browseHref }: Props) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const ids = useId();

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q") ?? "";
    setQuery(q);
    input.current?.focus();
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const url = query.trim() ? `${window.location.pathname}?q=${encodeURIComponent(query.trim())}` : window.location.pathname;
      // Skip the write when the URL already matches (e.g. the query was
      // loaded from ?q= on arrival): a redundant replaceState fired while a
      // client-side navigation is in flight can cancel that navigation.
      if (url !== `${window.location.pathname}${window.location.search}`) {
        window.history.replaceState(null, "", url);
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  const hits = useMemo(() => search(docs.map((d) => ({ item: d.row, fields: d.fields })), query), [docs, query]);
  const trimmed = query.trim();
  const pct = (v: number) => formatPercent(v, locale);
  const summary = !trimmed ? "" : hits.length === 1 ? fill(t.resultsOne, { q: trimmed }) : fill(t.results, { n: formatCount(hits.length, locale), q: trimmed });

  return (
    <div className="grid gap-6">
      <form role="search" onSubmit={(e) => e.preventDefault()} className="grid gap-2">
        <label htmlFor={`${ids}-q`} className="sr-only">
          {t.label}
        </label>
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-2" />
          <input
            ref={input}
            id={`${ids}-q`}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.placeholder}
            aria-describedby={`${ids}-hint`}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            className="h-14 w-full rounded-card border border-control bg-surface pl-12 pr-12 text-body-lg text-ink placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                input.current?.focus();
              }}
              className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-ink-2 hover:bg-sunken hover:text-ink"
            >
              <Icon name="close" className="size-4" />
              <span className="sr-only">{t.clear}</span>
            </button>
          )}
        </div>
        <p id={`${ids}-hint`} className="m-0 text-caption text-ink-2">
          {t.hint}
        </p>
      </form>

      <p className="sr-only" role="status" aria-live="polite">
        {summary}
      </p>

      {!trimmed ? (
        <section aria-labelledby={`${ids}-idle`} className="grid gap-4 border-t-2 border-ink pt-5">
          <div className="grid gap-1">
            <h2 id={`${ids}-idle`} className="m-0 font-display text-title font-bold tracking-tight text-balance">
              {t.idleTitle}
            </h2>
            <p className="m-0 text-body text-ink-2">{t.idleBody}</p>
          </div>
          <div className="grid gap-2">
            <p className="m-0 text-caption font-semibold uppercase tracking-wide text-ink-2">{t.suggestionsLabel}</p>
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {Object.values(t.suggestions).map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => setQuery(s)} className="min-h-10 rounded-full border border-line bg-surface px-4 py-1.5 text-body-sm font-semibold hover:bg-sunken">
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : hits.length === 0 ? (
        <EmptyState
          title={fill(t.emptyTitle, { q: trimmed })}
          body={t.emptyBody}
          action={
            <Link href={browseHref} className="rounded-control bg-ink px-4 py-2 text-body-sm font-bold text-paper hover:opacity-90">
              {t.browse}
            </Link>
          }
        />
      ) : (
        <section aria-label={summary} className="grid gap-2">
          <p className="m-0 text-caption text-ink-2" aria-hidden="true">
            {summary}
          </p>
          <ul className="m-0 grid list-none border-t-2 border-ink p-0">
            {hits.map(({ item: r }) => (
              <li key={r.slug} className="relative grid gap-2 border-b border-line py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
                <div className="grid gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <StateBadge state={r.state} label={states[r.state]} />
                    <span className="text-caption text-ink-2">{categories[r.category]}</span>
                  </span>
                  <Link href={`/${locale}/q/${r.slug}`} className="font-display text-body font-bold leading-snug text-balance text-ink after:absolute after:inset-0 hover:underline">
                    {highlight(r.title[locale], trimmed).map((run, i) =>
                      run.match ? (
                        <mark key={i} className="rounded-sm bg-side-a-soft px-0.5 font-bold text-side-a-text">
                          {run.text}
                        </mark>
                      ) : (
                        <span key={i}>{run.text}</span>
                      ),
                    )}
                  </Link>
                </div>
                <span className="flex items-baseline gap-3 text-caption text-ink-2 tabular sm:justify-end">
                  <span className="font-display text-title-sm font-bold text-ink">{pct(r.crowd)}</span>
                  <span>
                    {formatCount(r.forecasters, locale)} {forecasters}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
