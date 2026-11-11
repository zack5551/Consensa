/*
 * Screen: Today's five.
 * One message: five questions Canada is calling today, and where the crowd stands on each.
 * One action: make your call on the next one (the 60-second daily habit).
 * Layout: one lead with a Canada-red rule, then a numbered running order, so the five never read as identical cards.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdSlot } from "@/components/ad-slot";
import { ProvinceSplit } from "@/components/province-split";
import { CrowdBar } from "@/components/crowd-bar";
import { Icon } from "@/components/shell/icons";
import { StateBadge } from "@/components/state-badge";
import { YourCallBadge } from "@/components/your-call-badge";
import { ScreenView } from "@/components/screen-view";
import { TodayProgress } from "@/components/today-progress";
import { SAMPLE_NOW, todaysFive } from "@/content/sample-questions";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { formatCount, formatDayHeading, formatPercent, formatShortDate } from "@/lib/format";
import { crowdNow, provinceExtremes, questionState } from "@/lib/question";
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

  const kicker = "m-0 text-caption font-bold uppercase tracking-widest";
  const leadYes = crowdNow(lead);
  const leadState = questionState(lead, SAMPLE_NOW);

  return (
    <div className="grid gap-10 sm:gap-12">
      <ScreenView locale={locale} screen="today" />

      {/* Masthead: date kicker, display title, and the streak as a number under a rule (not a tile). */}
      <header className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-10">
        <div className="grid gap-2">
          <p className={`${kicker} text-ink-2`}>{capitalizeFirst(formatDayHeading(SAMPLE_NOW.toISOString(), locale))}</p>
          <h1 className="m-0 font-display text-headline font-bold tracking-tight text-balance sm:text-display">{t.today.title}</h1>
          <p className="m-0 max-w-prose text-body text-ink-2">{t.today.subtitle}</p>
        </div>
        <div className="grid content-start gap-1 border-t-2 border-ink pt-3 sm:min-w-[220px]">
          <p className="m-0 font-display text-title font-bold tabular">{fill(t.today.streak, { n: SAMPLE_STREAK })}</p>
          <p className="m-0 text-body-sm text-ink-2">{t.today.streakHint}</p>
        </div>
      </header>

      <TodayProgress slugs={five.map((q) => q.slug)} locale={locale} template={t.today.progress} done={t.today.progressDone} />

      {/* The lead earns the one strong move: Canada-red top rule, serif question, the number at stat size. No shadow. */}
      <article aria-labelledby="lead-q" className="relative grid gap-6 rounded-card border border-line border-t-4 border-t-canada bg-surface p-5 sm:p-8">
        <p className={`${kicker} flex flex-wrap items-center justify-between gap-x-4 gap-y-1`}>
          <span className="text-canada">{t.today.lead}</span>
          <span className="flex flex-wrap items-center gap-3 font-semibold text-ink-2 tabular">
            {leadState === "closingSoon" && <StateBadge state={leadState} label={t.states[leadState]} />}
            <span>
              {t.question.closes} {formatShortDate(lead.closesAt, locale)}
            </span>
            <span aria-hidden="true">·</span>
            <span>{lead.scored ? t.question.scored : t.question.poll}</span>
          </span>
        </p>
        <h2 id="lead-q" className="m-0 font-display text-title font-bold text-balance sm:text-headline">
          <Link href={href(lead.slug)} className="after:absolute after:inset-0 after:rounded-card hover:underline focus-visible:underline">
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
          </p>
          <CrowdBar yes={leadYes} yesLabel={`${t.question.yes} ${pct(leadYes)}`} noLabel={`${t.question.no} ${pct(100 - leadYes)}`} />
        </div>
        <ProvinceSplit
          relative
          values={lead.provinces}
          title={t.province.title}
          summary={fill(t.province.summary, { high: t.province.names[high], highValue: pct(lead.provinces[high]), low: t.province.names[low], lowValue: pct(lead.provinces[low]) })}
          short={t.province.short}
          names={t.province.names}
          format={pct}
        />
        <p className="m-0 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-body-sm text-ink-2">
          <span className="inline-flex items-center gap-2 tabular">
            <span className="size-2 rounded-full bg-canada" aria-hidden="true" />
            {formatCount(lead.forecasters, locale)} {t.question.forecasters}
          </span>
          <span className="relative z-10 flex items-center gap-3">
            <YourCallBadge slug={lead.slug} template={t.question.yourCall} format={locale} />
            <span className="inline-flex items-center gap-1 font-semibold text-ink" aria-hidden="true">
              {t.question.makeYourCall}
              <Icon name="arrow" className="size-4" />
            </span>
          </span>
        </p>
      </article>

      {/* The other four: a numbered running order under a heavy rule, not four identical cards. */}
      <ol className="m-0 grid list-none border-t-2 border-ink p-0" aria-label={t.today.title}>
        {rest.flatMap((q, i) => {
          const state = questionState(q, SAMPLE_NOW);
          const yes = crowdNow(q);
          return [
            ...(i === 2
              ? [
                  <li key="ad" className="grid py-6">
                    <AdSlot slot="today-native" locale={locale} t={t.ads} />
                  </li>,
                ]
              : []),
            <li key={q.slug} className="grid border-b border-line">
              <article
                aria-labelledby={`q-${q.slug}`}
                className={`relative grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 py-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-x-8 sm:py-6`}
              >
                <span className="font-display text-title font-bold text-ink-3 tabular" aria-hidden="true">
                  {String(i + 2).padStart(2, "0")}
                </span>
                <div className="grid gap-2">
                  <p className={`${kicker} flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-2`}>
                    {state === "closingSoon" ? <StateBadge state={state} label={t.states[state]} /> : null}
                    <span className="tabular">
                      {t.question.closes} {formatShortDate(q.closesAt, locale)}
                    </span>
                    {!q.scored && <span className="text-side-b-text">{t.question.poll}</span>}
                  </p>
                  <h3 id={`q-${q.slug}`} className="m-0 font-display text-title-sm font-bold text-balance sm:text-title">
                    <Link href={href(q.slug)} className="after:absolute after:inset-0 hover:underline focus-visible:underline">
                      {q.question[locale]}
                    </Link>
                  </h3>
                  <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-ink-2">
                    <span className="tabular">
                      {formatCount(q.forecasters, locale)} {t.question.forecasters}
                    </span>
                    <span className="relative z-10">
                      <YourCallBadge slug={q.slug} template={t.question.yourCall} format={locale} />
                    </span>
                  </p>
                </div>
                <p className="col-start-2 m-0 flex items-baseline gap-2 sm:col-start-3 sm:grid sm:justify-items-end sm:gap-0 sm:text-right">
                  <span className={`font-display text-headline font-bold tabular ${yes < 50 ? "text-side-b-text" : "text-side-a-text"}`}>{pct(yes)}</span>
                  <span className="text-caption text-ink-2">
                    <span className="font-bold text-canada">{t.question.canadaSays}</span> {t.question.chance}
                  </span>
                </p>
              </article>
            </li>,
          ];
        })}
      </ol>

      <div className="grid justify-items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <p className="m-0 text-caption text-ink-2">{t.legal.noValue}</p>
        <Link href={`/${locale}/board`} className="inline-flex min-h-11 items-center gap-1 py-2 text-body font-semibold text-ink underline decoration-line-strong underline-offset-8 hover:decoration-ink">
          {t.today.seeBoard}
          <Icon name="arrow" className="size-4" />
        </Link>
      </div>
    </div>
  );
}
