import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { formatCount, formatPercent, formatShortDate } from "@/lib/format";
import { crowdNow, type Question } from "@/lib/question";
import { CrowdBar } from "./crowd-bar";

/** A board card: question, live split, forecaster count, one action. */
export function QuestionCard({ q, locale, t, href }: { q: Question; locale: Locale; t: Dictionary["question"]; href?: string }) {
  const yes = crowdNow(q);
  return (
    <article className="grid gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2 text-caption uppercase tracking-wide text-ink-2">
        <span>
          {t.closes} {formatShortDate(q.closesAt, locale)}
        </span>
        <span className={`rounded-full px-2 py-0.5 ${q.scored ? "bg-sunken" : "bg-side-b-soft text-side-b-text"}`}>{q.scored ? t.scored : t.poll}</span>
      </div>
      <h2 className="m-0 text-title-sm font-bold leading-snug text-balance">
        {href ? (
          <Link href={href} className="hover:underline focus-visible:underline">
            {q.question[locale]}
          </Link>
        ) : (
          q.question[locale]
        )}
      </h2>
      <CrowdBar yes={yes} yesLabel={`${t.yes} ${formatPercent(yes, locale)}`} noLabel={`${t.no} ${formatPercent(100 - yes, locale)}`} />
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-body-sm text-ink-2">
          <span className="size-2 rounded-full bg-canada" aria-hidden="true" />
          {formatCount(q.forecasters, locale)} {t.forecasters}
        </span>
        {href ? (
          <Link href={href} className="rounded-control bg-ink px-3 py-2 text-body-sm font-bold text-paper hover:opacity-90" aria-hidden="true" tabIndex={-1}>
            {t.makeYourCall}
          </Link>
        ) : (
          <span className="rounded-control bg-ink px-3 py-2 text-body-sm font-bold text-paper">{t.makeYourCall}</span>
        )}
      </div>
    </article>
  );
}
