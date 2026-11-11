/*
 * Screen: landing (home, /en and /fr).
 * One message: "What Canada thinks happens next", shown live with a real question and its province split.
 * One action: make today's five calls.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CrowdBar } from "@/components/crowd-bar";
import { ProvinceSplit } from "@/components/province-split";
import { ScreenView } from "@/components/screen-view";
import { Icon } from "@/components/shell/icons";
import { localeHref } from "@/components/shell/nav-items";
import { SAMPLE_NOW, sampleQuestions as sample, todaysFive } from "@/content/sample-questions";
import { withLiveCrowd } from "@/lib/live";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { formatCount, formatPercent, formatShortDate } from "@/lib/format";
import { categories, crowdNow, isOpen, provinces, questionState } from "@/lib/question";
import { provinceSummary } from "@/lib/province-summary";
import { fill } from "@/lib/text";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return { title: { absolute: t.meta.title }, alternates: { canonical: `/${locale}`, languages: { "en-CA": "/en", "fr-CA": "/fr" } } };
}

/** Real crowd numbers refresh every minute (ISR). */
export const revalidate = 60;

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const l = t.landing;
  const pct = (v: number) => formatPercent(v, locale);
  const href = (path: string) => localeHref(locale, path);

  const sampleQuestions = await withLiveCrowd(sample);
  const open = sampleQuestions.filter((q) => isOpen(questionState(q, SAMPLE_NOW)));
  const firstSlug = todaysFive()[0]?.slug;
  const lead = sampleQuestions.find((q) => q.slug === firstSlug) ?? open[0] ?? sampleQuestions[0]!;
  const leadYes = crowdNow(lead);
  const trending = [...open].filter((q) => q.slug !== lead.slug).sort((a, b) => b.forecasters - a.forecasters).slice(0, 3);
  const totalCalls = open.reduce((sum, q) => sum + q.forecasters, 0);
  const openByTopic = Object.fromEntries(categories.map((c) => [c, open.filter((q) => q.category === c).length])) as Record<(typeof categories)[number], number>;

  const stats = [
    [formatCount(totalCalls, locale), l.stats.forecasters],
    [formatCount(open.length, locale), l.stats.questions],
    [formatCount(provinces.length, locale), l.stats.regions],
    [formatCount(2, locale), l.stats.languages],
  ] as const;

  const kicker = "m-0 text-caption font-bold uppercase tracking-widest";
  const sectionTitle = "m-0 font-display text-headline font-bold tracking-tight text-balance";

  return (
    <div className="grid gap-16 sm:gap-24">
      <ScreenView locale={locale} screen="landing" />

      {/* Hero: the promise on the left, the proof (the day's lead question) on the right. */}
      <section aria-labelledby="hero-title" className="grid items-start gap-10 pt-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16 lg:pt-10">
        <div className="grid gap-6 lg:pt-6">
          <p className={`${kicker} flex items-center gap-2 text-ink-2`}>
            <span className="size-1.5 shrink-0 rounded-full bg-canada" aria-hidden="true" />
            {l.eyebrow}
          </p>
          <h1 id="hero-title" className="m-0 font-display text-display-sm font-bold tracking-tight text-balance sm:text-display">
            {l.title}
          </h1>
          <p className="m-0 max-w-[46ch] text-body-lg text-ink-2">{l.lede}</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-1">
            <Link href={href("/today")} className="inline-flex items-center gap-2 rounded-control bg-ink px-5 py-3 text-body font-bold text-paper transition-opacity duration-[var(--cn-duration-fast)] hover:opacity-90">
              {l.primary}
              <Icon name="arrow" className="size-4" />
            </Link>
            <Link href={href("/board")} className="py-3 text-body font-semibold text-ink underline decoration-line-strong underline-offset-8 transition-colors duration-[var(--cn-duration-fast)] hover:decoration-ink">
              {l.secondary}
            </Link>
          </div>
          <p className="m-0 border-t border-line pt-4 text-caption text-ink-2">{t.legal.noValue}</p>
        </div>

        {/* The lead: one strong move (red top rule, serif question), no shadow. */}
        <article aria-labelledby="showcase-q" className="relative grid gap-6 rounded-card border border-line border-t-4 border-t-canada bg-surface p-5 sm:p-8">
          <p className={`${kicker} flex flex-wrap items-center justify-between gap-x-4 gap-y-1`}>
            <span className="text-canada">{l.showcaseLabel}</span>
            <span className="font-semibold text-ink-2 tabular">
              {t.question.closes} {formatShortDate(lead.closesAt, locale)}
            </span>
          </p>
          <h2 id="showcase-q" className="m-0 font-display text-title font-bold text-balance sm:text-headline">
            <Link href={href(`/q/${lead.slug}`)} className="after:absolute after:inset-0 after:rounded-card hover:underline focus-visible:underline">
              {lead.question[locale]}
            </Link>
          </h2>
          <div className="grid gap-3">
            <p className="m-0 flex items-baseline gap-3">
              <span className="font-display text-stat font-bold tabular text-side-a-text">{pct(leadYes)}</span>
              <span className="grid text-body-sm text-ink-2">
                <span className="font-bold text-canada">{t.question.canadaSays}</span>
                {t.question.chance}
              </span>
              <span className="sr-only">{fill(l.showcaseSays, { value: pct(leadYes) })}</span>
            </p>
            <CrowdBar yes={leadYes} yesLabel={`${t.question.yes} ${pct(leadYes)}`} noLabel={`${t.question.no} ${pct(100 - leadYes)}`} />
          </div>
          <ProvinceSplit
            relative
            values={lead.provinces}
            title={t.province.title}
            summary={provinceSummary(lead, t.province, pct)}
            hidden={lead.hiddenProvinces}
            hiddenNote={t.province.hiddenNote}
            short={t.province.short}
            names={t.province.names}
            format={pct}
          />
          <p className="m-0 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-body-sm text-ink-2">
            <span className="tabular">{fill(l.showcaseCount, { n: formatCount(lead.forecasters, locale) })}</span>
            <span className="inline-flex items-center gap-1 font-semibold text-ink" aria-hidden="true">
              {l.showcaseOpen}
              <Icon name="arrow" className="size-4" />
            </span>
          </p>
        </article>
      </section>

      {/* At a glance: big numbers under a rule, not tiles. */}
      <section aria-label={l.stats.label}>
        <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4 lg:gap-x-10">
          {stats.map(([value, label]) => (
            <div key={label} className="grid content-start gap-1 border-t-2 border-ink pt-3">
              <dt className="order-2 text-body-sm text-ink-2">{label}</dt>
              <dd className="order-1 m-0 font-display text-headline font-bold tabular lg:text-display">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 mb-0 text-caption text-ink-2">{t.legal.sample}</p>
      </section>

      {/* How it works: three numbered columns divided by hairlines. */}
      <section id="how" aria-labelledby="how-title" className="grid scroll-mt-20 gap-8">
        <header className="grid gap-2">
          <h2 id="how-title" className={sectionTitle}>{l.how.title}</h2>
          <p className="m-0 text-body-lg text-ink-2">{l.how.lede}</p>
        </header>
        <ol className="m-0 grid list-none border-y border-line p-0 max-md:divide-y md:grid-cols-3 md:divide-x divide-line">
          {(["call", "see", "record"] as const).map((key, i) => (
            <li key={key} className="grid grid-cols-[auto_minmax(0,1fr)] content-start gap-x-5 gap-y-2 py-6 md:grid-cols-1 md:px-8 md:py-8 md:first:pl-0 md:last:pr-0">
              <span className="row-span-2 font-display text-display leading-none text-ink-3 tabular md:row-span-1 md:pb-3" aria-hidden="true">{i + 1}</span>
              <h3 className="m-0 font-display text-title-sm font-bold">{l.how.steps[key].title}</h3>
              <p className="m-0 text-body text-ink-2">{l.how.steps[key].body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* What makes it different: a ruled list, statement on the left, reason on the right. */}
      <section aria-labelledby="diff-title" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
        <header className="grid content-start gap-3">
          <h2 id="diff-title" className={sectionTitle}>{l.different.title}</h2>
          <p className="m-0 text-body-lg text-ink-2">{l.different.lede}</p>
        </header>
        <ul className="m-0 grid list-none border-t-2 border-ink p-0">
          {Object.entries(l.different.points).map(([key, point]) => (
            <li key={key} className="grid gap-x-8 gap-y-1 border-b border-line py-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <h3 className="m-0 font-display text-title-sm font-bold text-balance">{point.title}</h3>
              <p className="m-0 text-body text-ink-2">{point.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Topics: an index, not a row of cards. */}
      <section aria-labelledby="topics-title" className="grid gap-6">
        <h2 id="topics-title" className={sectionTitle}>{l.topics.title}</h2>
        <ul className="m-0 grid list-none grid-cols-2 gap-y-6 p-0 sm:grid-cols-3 lg:grid-cols-6">
          {categories.map((c) => (
            <li key={c} className="border-l border-line-strong">
              <Link href={href(`/browse/${c}`)} className="group grid h-full gap-0.5 px-4 py-1">
                <span className="font-display text-title-sm font-bold underline-offset-4 group-hover:underline">{t.board.categories[c]}</span>
                <span className="text-caption text-ink-2 tabular">{openByTopic[c] === 0 ? l.topics.none : openByTopic[c] === 1 ? l.topics.countOne : fill(l.topics.count, { n: openByTopic[c] })}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Trending: a ranked list with the crowd's number at the end of each row. */}
      {trending.length > 0 && (
        <section aria-labelledby="trending-title" className="grid gap-6">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="trending-title" className={sectionTitle}>{l.trending.title}</h2>
            <Link href={href("/board")} className="inline-flex items-center gap-1 text-body-sm font-semibold text-link underline-offset-4 hover:underline">
              {l.trending.all}
              <Icon name="arrow" className="size-4" />
            </Link>
          </header>
          <ol className="m-0 grid list-none border-t-2 border-ink p-0">
            {trending.map((q, i) => {
              const yes = crowdNow(q);
              return (
                <li key={q.slug} className="relative grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-x-4 gap-y-3 border-b border-line py-5 transition-colors duration-[var(--cn-duration-fast)] hover:bg-surface sm:grid-cols-[3rem_minmax(0,1fr)_11rem] sm:items-center sm:gap-x-6 sm:py-6">
                  <span className="font-display text-headline leading-none text-ink-3 tabular" aria-hidden="true">{i + 1}</span>
                  <div className="grid gap-1">
                    <h3 className="m-0 font-display text-title-sm font-bold text-balance sm:text-title">
                      <Link href={href(`/q/${q.slug}`)} className="after:absolute after:inset-0 hover:underline focus-visible:underline">
                        {q.question[locale]}
                      </Link>
                    </h3>
                    <p className="m-0 flex flex-wrap gap-x-2 text-body-sm text-ink-2 tabular">
                      <span className={q.scored ? "" : "text-side-b-text"}>{q.scored ? t.question.scored : t.question.poll}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {t.question.closes} {formatShortDate(q.closesAt, locale)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {formatCount(q.forecasters, locale)} {t.question.forecasters}
                      </span>
                    </p>
                  </div>
                  <div className="col-start-2 grid gap-2 sm:col-start-3">
                    <p className="m-0 flex items-baseline gap-2 sm:justify-end">
                      <span className="font-display text-headline font-bold leading-none tabular text-side-a-text">{pct(yes)}</span>
                      <span className="text-body-sm text-ink-2">{t.question.chance}</span>
                    </p>
                    <span className="flex h-1.5 bg-side-b" aria-hidden="true">
                      <span className="block h-full bg-side-a" style={{ width: `${yes}%` }} />
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* FAQ */}
      <section aria-labelledby="faq-title" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
        <h2 id="faq-title" className={sectionTitle}>{l.faq.title}</h2>
        <div className="grid divide-y divide-line border-y border-line">
          {Object.entries(l.faq.items).map(([key, item]) => (
            <details key={key} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-body-lg font-semibold [&::-webkit-details-marker]:hidden">
                {item.q}
                <svg viewBox="0 0 16 16" className="size-4 shrink-0 text-ink-2 transition-transform duration-[var(--cn-duration-base)] group-open:rotate-45" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" aria-hidden="true">
                  <path d="M8 2v12M2 8h12" />
                </svg>
              </summary>
              <p className="mt-0 mb-5 max-w-[64ch] text-body text-ink-2">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Closing call to action: a last line under a heavy rule. */}
      <section aria-labelledby="closing-title" className="grid gap-6 border-t-4 border-ink pt-8 pb-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-end lg:gap-16 lg:pt-12">
        <h2 id="closing-title" className="m-0 font-display text-display-sm font-bold tracking-tight text-balance sm:text-display">{l.closing.title}</h2>
        <div className="grid justify-items-start gap-5">
          <p className="m-0 max-w-[44ch] text-body-lg text-ink-2">{l.closing.body}</p>
          <Link href={href("/today")} className="inline-flex items-center gap-2 rounded-control bg-ink px-5 py-3 text-body font-bold text-paper transition-opacity duration-[var(--cn-duration-fast)] hover:opacity-90">
            {l.closing.action}
            <Icon name="arrow" className="size-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
