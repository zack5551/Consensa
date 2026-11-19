/*
 * Screen: "Called it!" (the page behind a shared called-it link).
 * One message: someone called this question right, and here is the official answer.
 * One action: make your call (go to the Board).
 * Privacy: the address holds the question and the side that happened, and nothing else. No name, no account, no call
 * value, so this page is the same for everyone and says nothing about who shared it.
 * It exists only for a scored question whose official yes-or-no result is in and not under review, and only for the side
 * that happened. An open, disputed, unscored, cancelled or voided question has no page (404) and no card.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AskedByLabel } from "@/components/asked-by-label";
import { SportsNotice } from "@/components/sports-notice";
import { getQuestion, SAMPLE_NOW, sampleQuestions } from "@/content/sample-questions";
import { isLocale, locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { askedByLabel } from "@/lib/asked-by";
import { BRAND_NAME } from "@/lib/brand";
import { formatCount, formatLongDate, formatPercent } from "@/lib/format";
import { withLiveQuestion } from "@/lib/live";
import { crowdNow } from "@/lib/question";
import { calledItCards, calledItFooter, crowdForCard, hasCalledItCard } from "@/lib/share";
import { fill } from "@/lib/text";

type Params = Promise<{ locale: string; slug: string; side: string }>;

export const dynamicParams = false;

/** A real crowd number refreshes on the same one-minute clock as the question page and the card. */
export const revalidate = 60;

export function generateStaticParams() {
  return locales.flatMap((locale) => calledItCards(sampleQuestions, SAMPLE_NOW).map((card) => ({ locale, ...card })));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug, side } = await params;
  // The same live source as the page, so a live result gets matching metadata.
  const q = await withLiveQuestion(getQuestion(slug));
  if (!isLocale(locale) || !q || !hasCalledItCard(q, side, SAMPLE_NOW)) return {};
  const t = getDictionary(locale);
  const title = fill(t.share.calledItPageTitle, { question: q.question[locale] });
  const description = `${fill(t.resolution.answerIs, { answer: side === "yes" ? t.question.yes : t.question.no })}. ${t.legal.noValue}`;
  return {
    title,
    description,
    // A share page, not content: the question page is the one to index, so no canonical or hreflang links here.
    robots: { index: false },
    // The card comes from opengraph-image.tsx beside this file, so no image is named here; X falls back to it for the large card.
    openGraph: { type: "website", siteName: BRAND_NAME, locale: `${locale}_CA`, title, description, url: `/${locale}/q/${slug}/called-it/${side}` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function CalledItPage({ params }: { params: Params }) {
  const { locale: raw, slug, side } = await params;
  const q = await withLiveQuestion(getQuestion(slug));
  const result = q?.resolution.result;
  if (!isLocale(raw) || !q || !result || !hasCalledItCard(q, side, SAMPLE_NOW)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const crowd = crowdForCard(q, crowdNow(q));
  const legal = calledItFooter(t, q.category);

  return (
    <article className="mx-auto grid w-full max-w-2xl gap-6">
      {/* The same card as the picture: a Canada-red rule, the headline, the question, the official answer. */}
      <section aria-labelledby="called-it-title" className="grid gap-5 rounded-card border border-line border-t-4 border-t-canada bg-surface p-6 shadow-card">
        <header className="grid gap-3">
          <h1 id="called-it-title" className="m-0 font-display text-display font-bold leading-none tracking-tight text-side-a-text">
            {t.call.calledIt}
          </h1>
          <AskedByLabel label={q.askedBy && askedByLabel(q.askedBy, t.question.askedBy)} className="text-body-sm" />
          <p className="m-0 font-display text-title font-bold leading-tight tracking-tight text-balance">{q.question[locale]}</p>
          <p className="m-0 max-w-[62ch] text-body text-ink-2">{t.share.calledItLead}</p>
        </header>

        <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-2 text-body-sm text-ink-2">
          <span className="rounded-full bg-ink px-3 py-1 font-bold text-paper">{fill(t.resolution.answerIs, { answer: side === "yes" ? t.question.yes : t.question.no })}</span>
          <span>{fill(t.share.calledItResult, { date: formatLongDate(result.publishedAt, locale) })}</span>
        </p>

        {/* The crowd's chance of yes, only when it is real and from 5 calls up (crowdForCard): a shared page carries no "sample numbers" notice. */}
        {crowd !== null && (
          <p className="m-0 border-t border-line pt-4 text-body-sm text-ink-2">
            <span className="text-ink tabular">{fill(t.share.calledItCrowd, { crowd: formatPercent(crowd, locale) })}</span> ·{" "}
            {fill(t.share.cardCalls, { n: formatCount(q.forecasters, locale) })}
          </p>
        )}

        <Link href={`/${locale}/board`} className="inline-flex min-h-12 items-center justify-center justify-self-start rounded-control bg-ink px-5 py-3 text-body font-bold text-paper hover:opacity-90">
          {t.question.makeYourCall}
        </Link>
      </section>

      {/* LEX: the card's own legal line, then the site's no-value label; sports adds the fan-forecast notice. */}
      <div className="grid gap-1 text-caption text-ink-2">
        <p className="m-0">{legal.footer}</p>
        <p className="m-0">{t.legal.noValue}</p>
      </div>
      {q.category === "sports" && <SportsNotice label={t.legal.sportsLabel} footer={t.legal.sportsFooter} />}
    </article>
  );
}
