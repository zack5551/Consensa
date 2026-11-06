/*
 * Screen: a question.
 * One message: "Canada says 38%" (and how it got there).
 * One action: make your call. Once it closes, the action becomes "see how your call did".
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CallPanel } from "@/components/call-panel";
import { CrowdBar } from "@/components/crowd-bar";
import { ForecastChart } from "@/components/forecast-chart";
import { LanguageSplit } from "@/components/language-split";
import { ProvinceSplit } from "@/components/province-split";
import { ScreenView } from "@/components/screen-view";
import { StateBadge } from "@/components/state-badge";
import { StateNote } from "@/components/state-note";
import { getQuestion, SAMPLE_NOW, sampleQuestions } from "@/content/sample-questions";
import { isLocale, locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { formatCount, formatLongDate, formatPercent, formatShortDate } from "@/lib/format";
import { crowdNow, provinceExtremes, questionState } from "@/lib/question";
import { fill } from "@/lib/text";

type Params = Promise<{ locale: string; slug: string }>;

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.flatMap((locale) => sampleQuestions.map((q) => ({ locale, slug: q.slug })));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  const q = getQuestion(slug);
  if (!isLocale(locale) || !q) return {};
  return {
    title: q.question[locale],
    alternates: { languages: { "en-CA": `/en/q/${slug}`, "fr-CA": `/fr/q/${slug}` } },
  };
}

export default async function QuestionPage({ params }: { params: Params }) {
  const { locale: raw, slug } = await params;
  const q = getQuestion(slug);
  if (!isLocale(raw) || !q) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const state = questionState(q, SAMPLE_NOW);
  const yes = crowdNow(q);
  const pct = (v: number) => formatPercent(v, locale);
  const first = q.history[0] ?? yes;
  const { high, low } = provinceExtremes(q.provinces);
  const result = q.resolution.result;
  const answer = result ? (result.outcome === "yes" ? t.question.yes : t.question.no) : "";
  const settled = state === "resolved" || state === "disputed" || state === "closed";

  const note =
    state === "closingSoon"
      ? fill(t.stateNote.closingSoon, { date: formatLongDate(q.closesAt, locale) })
      : state === "closed"
        ? fill(t.stateNote.closed, { date: formatLongDate(q.resolution.resolvesAt, locale) })
        : state === "resolved"
          ? fill(t.stateNote.resolved, { answer: answer.toLowerCase(), crowd: pct(yes) })
          : state === "disputed"
            ? t.stateNote.disputed
            : "";

  const panel = (
    <CallPanel
      slug={q.slug}
      crowd={yes}
      locale={locale}
      t={t.call}
      canadaSays={settled ? t.question.canadaSaid : t.question.canadaSays}
      state={state}
      scored={q.scored}
      outcome={result?.outcome}
      closedOn={formatLongDate(q.closesAt, locale)}
    />
  );

  return (
    <article className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <ScreenView locale={locale} screen="question" slug={q.slug} state={state} />
      <div className="grid min-w-0 gap-6">
        <Link href={`/${locale}`} className="justify-self-start text-body-sm font-semibold text-ink-2 hover:text-ink">
          ← {t.question.back}
        </Link>

        <header className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2 text-caption text-ink-2">
            <StateBadge state={state} label={t.states[state]} />
            <span className="uppercase tracking-wide">{q.scored ? t.question.scored : t.question.poll}</span>
            {!settled && (
              <>
                <span aria-hidden="true">·</span>
                <span className="uppercase tracking-wide">
                  {t.question.closes} {formatShortDate(q.closesAt, locale)}
                </span>
              </>
            )}
          </div>
          <h1 className="m-0 text-headline font-extrabold leading-tight tracking-tight text-balance">{q.question[locale]}</h1>
          <StateNote state={state} title={t.states[state]}>
            {note}
          </StateNote>
        </header>

        <section aria-label={settled ? t.question.canadaSaid : t.question.canadaSays} className="grid gap-3 rounded-card border border-line bg-surface p-5 shadow-card">
          <p className="m-0 flex flex-wrap items-baseline gap-x-3">
            <span className="text-body-sm font-bold text-canada">{settled ? t.question.canadaSaid : t.question.canadaSays}</span>
            <span className="font-display text-display font-semibold tabular text-side-a-text">{pct(yes)}</span>
            <span className="text-body text-ink-2">{t.question.chance}</span>
            {result && (
              <span className="ml-auto rounded-full bg-ink px-3 py-1 text-body-sm font-bold text-paper">
                {fill(t.resolution.answerIs, { answer })}
              </span>
            )}
          </p>
          <CrowdBar yes={yes} yesLabel={`${t.question.yes} ${pct(yes)}`} noLabel={`${t.question.no} ${pct(100 - yes)}`} />
          <p className="m-0 inline-flex items-center gap-2 text-body-sm text-ink-2">
            <span className={`size-2 rounded-full ${settled ? "bg-ink-3" : "bg-canada"}`} aria-hidden="true" />
            {formatCount(q.forecasters, locale)} {t.question.forecasters}
          </p>
        </section>

        <div className="lg:hidden">{panel}</div>

        <section className="rounded-card border border-line bg-surface p-5">
          <ForecastChart
            history={q.history}
            events={q.events.map((e) => ({ dayIndex: e.dayIndex, label: e.label[locale] }))}
            title={t.chart.title}
            format={pct}
            summary={fill(t.chart.summary, { days: q.history.length, from: pct(first), to: pct(yes) })}
          />
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-card border border-line bg-surface p-5">
            <ProvinceSplit
              values={q.provinces}
              title={t.province.title}
              summary={fill(t.province.summary, { high: t.province.names[high], highValue: pct(q.provinces[high]), low: t.province.names[low], lowValue: pct(q.provinces[low]) })}
              short={t.province.short}
              names={t.province.names}
              format={pct}
            />
          </section>
          {q.languages && (
            <section className="rounded-card border border-line bg-surface p-5">
              <LanguageSplit
                en={q.languages.en}
                fr={q.languages.fr}
                title={t.language.title}
                enLabel={t.language.en}
                frLabel={t.language.fr}
                summary={fill(t.language.summary, { en: pct(q.languages.en), fr: pct(q.languages.fr) })}
                format={pct}
              />
            </section>
          )}
        </div>

        {q.why && (
          <section aria-labelledby="why-title" className="grid gap-2 border-l-4 border-side-a pl-4">
            <h2 id="why-title" className="m-0 text-title-sm font-bold">
              {t.why.title}
            </h2>
            <p className="m-0 text-caption uppercase tracking-wide text-ink-2">{t.why.byline}</p>
            <p className="m-0 max-w-[65ch] text-body">{q.why.body[locale]}</p>
            <p className="m-0 text-body-sm italic text-ink-2">{t.why.note}</p>
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label={t.why.sources}>
              {q.why.sources.map((s) => (
                <li key={s.en} className="rounded-sm bg-sunken px-2 py-1 text-caption text-ink-2">
                  {s[locale]}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="res-title" className="grid gap-3 rounded-card border border-line bg-sunken p-5">
          <h2 id="res-title" className="m-0 text-title-sm font-bold">
            {t.resolution.title}
          </h2>
          <p className="m-0 max-w-[65ch] text-body">{q.resolution.rule[locale]}</p>
          <dl className="m-0 grid gap-3 text-body-sm sm:grid-cols-3">
            <div>
              <dt className="text-ink-2">{t.resolution.source}</dt>
              <dd className="m-0 font-semibold">
                <a href={q.resolution.source.url} rel="noopener noreferrer" target="_blank" className="text-link underline underline-offset-4">
                  {q.resolution.source.name[locale]}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-ink-2">{result ? t.resolution.resolvedOn : t.resolution.resolvesOn}</dt>
              <dd className="m-0 font-semibold">{formatLongDate(result?.publishedAt ?? q.resolution.resolvesAt, locale)}</dd>
            </div>
            {result && (
              <div>
                <dt className="text-ink-2">{t.resolution.answer}</dt>
                <dd className="m-0 font-semibold">{answer}</dd>
              </div>
            )}
          </dl>
          <p className="m-0 text-caption text-ink-2">{t.resolution.log}</p>
        </section>

        <p className="m-0 text-caption text-ink-2">{t.legal.noValue}</p>
      </div>

      <aside className="sticky top-20 hidden lg:block">{panel}</aside>
    </article>
  );
}
