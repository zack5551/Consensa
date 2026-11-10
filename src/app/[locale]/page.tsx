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
import { QuestionCard } from "@/components/question-card";
import { ScreenView } from "@/components/screen-view";
import { Icon } from "@/components/shell/icons";
import { localeHref } from "@/components/shell/nav-items";
import { SAMPLE_NOW, sampleQuestions, todaysFive } from "@/content/sample-questions";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { formatCount, formatPercent } from "@/lib/format";
import { categories, crowdNow, isOpen, provinceExtremes, provinces, questionState } from "@/lib/question";
import { fill } from "@/lib/text";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return { title: { absolute: t.meta.title }, alternates: { canonical: `/${locale}`, languages: { "en-CA": "/en", "fr-CA": "/fr" } } };
}

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const l = t.landing;
  const pct = (v: number) => formatPercent(v, locale);
  const href = (path: string) => localeHref(locale, path);

  const open = sampleQuestions.filter((q) => isOpen(questionState(q, SAMPLE_NOW)));
  const lead = todaysFive()[0] ?? open[0] ?? sampleQuestions[0]!;
  const leadYes = crowdNow(lead);
  const { high, low } = provinceExtremes(lead.provinces);
  const trending = [...open].filter((q) => q.slug !== lead.slug).sort((a, b) => b.forecasters - a.forecasters).slice(0, 3);
  const totalCalls = open.reduce((sum, q) => sum + q.forecasters, 0);
  const openByTopic = Object.fromEntries(categories.map((c) => [c, open.filter((q) => q.category === c).length])) as Record<(typeof categories)[number], number>;

  const stats = [
    [formatCount(totalCalls, locale), l.stats.forecasters],
    [formatCount(open.length, locale), l.stats.questions],
    [formatCount(provinces.length, locale), l.stats.regions],
    [formatCount(2, locale), l.stats.languages],
  ] as const;

  return (
    <div className="grid gap-16 sm:gap-24">
      <ScreenView locale={locale} screen="landing" />

      {/* Hero: the promise on the left, the proof (a live question) on the right. */}
      <section aria-labelledby="hero-title" className="grid items-center gap-10 pt-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16 lg:pt-8">
        <div className="grid gap-5">
          <p className="m-0 inline-flex w-fit items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-caption font-semibold text-ink-2">
            <span className="size-1.5 rounded-full bg-canada" aria-hidden="true" />
            {l.eyebrow}
          </p>
          <h1 id="hero-title" className="m-0 font-display text-display-sm font-extrabold tracking-tight text-balance sm:text-display lg:text-display-lg">
            {l.title}
          </h1>
          <p className="m-0 max-w-[52ch] text-body-lg text-ink-2">{l.lede}</p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link href={href("/today")} className="inline-flex items-center gap-2 rounded-control bg-ink px-5 py-3 text-body font-bold text-paper transition-opacity duration-[var(--cn-duration-fast)] hover:opacity-90">
              {l.primary}
              <Icon name="arrow" className="size-4" />
            </Link>
            <Link href={href("/board")} className="inline-flex items-center rounded-control border border-line bg-surface px-5 py-3 text-body font-semibold text-ink transition-colors duration-[var(--cn-duration-fast)] hover:bg-sunken">
              {l.secondary}
            </Link>
          </div>
          <p className="m-0 text-caption text-ink-2">{t.legal.noValue}</p>
        </div>

        <article aria-labelledby="showcase-q" className="relative grid gap-5 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
          <p className="m-0 flex items-center gap-2 text-caption font-bold uppercase tracking-wide text-canada">
            <span className="relative flex size-2" aria-hidden="true">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-canada opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex size-2 rounded-full bg-canada" />
            </span>
            {l.showcaseLabel}
          </p>
          <h2 id="showcase-q" className="m-0 text-title font-bold leading-snug text-balance">
            <Link href={href(`/q/${lead.slug}`)} className="after:absolute after:inset-0 after:rounded-card hover:underline focus-visible:underline">
              {lead.question[locale]}
            </Link>
          </h2>
          <div className="grid gap-1">
            <p className="m-0 text-caption font-bold text-canada">{t.question.canadaSays}</p>
            <p className="m-0 flex items-baseline gap-2">
              <span className="font-display text-stat font-extrabold tabular text-side-a-text">{pct(leadYes)}</span>
              <span className="text-body text-ink-2">{t.question.chance}</span>
              <span className="sr-only">{fill(l.showcaseSays, { value: pct(leadYes) })}</span>
            </p>
          </div>
          <CrowdBar yes={leadYes} yesLabel={`${t.question.yes} ${pct(leadYes)}`} noLabel={`${t.question.no} ${pct(100 - leadYes)}`} />
          <ProvinceSplit
            values={lead.provinces}
            title={t.province.title}
            summary={fill(t.province.summary, { high: t.province.names[high], highValue: pct(lead.provinces[high]), low: t.province.names[low], lowValue: pct(lead.provinces[low]) })}
            short={t.province.short}
            names={t.province.names}
            format={pct}
          />
          <p className="m-0 flex items-center justify-between gap-3 border-t border-line pt-4 text-body-sm text-ink-2">
            <span className="tabular">{fill(l.showcaseCount, { n: formatCount(lead.forecasters, locale) })}</span>
            <span className="inline-flex items-center gap-1 font-semibold text-ink" aria-hidden="true">
              {l.showcaseOpen}
              <Icon name="arrow" className="size-4" />
            </span>
          </p>
        </article>
      </section>

      {/* At a glance */}
      <section aria-label={l.stats.label}>
        <dl className="m-0 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line lg:grid-cols-4">
          {stats.map(([value, label]) => (
            <div key={label} className="grid gap-1 bg-surface p-5">
              <dt className="order-2 text-body-sm text-ink-2">{label}</dt>
              <dd className="order-1 m-0 font-display text-headline font-extrabold tabular">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 mb-0 text-caption text-ink-2">{t.legal.sample}</p>
      </section>

      {/* How it works */}
      <section id="how" aria-labelledby="how-title" className="grid scroll-mt-20 gap-8">
        <header className="grid gap-2">
          <h2 id="how-title" className="m-0 font-display text-headline font-extrabold tracking-tight">{l.how.title}</h2>
          <p className="m-0 text-body-lg text-ink-2">{l.how.lede}</p>
        </header>
        <ol className="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
          {(["call", "see", "record"] as const).map((key, i) => (
            <li key={key} className="grid content-start gap-3 rounded-card border border-line bg-surface p-6">
              <StepArt step={i} />
              <h3 className="m-0 text-title-sm font-bold">
                <span className="mr-2 font-display text-ink-3 tabular" aria-hidden="true">{i + 1}</span>
                {l.how.steps[key].title}
              </h3>
              <p className="m-0 text-body text-ink-2">{l.how.steps[key].body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* What makes it different */}
      <section aria-labelledby="diff-title" className="grid gap-8">
        <header className="grid gap-2">
          <h2 id="diff-title" className="m-0 font-display text-headline font-extrabold tracking-tight text-balance">{l.different.title}</h2>
          <p className="m-0 text-body-lg text-ink-2">{l.different.lede}</p>
        </header>
        <ul className="m-0 grid list-none gap-x-8 gap-y-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(l.different.points).map(([key, point]) => (
            <li key={key} className="grid content-start gap-2 border-t-2 border-ink pt-4">
              <h3 className="m-0 text-body-lg font-bold">{point.title}</h3>
              <p className="m-0 text-body text-ink-2">{point.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Topics */}
      <section aria-labelledby="topics-title" className="grid gap-6">
        <h2 id="topics-title" className="m-0 font-display text-headline font-extrabold tracking-tight">{l.topics.title}</h2>
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-6">
          {categories.map((c) => (
            <li key={c}>
              <Link
                href={href(`/browse/${c}`)}
                className="grid h-full gap-1 rounded-card border border-line bg-surface p-4 transition-colors duration-[var(--cn-duration-fast)] hover:border-line-strong hover:bg-sunken"
              >
                <span className="text-body font-bold">{t.board.categories[c]}</span>
                <span className="text-caption text-ink-2 tabular">{openByTopic[c] === 0 ? l.topics.none : openByTopic[c] === 1 ? l.topics.countOne : fill(l.topics.count, { n: openByTopic[c] })}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Trending */}
      {trending.length > 0 && (
        <section aria-labelledby="trending-title" className="grid gap-6">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="trending-title" className="m-0 font-display text-headline font-extrabold tracking-tight">{l.trending.title}</h2>
            <Link href={href("/board")} className="inline-flex items-center gap-1 text-body-sm font-semibold text-link underline-offset-4 hover:underline">
              {l.trending.all}
              <Icon name="arrow" className="size-4" />
            </Link>
          </header>
          <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
            {trending.map((q) => (
              <li key={q.slug} className="grid">
                <QuestionCard q={q} locale={locale} t={t.question} states={t.states} state={questionState(q, SAMPLE_NOW)} href={href(`/q/${q.slug}`)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* FAQ */}
      <section aria-labelledby="faq-title" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
        <h2 id="faq-title" className="m-0 font-display text-headline font-extrabold tracking-tight">{l.faq.title}</h2>
        <div className="grid divide-y divide-line border-y border-line">
          {Object.entries(l.faq.items).map(([key, item]) => (
            <details key={key} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-body-lg font-semibold [&::-webkit-details-marker]:hidden">
                {item.q}
                <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-ink-2 transition-transform duration-[var(--cn-duration-base)] group-open:rotate-45" aria-hidden="true">
                  <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M8 3v10M3 8h10" />
                  </svg>
                </span>
              </summary>
              <p className="mt-0 mb-4 max-w-[64ch] text-body text-ink-2">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Closing call to action */}
      <section aria-labelledby="closing-title" className="grid justify-items-center gap-4 rounded-card bg-ink px-6 py-12 text-center text-paper sm:py-16">
        <svg viewBox="0 0 100 100" className="size-10" aria-hidden="true">
          <path fill="var(--cn-side-a)" d="M47 .09A50 50 0 0 0 47 99.91V59.014a9.5 9.5 0 0 1 0-18.028Z" />
          <path fill="var(--cn-side-b)" d="M53 .09a50 50 0 0 1 0 99.82V59.014a9.5 9.5 0 0 0 0-18.028Z" />
          <circle fill="var(--cn-accent)" cx="50" cy="50" r="6.5" />
        </svg>
        <h2 id="closing-title" className="m-0 font-display text-headline font-extrabold tracking-tight text-balance sm:text-display-sm">{l.closing.title}</h2>
        <p className="m-0 max-w-[48ch] text-body-lg opacity-80">{l.closing.body}</p>
        <Link href={href("/today")} className="mt-2 inline-flex items-center gap-2 rounded-control bg-paper px-5 py-3 text-body font-bold text-ink transition-opacity duration-[var(--cn-duration-fast)] hover:opacity-90">
          {l.closing.action}
          <Icon name="arrow" className="size-4" />
        </Link>
      </section>
    </div>
  );
}

/** Small, decorative illustrations for the three steps, drawn from the brand tokens. */
function StepArt({ step }: { step: number }) {
  return (
    <svg viewBox="0 0 120 48" className="h-12 w-[7.5rem]" aria-hidden="true">
      {step === 0 && (
        <>
          <rect x="4" y="21" width="112" height="6" rx="3" fill="var(--cn-surface-sunken)" />
          <rect x="4" y="21" width="70" height="6" rx="3" fill="var(--cn-side-a)" />
          <circle cx="74" cy="24" r="10" fill="var(--cn-surface)" stroke="var(--cn-side-a)" strokeWidth="3" />
        </>
      )}
      {step === 1 && (
        <>
          {[30, 38, 34, 26, 20, 28].map((h, i) => (
            <g key={i}>
              <rect x={6 + i * 19} y="4" width="13" height="40" rx="3" fill="var(--cn-side-b-soft)" />
              <rect x={6 + i * 19} y={44 - h} width="13" height={h} rx="3" fill="var(--cn-side-a)" />
            </g>
          ))}
        </>
      )}
      {step === 2 && (
        <>
          <path d="M4 40 L28 32 L52 34 L76 20 L100 14" fill="none" stroke="var(--cn-side-a)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="100" cy="14" r="6" fill="var(--cn-accent)" />
        </>
      )}
    </svg>
  );
}
