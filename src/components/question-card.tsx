import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { formatCount, formatPercent, formatShortDate } from "@/lib/format";
import { crowdNow, isOpen, type Question, type QuestionState } from "@/lib/question";
import { CrowdBar } from "./crowd-bar";
import { StateBadge } from "./state-badge";
import { YourCallBadge } from "./your-call-badge";

type Props = {
  q: Question;
  locale: Locale;
  t: Dictionary["question"];
  states: Dictionary["states"];
  state?: QuestionState;
  href?: string;
  /** The lead card on Today's five gets a bigger title and room for the province split. */
  lead?: boolean;
  children?: React.ReactNode;
};

/** A board card: question, live split, forecaster count, one action. The whole card is one link target. */
export function QuestionCard({ q, locale, t, states, state = "open", href, lead = false, children }: Props) {
  const yes = crowdNow(q);
  const open = isOpen(state);
  const action = open ? t.makeYourCall : t.seeResult;
  const Title = "h3";

  return (
    <article className={`relative grid gap-3 rounded-card border border-line bg-surface p-4 shadow-card ${href ? "transition-shadow duration-[var(--cn-duration-fast)] hover:border-line-strong" : ""} ${lead ? "sm:p-6" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-ink-2">
        <span className="flex flex-wrap items-center gap-2">
          <StateBadge state={state} label={states[state]} />
          {open && (
            <span className="uppercase tracking-wide">
              {t.closes} {formatShortDate(q.closesAt, locale)}
            </span>
          )}
        </span>
        <span className={`rounded-full px-2 py-0.5 ${q.scored ? "bg-sunken" : "bg-side-b-soft text-side-b-text"}`}>{q.scored ? t.scored : t.poll}</span>
      </div>
      <Title className={`m-0 font-bold leading-snug text-balance ${lead ? "text-title" : "text-title-sm"}`}>
        {href ? (
          <Link href={href} className="after:absolute after:inset-0 after:rounded-card hover:underline focus-visible:underline">
            {q.question[locale]}
          </Link>
        ) : (
          q.question[locale]
        )}
      </Title>
      <CrowdBar yes={yes} yesLabel={`${t.yes} ${formatPercent(yes, locale)}`} noLabel={`${t.no} ${formatPercent(100 - yes, locale)}`} />
      {children}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-body-sm text-ink-2">
          <span className={`size-2 rounded-full ${open ? "bg-canada" : "bg-ink-3"}`} aria-hidden="true" />
          {formatCount(q.forecasters, locale)} {t.forecasters}
        </span>
        <span className="flex items-center gap-2">
          <YourCallBadge slug={q.slug} template={t.yourCall} format={locale} />
          <span className={`rounded-control px-3 py-2 text-body-sm font-bold ${open ? "bg-ink text-paper" : "border border-line text-ink"}`} aria-hidden="true">
            {action}
          </span>
        </span>
      </div>
    </article>
  );
}
