import { formatLongDate } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { fill } from "@/lib/text";

type Point = { title: string; body: string };
type Props = {
  locale: Locale;
  title: string;
  intro: string;
  draft: string;
  updated: string;
  updatedOn: string;
  points: Record<string, Point>;
};

/** A plain-language legal summary: a draft notice, then numbered commitments a person can scan in a minute. */
export function LegalSummary({ locale, title, intro, draft, updated, updatedOn, points }: Props) {
  return (
    <article className="mx-auto grid max-w-[720px] gap-8">
      <header className="grid gap-3">
        <h1 className="m-0 text-headline font-extrabold tracking-tight text-balance sm:text-display">{title}</h1>
        <p className="m-0 text-body-lg text-ink-2">{intro}</p>
        <p className="m-0 text-caption text-ink-2">{fill(updated, { date: formatLongDate(updatedOn, locale) })}</p>
        <p role="note" className="m-0 rounded-control border border-line bg-sunken p-3 text-body-sm text-ink">
          {draft}
        </p>
      </header>
      <ol className="m-0 grid list-none gap-4 p-0">
        {Object.entries(points).map(([key, point], i) => (
          <li key={key} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 rounded-card border border-line bg-surface p-5">
            <span className="grid size-10 place-items-center rounded-full bg-side-a-soft font-display text-body font-extrabold text-side-a-text tabular" aria-hidden="true">
              {i + 1}
            </span>
            <div className="grid gap-1">
              <h2 className="m-0 text-title-sm font-bold">{point.title}</h2>
              <p className="m-0 text-body text-ink-2">{point.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}
