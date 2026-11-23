"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ShareBar } from "@/components/share-bar";
import type { Dictionary } from "@/i18n/dictionaries/en";
import type { Locale } from "@/i18n/config";
import { readAllCalls, subscribeCalls } from "@/lib/calls-store";
import { monthRecap, withCalls, type AnsweredCall } from "@/lib/come-back";
import type { Category } from "@/lib/question";
import { formatBrier, formatPercent } from "@/lib/format";
import { shareLinks } from "@/lib/social";
import type { PanelQuestion } from "@/components/since-last-visit";
import { fill } from "@/lib/text";

export type RecapQuestion = PanelQuestion & { shortDate: string };

type Props = {
  /** The month's answered questions (scored, yes or no, not under review). */
  items: readonly RecapQuestion[];
  month: string;
  /** "October" / "octobre". */
  monthName: string;
  t: Dictionary["recap"];
  verdicts: Dictionary["comeBack"]["verdict"];
  brierLine: string;
  share: Dictionary["share"];
  categories: Record<Category, string>;
  answerLabels: { yes: string; no: string };
  /** The month's public page, the same for everyone. */
  shareUrl: string;
  locale: Locale;
};

/**
 * "Your October": a month in review on My record, built in this browser from your saved calls on the questions
 * answered last month. Accuracy only, no points. Sharing posts your numbers in the text you choose to post; the link
 * and its picture are the month's public page, the same for everyone, so nothing about you goes through our server.
 */
export function MonthlyRecap({ items, month, monthName, t, verdicts, brierLine, share, categories, answerLabels, shareUrl, locale }: Props) {
  const slugs = items.map((i) => i.slug);
  const snapshot = useSyncExternalStore(subscribeCalls, () => JSON.stringify(readAllCalls(slugs)), () => null);
  if (snapshot === null) return null;
  const recap = monthRecap(withCalls(items, JSON.parse(snapshot) as Record<string, number>), month);

  if (!recap) {
    return <p className="m-0 rounded-card border border-dashed border-line-strong bg-surface p-4 text-body-sm text-ink-2">{t.empty}</p>;
  }

  const pct = (v: number) => formatPercent(v, locale);
  const n = recap.calls.length;
  const callLine = (c: AnsweredCall<RecapQuestion>) =>
    `${fill(t.callLine, { you: pct(c.you), answer: c.outcome === "yes" ? answerLabels.yes : answerLabels.no })}${c.crowd !== null ? ` ${fill(t.crowdLine, { crowd: pct(c.crowd) })}` : ""}`;
  const text = fill(t.shareText, { month: monthName, right: recap.calledIt, n });
  const tile = "grid min-w-0 content-start gap-1 rounded-control border border-line p-4";
  const tileLabel = "m-0 text-caption font-bold uppercase tracking-widest text-ink-2";

  return (
    <section aria-labelledby="monthly-recap" className="grid gap-5 rounded-card border border-line border-t-4 border-t-canada bg-surface p-5 shadow-card sm:p-8" data-testid="monthly-recap">
      <div className="grid gap-2">
        <p className="m-0 text-caption font-bold uppercase tracking-widest text-ink-2">{fill(t.eyebrow, { month: monthName })}</p>
        <h2 id="monthly-recap" className="m-0 grid gap-1">
          <span className="font-display text-stat font-bold leading-none tracking-tight tabular">{fill(t.stat, { right: recap.calledIt, n })}</span>
          <span className="text-body-lg font-normal text-ink-2">{t.statLabel}</span>
        </h2>
      </div>

      {recap.compare && (
        <p className="m-0 rounded-control bg-sunken px-3 py-2 text-body-sm text-ink-2 tabular">
          <strong className="text-ink">{fill(t[recap.compare.lean], { month: monthName })}</strong>{" "}
          {fill(brierLine, { you: formatBrier(recap.compare.you, locale), crowd: formatBrier(recap.compare.crowd, locale) })}
        </p>
      )}

      <div className="grid gap-2">
        <h3 className="m-0 text-caption font-bold uppercase tracking-widest text-ink-2">{fill(t.timeline, { month: monthName })}</h3>
        <ol className="m-0 flex list-none flex-wrap gap-2 p-0">
          {recap.calls.map((c) => (
            <li key={c.slug}>
              <Link
                href={c.href}
                aria-label={`${fill(t.dot, { date: c.shortDate, verdict: verdicts[c.verdict] })}. ${c.question}`}
                title={c.question}
                data-verdict={c.verdict}
                className={`grid size-11 place-items-center rounded-full text-caption font-bold tabular ${c.verdict === "calledIt" ? "bg-side-a text-on-fill" : "border-2 border-line-strong bg-surface text-ink-2"}`}
              >
                {c.shortDate.replace(/\D+/g, "")}
              </Link>
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {recap.best && (
          <div className={tile}>
            <p className={`${tileLabel} text-canada`}>{t.best}</p>
            <Link href={recap.best.href} className="font-semibold text-ink hover:underline">{recap.best.question}</Link>
            <p className="m-0 text-body-sm text-ink-2 tabular">{callLine(recap.best)}</p>
          </div>
        )}
        {recap.toughest && (
          <div className={tile}>
            <p className={tileLabel}>{t.toughest}</p>
            <Link href={recap.toughest.href} className="font-semibold text-ink hover:underline">{recap.toughest.question}</Link>
            <p className="m-0 text-body-sm text-ink-2 tabular">{callLine(recap.toughest)}</p>
          </div>
        )}
        {recap.bestRun >= 2 && (
          <div className={tile}>
            <p className={tileLabel}>{t.run}</p>
            <p className="m-0 font-semibold text-ink">{fill(t.runValue, { n: recap.bestRun })}</p>
          </div>
        )}
        {recap.topic && (
          <div className={tile}>
            <p className={tileLabel}>{t.topic}</p>
            <p className="m-0 font-semibold text-ink">{categories[recap.topic.category]}</p>
            <p className="m-0 text-body-sm text-ink-2 tabular">{fill(t.topicValue, { right: recap.topic.calledIt, n: recap.topic.count })}</p>
          </div>
        )}
      </div>

      <p className="m-0 text-caption text-ink-2">{t.noPoints}</p>

      <div className="grid gap-1">
        <ShareBar t={share} text={text} url={shareUrl} links={shareLinks(text, shareUrl)} title={fill(t.shareTitle, { month: monthName })} />
        <p className="m-0 text-caption text-ink-2">{fill(t.shareHelp, { month: monthName })}</p>
      </div>
    </section>
  );
}
