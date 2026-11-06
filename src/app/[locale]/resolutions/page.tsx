/*
 * Screen: public resolution log.
 * One message: every result, its official source, and how the crowd did. Nothing hidden.
 * One action: open a resolved question.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScreenView } from "@/components/screen-view";
import { StateBadge } from "@/components/state-badge";
import { SAMPLE_NOW, sampleQuestions } from "@/content/sample-questions";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { formatBrier, formatLongDate, formatPercent } from "@/lib/format";
import { crowdBrier, crowdNow, isOpen, questionState } from "@/lib/question";
import { fill } from "@/lib/text";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).log.title, alternates: { languages: { "en-CA": "/en/resolutions", "fr-CA": "/fr/resolutions" } } };
}

export default async function ResolutionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const rows = sampleQuestions
    .map((q) => ({ q, state: questionState(q, SAMPLE_NOW) }))
    .filter(({ state }) => !isOpen(state))
    .sort((a, b) => Date.parse(b.q.resolution.result?.publishedAt ?? b.q.closesAt) - Date.parse(a.q.resolution.result?.publishedAt ?? a.q.closesAt));
  const c = t.log.columns;

  return (
    <div className="grid gap-6">
      <ScreenView locale={locale} screen="resolutions" />
      <header className="grid max-w-[68ch] gap-2">
        <h1 className="m-0 font-display text-headline font-extrabold tracking-tight">{t.log.title}</h1>
        <p className="m-0 text-body-lg text-ink-2">{t.log.intro}</p>
        <p className="m-0 text-body-sm text-ink-2">
          {fill(t.log.summary, { n: rows.length })}{" "}
          <Link href={`/${locale}/methodology#resolution`} className="font-semibold text-link underline underline-offset-4">
            {t.log.methodologyLink}
          </Link>
        </p>
      </header>

      <ol className="m-0 grid list-none gap-3 p-0">
        {rows.map(({ q, state }) => {
          const r = q.resolution.result;
          const brier = crowdBrier(q);
          return (
            <li key={q.slug} className="grid gap-3 rounded-card border border-line bg-surface p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2 text-caption text-ink-2">
                <StateBadge state={state} label={t.states[state]} />
                <span>{formatLongDate(r?.publishedAt ?? q.resolution.resolvesAt, locale)}</span>
              </div>
              <h2 className="m-0 text-title-sm font-bold leading-snug text-balance">
                <Link href={`/${locale}/q/${q.slug}`} className="hover:underline">
                  {q.question[locale]}
                </Link>
              </h2>
              <dl className="m-0 grid grid-cols-2 gap-3 text-body-sm sm:grid-cols-4">
                <div>
                  <dt className="text-ink-2">{c.answer}</dt>
                  <dd className="m-0 font-semibold">{r ? (r.outcome === "yes" ? t.question.yes : t.question.no) : t.log.pending}</dd>
                </div>
                <div>
                  <dt className="text-ink-2">{c.crowd}</dt>
                  <dd className="m-0 font-semibold tabular">{formatPercent(crowdNow(q), locale)}</dd>
                </div>
                <div>
                  <dt className="text-ink-2">{c.brier}</dt>
                  <dd className="m-0 font-semibold tabular">{brier === null ? "—" : formatBrier(brier, locale)}</dd>
                </div>
                <div>
                  <dt className="text-ink-2">{c.source}</dt>
                  <dd className="m-0">
                    <a href={q.resolution.source.url} rel="noopener noreferrer" target="_blank" className="font-semibold text-link underline underline-offset-4">
                      {q.resolution.source.name[locale]}
                    </a>
                  </dd>
                </div>
              </dl>
              {state === "disputed" && <p className="m-0 rounded-control bg-side-b-soft px-3 py-2 text-body-sm">{t.log.reviewNote}</p>}
            </li>
          );
        })}
      </ol>
      <p className="m-0 text-caption text-ink-2">{t.legal.noValue}</p>
    </div>
  );
}
