"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import type { Locale } from "@/i18n/config";
import { readAllCalls } from "@/lib/calls-store";
import { compareWithCanada, newestAnswer, unseenAnswers, withCalls, type AnsweredCall, type AnsweredQuestion } from "@/lib/come-back";
import { formatBrier, formatPercent } from "@/lib/format";
import { fill } from "@/lib/text";

export type PanelQuestion = AnsweredQuestion & { question: string; href: string };

type Props = {
  items: readonly PanelQuestion[];
  t: Dictionary["comeBack"];
  answerLabels: { yes: string; no: string; answerIs: string };
  recordHref: string;
  locale: Locale;
  /** The server's clock (ISO), so the first-visit window matches the rest of the page. */
  now: string;
};

/** The newest answer this browser has already shown in the panel. */
export const SEEN_KEY = "consensa:results-seen";

function readSeen(): string | null {
  try {
    return window.localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

function writeSeen(iso: string): void {
  try {
    window.localStorage.setItem(SEEN_KEY, iso);
  } catch {
    /* storage blocked: the panel may show again next visit, which is harmless */
  }
}

/**
 * "Since your last visit": the first visit after one of your questions gets its official answer, a panel at the top of
 * the home page says what happened (what you said, what Canada said, the answer). It shows once: the moment it shows,
 * this browser remembers the newest answer, so the next page load doesn't show it again. "Got it" closes it at once.
 * Nothing is sent anywhere: the answers come with the page and the calls are the ones saved in this browser.
 */
export function SinceLastVisit({ items, t, answerLabels, recordHref, locale, now }: Props) {
  const [calls, setCalls] = useState<AnsweredCall<PanelQuestion>[]>([]);
  const [open, setOpen] = useState(true);
  const decided = useRef(false);

  useEffect(() => {
    // Once per mount, even when React runs effects twice in development: the first run marks the answers as seen.
    if (decided.current) return;
    decided.current = true;
    const mine = withCalls(items, readAllCalls(items.map((i) => i.slug)));
    const newest = newestAnswer(mine);
    if (newest === null) return;
    const fresh = unseenAnswers(mine, readSeen(), new Date(now));
    if (newest > (readSeen() ?? "")) writeSeen(newest);
    setCalls(fresh);
  }, [items, now]);

  if (!open || calls.length === 0) return null;

  const pct = (v: number) => formatPercent(v, locale);
  const n = calls.length;
  const one = n === 1;
  const right = calls.filter((c) => c.verdict === "calledIt").length;
  const first = calls[0]!;
  const summary = one
    ? first.verdict === "calledIt" ? t.rightOne : first.verdict === "missed" ? t.missOne : t.tossOne
    : right === n ? t.rightAll : right === 0 ? t.rightNone : fill(t.rightSome, { right, n });
  const compare = compareWithCanada(calls);
  const compareLine = compare && (one ? { sharper: t.sharperOne, behind: t.behindOne, level: t.levelOne } : { sharper: t.sharper, behind: t.behind, level: t.level })[compare.lean];

  return (
    <section aria-labelledby="since-last-visit" className="grid gap-4 rounded-card border border-line border-t-4 border-t-canada bg-surface p-5 shadow-card sm:p-6" data-testid="since-last-visit">
      <div className="grid gap-2">
        <p className="m-0 text-caption font-bold uppercase tracking-widest text-ink-2">{t.eyebrow}</p>
        <h2 id="since-last-visit" className="m-0 font-display text-title font-bold tracking-tight text-balance sm:text-headline">
          {one ? t.titleOne : fill(t.titleMany, { n })}
        </h2>
        <p className="m-0 max-w-[62ch] text-body text-ink-2">
          {summary} {compareLine}
        </p>
      </div>

      <ul className="m-0 grid list-none border-t border-line p-0">
        {calls.map((c) => (
          <li key={c.slug} className="grid gap-1.5 border-b border-line py-3">
            <div className="flex items-start justify-between gap-3">
              <Link href={c.href} className="min-w-0 text-body-sm font-semibold text-ink hover:underline">
                {c.question}
              </Link>
              <span
                data-verdict={c.verdict}
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-caption font-bold ${c.verdict === "calledIt" ? "bg-side-a-soft text-side-a-text" : "border border-line bg-sunken text-ink-2"}`}
              >
                {t.verdict[c.verdict]}
              </span>
            </div>
            <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-2 tabular">
              <span>{fill(t.you, { p: pct(c.you) })}</span>
              {c.crowd !== null && <span>{fill(t.canada, { p: pct(c.crowd) })}</span>}
              <span>
                {fill(answerLabels.answerIs, { answer: "" }).trim()}{" "}
                <strong className={c.outcome === "yes" ? "text-side-a-text" : "text-side-b-text"}>{c.outcome === "yes" ? answerLabels.yes : answerLabels.no}</strong>
              </span>
            </p>
          </li>
        ))}
      </ul>

      {compare && (
        <p className="m-0 rounded-control bg-sunken px-3 py-2 text-body-sm text-ink-2 tabular">
          {fill(t.brierLine, { you: formatBrier(compare.you, locale), crowd: formatBrier(compare.crowd, locale) })}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Link href={recordHref} className="inline-flex min-h-11 items-center rounded-control bg-ink px-4 py-2 text-body-sm font-bold text-paper hover:opacity-90">
          {t.seeRecord}
        </Link>
        <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-control border border-line-strong bg-surface px-4 py-2 text-body-sm font-semibold text-ink hover:bg-sunken">
          {t.gotIt}
        </button>
      </div>
    </section>
  );
}
