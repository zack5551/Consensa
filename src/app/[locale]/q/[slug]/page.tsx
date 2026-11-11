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
import { SourceCredit } from "@/components/source-credit";
import { StateBadge } from "@/components/state-badge";
import { StateNote } from "@/components/state-note";
import { getQuestion, SAMPLE_NOW, sampleQuestions } from "@/content/sample-questions";
import { withLiveQuestion } from "@/lib/live";
import { isLocale, locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { formatCount, formatLongDate, formatPercent, formatShortDate } from "@/lib/format";
import { crowdNow, questionState, weekMove } from "@/lib/question";
import { largestSwing } from "@/lib/swing";
import { provinceSummary } from "@/lib/province-summary";
import { fill } from "@/lib/text";

type Params = Promise<{ locale: string; slug: string }>;

export const dynamicParams = false;

/** Real crowd numbers refresh every minute (ISR). */
export const revalidate = 60;

export function generateStaticParams() {
  return locales.flatMap((locale) => sampleQuestions.map((q) => ({ locale, slug: q.slug })));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  const q = getQuestion(slug);
  if (!isLocale(locale) || !q) return {};
  return {
    title: q.question[locale],
    alternates: { canonical: `/${locale}/q/${slug}`, languages: { "en-CA": `/en/q/${slug}`, "fr-CA": `/fr/q/${slug}` } },
  };
}

export default async function QuestionPage({ params }: { params: Params }) {
  const { locale: raw, slug } = await params;
  const q = await withLiveQuestion(getQuestion(slug));
  if (!isLocale(raw) || !q) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const state = questionState(q, SAMPLE_NOW);
  const yes = crowdNow(q);
  const pct = (v: number) => formatPercent(v, locale);
  const first = q.history[0] ?? yes;
  const swing = largestSwing(q.history);
  let chartSummary = fill(t.chart.summary, { days: q.history.length, from: pct(first), to: pct(yes) });
  if (swing !== null) {
    const days = swing.endIndex - swing.startIndex;
    const template =
      swing.change > 0 ? (days === 1 ? t.chart.swingUp : t.chart.swingUpDays) : days === 1 ? t.chart.swingDown : t.chart.swingDownDays;
    chartSummary += ` ${fill(template, { change: Math.abs(swing.change), days })}`;
  }
  const result = q.resolution.result;
  const answer = result ? (result.outcome === "yes" ? t.question.yes : t.question.no) : "";
  const settled = state === "resolved" || state === "disputed" || state === "closed";
  // How the crowd moved this week, beside the count. Open questions only: a settled number no longer moves.
  const move = settled ? null : weekMove(q);
  const moveText =
    move &&
    (move.direction === "flat"
      ? t.question.week.flat
      : move.points === 1
        ? t.question.week[move.direction === "up" ? "upOne" : "downOne"]
        : fill(t.question.week[move.direction], { n: String(move.points) }));

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
      regions={{ values: q.provinces, hidden: q.hiddenProvinces, names: t.province.names }}
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
          <h1 className="m-0 font-display text-headline font-extrabold leading-tight tracking-tight text-balance">{q.question[locale]}</h1>
          <StateNote state={state} title={t.states[state]}>
            {note}
          </StateNote>
        </header>

        {/* The page's one strong move: a Canada-red rule over the crowd's number, open rather than carded. Settled questions sit on a sunken ground. */}
        <section
          aria-label={settled ? t.question.canadaSaid : t.question.canadaSays}
          className={`grid gap-4 border-t-4 pt-5 ${settled ? "border-ink-3 bg-sunken px-5 pb-5" : "border-canada"}`}
        >
          <p className="m-0 grid gap-1">
            <span className="text-caption font-bold uppercase tracking-wide text-canada">{settled ? t.question.canadaSaid : t.question.canadaSays}</span>
            <span className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-display text-display-lg font-bold leading-none tabular text-side-a-text">{pct(yes)}</span>
              <span className="text-body-lg text-ink-2">{t.question.chance}</span>
              {result && (
                <span className="ml-auto self-center rounded-full bg-ink px-3 py-1 text-body-sm font-bold text-paper">
                  {fill(t.resolution.answerIs, { answer })}
                </span>
              )}
            </span>
          </p>
          <CrowdBar yes={yes} yesLabel={`${t.question.yes} ${pct(yes)}`} noLabel={`${t.question.no} ${pct(100 - yes)}`} />
          <p className="m-0 inline-flex items-center gap-2 text-body-sm text-ink-2">
            <span className={`size-2 rounded-full ${settled ? "bg-ink-3" : "bg-canada"}`} aria-hidden="true" />
            {formatCount(q.forecasters, locale)} {t.question.forecasters}
            {move && moveText && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 tabular">
                  {move.direction !== "flat" && (
                    <span aria-hidden="true" className={move.direction === "up" ? "text-side-a-text" : "text-side-b-text"}>
                      {move.direction === "up" ? "▲" : "▼"}
                    </span>
                  )}
                  {moveText}
                </span>
              </>
            )}
          </p>
        </section>

        <div className="lg:hidden">{panel}</div>

        <section className="border-t border-line pt-5">
          <ForecastChart
            history={q.history}
            events={q.events.map((e) => ({ dayIndex: e.dayIndex, label: e.label[locale] }))}
            title={t.chart.title}
            format={pct}
            summary={chartSummary}
          />
        </section>

        {/* The crowd, split two ways: ruled columns, not cards. */}
        <div className="grid gap-8 md:grid-cols-2">
          <section className="border-t-2 border-ink pt-4">
            <ProvinceSplit
              values={q.provinces}
              title={t.province.title}
              summary={provinceSummary(q, t.province, pct)}
              hidden={q.hiddenProvinces}
              hiddenNote={t.province.hiddenNote}
              short={t.province.short}
              names={t.province.names}
              format={pct}
              relative
            />
          </section>
          {q.languages && (
            <section className="border-t-2 border-ink pt-4">
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

        {/* Why it moved: an upright, readable note with its sources as footnotes, not chips. */}
        {q.why && (
          <section aria-labelledby="why-title" className="grid gap-3 border-t-2 border-ink pt-5">
            <h2 id="why-title" className="m-0 font-display text-title-sm font-bold">
              {t.why.title}
            </h2>
            <p className="m-0 text-caption font-bold uppercase tracking-wide text-ink-2">{t.why.byline}</p>
            <p className="m-0 max-w-[62ch] text-body-lg leading-relaxed text-ink">{q.why.body[locale]}</p>
            <div className="grid gap-1 border-t border-line pt-3 text-caption text-ink-2">
              <p className="m-0 font-bold">{t.why.sources}</p>
              <ol className="m-0 grid list-decimal gap-0.5 pl-5">
                {q.why.sources.map((s) => (
                  <li key={s.en}>{s[locale]}</li>
                ))}
              </ol>
              <p className="m-0 mt-1 italic">{t.why.note}</p>
            </div>
          </section>
        )}

        <section aria-labelledby="res-title" className="grid gap-3 border-t-2 border-ink pt-5">
          <h2 id="res-title" className="m-0 font-display text-title-sm font-bold">
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
          <SourceCredit url={q.resolution.source.url} t={t.resolution.credit} />
          <p className="m-0 text-caption text-ink-2">{t.resolution.log}</p>
        </section>

        <p className="m-0 text-caption text-ink-2">{t.legal.noValue}</p>
      </div>

      <aside className="sticky top-20 hidden lg:block">{panel}</aside>
    </article>
  );
}
