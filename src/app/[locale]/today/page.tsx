/*
 * Screen: Today's five.
 * One message: five questions Canada is calling today, and where the crowd stands on each.
 * One action: make your call on the next one (the 60-second daily habit).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdSlot } from "@/components/ad-slot";
import { ProvinceSplit } from "@/components/province-split";
import { QuestionCard } from "@/components/question-card";
import { ScreenView } from "@/components/screen-view";
import { TodayProgress } from "@/components/today-progress";
import { SAMPLE_NOW, todaysFive } from "@/content/sample-questions";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { formatDayHeading, formatPercent } from "@/lib/format";
import { provinceExtremes, questionState } from "@/lib/question";
import { fill } from "@/lib/text";

/** "vendredi 6 novembre" → "Vendredi 6 novembre" (CSS capitalize would also capitalize the month). */
function capitalizeFirst(s: string): string {
  return s.charAt(0).toLocaleUpperCase() + s.slice(1);
}

/** Sample streak until accounts store real ones (M2). */
const SAMPLE_STREAK = 4;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return { title: t.today.title, alternates: { languages: { "en-CA": "/en/today", "fr-CA": "/fr/today" } } };
}

export default async function TodayPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const five = todaysFive();
  const [lead, ...rest] = five;
  if (!lead) notFound();
  const pct = (v: number) => formatPercent(v, locale);
  const { high, low } = provinceExtremes(lead.provinces);
  const href = (slug: string) => `/${locale}/q/${slug}`;

  return (
    <div className="grid gap-8">
      <ScreenView locale={locale} screen="today" />

      <header className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="grid gap-1">
          <p className="m-0 text-body-sm font-semibold text-ink-2">{capitalizeFirst(formatDayHeading(SAMPLE_NOW.toISOString(), locale))}</p>
          <h1 className="m-0 font-display text-headline font-extrabold tracking-tight">{t.today.title}</h1>
          <p className="m-0 text-body text-ink-2">{t.today.subtitle}</p>
        </div>
        <div className="grid gap-1 rounded-card border border-line bg-surface px-4 py-3 sm:min-w-[240px]">
          <p className="m-0 flex items-center gap-2 font-display text-title-sm font-bold">
            <svg viewBox="0 0 16 16" className="size-4 shrink-0" aria-hidden="true">
              <path d="M8 1c.5 3 4 4.5 4 8.5A4 4 0 0 1 8 14a4 4 0 0 1-4-4.5C4 7 6 6 6 3.5 7 4.5 7.5 5.5 7.5 6.5 8.5 5 8 3 8 1Z" fill="var(--cn-side-a)" />
            </svg>
            {fill(t.today.streak, { n: SAMPLE_STREAK })}
          </p>
          <p className="m-0 text-caption text-ink-2">{t.today.streakHint}</p>
        </div>
      </header>

      <TodayProgress slugs={five.map((q) => q.slug)} locale={locale} template={t.today.progress} done={t.today.progressDone} />

      <section aria-labelledby="lead-label" className="grid gap-3">
        <h2 id="lead-label" className="m-0 text-caption font-bold uppercase tracking-wide text-ink-2">
          {t.today.lead}
        </h2>
        <QuestionCard q={lead} locale={locale} t={t.question} states={t.states} state={questionState(lead, SAMPLE_NOW)} href={href(lead.slug)} lead>
          <div className="relative z-10 border-t border-line pt-3">
            <ProvinceSplit
              values={lead.provinces}
              title={t.province.title}
              summary={fill(t.province.summary, { high: t.province.names[high], highValue: pct(lead.provinces[high]), low: t.province.names[low], lowValue: pct(lead.provinces[low]) })}
              short={t.province.short}
              names={t.province.names}
              format={pct}
            />
          </div>
        </QuestionCard>
      </section>

      <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2" aria-label={t.today.title}>
        {rest.flatMap((q, i) => [
          ...(i === 2
            ? [
                <li key="ad" className="grid md:col-span-2">
                  <AdSlot slot="today-native" locale={locale} t={t.ads} />
                </li>,
              ]
            : []),
          <li key={q.slug} className="grid">
            <QuestionCard q={q} locale={locale} t={t.question} states={t.states} state={questionState(q, SAMPLE_NOW)} href={href(q.slug)} />
          </li>,
        ])}
      </ul>

      <div className="grid justify-items-center gap-3 border-t border-line pt-6 text-center">
        <Link href={`/${locale}/board`} className="inline-flex min-h-11 items-center rounded-control border border-line bg-surface px-4 py-2 text-body-sm font-semibold hover:bg-sunken">
          {t.today.seeBoard} →
        </Link>
        <p className="m-0 text-caption text-ink-2">{t.legal.noValue}</p>
      </div>
    </div>
  );
}
