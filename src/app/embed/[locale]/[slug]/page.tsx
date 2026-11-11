/*
 * Screen: media embed widget (/embed/en/boc-cut-dec-2026), for Canadian newsrooms to drop into an article.
 * One message: where Canada lands on this question right now, by province.
 * One action: make your call on Consensa (opens in a new tab, tagged utm_source=embed).
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CrowdBar } from "@/components/crowd-bar";
import { ProvinceSplit } from "@/components/province-split";
import { Wordmark } from "@/components/wordmark";
import { getQuestion, SAMPLE_NOW, sampleQuestions } from "@/content/sample-questions";
import { withLiveQuestion } from "@/lib/live";
import { isLocale, locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { formatCount, formatPercent } from "@/lib/format";
import { crowdNow, isOpen, provinceExtremes, questionState } from "@/lib/question";
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
  return { title: q.question[locale], robots: { index: false } };
}

export default async function EmbedPage({ params }: { params: Params }) {
  const { locale: raw, slug } = await params;
  const q = await withLiveQuestion(getQuestion(slug));
  if (!isLocale(raw) || !q) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const yes = crowdNow(q);
  const pct = (v: number) => formatPercent(v, locale);
  const open = isOpen(questionState(q, SAMPLE_NOW));
  const { high, low } = provinceExtremes(q.provinces);
  const href = `/${locale}/q/${q.slug}?utm_source=embed`;

  return (
    <main className="mx-auto grid max-w-[560px] gap-3 rounded-card border border-line bg-surface p-4 text-ink shadow-card">
      <p className="m-0 flex items-center justify-between gap-2 border-b border-line pb-3 text-caption text-ink-2">
        <Wordmark className="text-body" />
        <span>{t.embed.poweredBy}</span>
      </p>
      <h1 className="m-0 font-display text-title-sm font-bold leading-snug text-balance">{q.question[locale]}</h1>
      <p className="m-0 flex flex-wrap items-baseline gap-x-2">
        <span className="text-body-sm font-bold text-canada">{open ? t.question.canadaSays : t.question.canadaSaid}</span>
        <span className="font-display text-headline font-semibold tabular text-side-a-text">{pct(yes)}</span>
        <span className="text-body-sm text-ink-2">{t.question.chance}</span>
      </p>
      <CrowdBar yes={yes} yesLabel={`${t.question.yes} ${pct(yes)}`} noLabel={`${t.question.no} ${pct(100 - yes)}`} />
      <ProvinceSplit
        values={q.provinces}
        title={t.province.title}
        summary={fill(t.province.summary, { high: t.province.names[high], highValue: pct(q.provinces[high]), low: t.province.names[low], lowValue: pct(q.provinces[low]) })}
        short={t.province.short}
        names={t.province.names}
        format={pct}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-caption text-ink-2">
          {formatCount(q.forecasters, locale)} {t.question.forecasters}
        </span>
        <a href={href} target="_blank" rel="noopener" className="rounded-control bg-ink px-3 py-2 text-body-sm font-bold text-paper hover:opacity-90">
          {open ? t.embed.cta : t.embed.closed} ↗
        </a>
      </div>
      <p className="m-0 text-caption text-ink-2">{t.legal.noValue}</p>
    </main>
  );
}
