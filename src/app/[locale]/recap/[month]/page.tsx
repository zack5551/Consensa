/*
 * Screen: a month on CANsensus ("October on CANsensus"), the page behind a shared monthly recap.
 * One message: these are the questions the official sources answered that month.
 * One action: make your call (go to the Board).
 * Privacy: the address holds the month and nothing else. The person's own numbers travel only in the text they chose to
 * post, never through this page or its picture, so it is the same for everyone and says nothing about who shared it.
 * It exists only for a finished month with at least one answered, scored question; anything else is a 404.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sampleQuestions } from "@/content/sample-questions";
import { siteNow } from "@/lib/clock";
import { answeredQuestions, localizedAnswered, monthKey, recapMonths } from "@/lib/come-back";
import { isLocale, locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { BRAND_NAME } from "@/lib/brand";
import { capitalize, formatLongDate, formatMonth } from "@/lib/format";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import { fill } from "@/lib/text";

type Params = Promise<{ locale: string; month: string }>;

export const dynamicParams = false;
export const revalidate = 300;

export function generateStaticParams() {
  return locales.flatMap((locale) => recapMonths(answeredQuestions(sampleQuestions, siteNow()), siteNow()).map((month) => ({ locale, month })));
}

function exists(month: string): boolean {
  return recapMonths(answeredQuestions(sampleQuestions, siteNow()), siteNow()).includes(month);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, month } = await params;
  if (!isLocale(locale) || !exists(month)) return notFoundMetadata(locale);
  const t = getDictionary(locale);
  const name = formatMonth(month, locale, { year: true });
  const title = capitalize(fill(t.recapPage.title, { month: name }));
  const description = `${fill(t.recapPage.description, { month: name })} ${t.legal.noValue}`;
  return {
    title,
    description,
    // A share page, not content: not indexed, and no canonical or hreflang links.
    robots: { index: false },
    openGraph: { type: "website", siteName: BRAND_NAME, locale: `${locale}_CA`, title, description, url: `/${locale}/recap/${month}` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function RecapMonthPage({ params }: { params: Params }) {
  const { locale: raw, month } = await params;
  if (!isLocale(raw) || !exists(month)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const name = formatMonth(month, locale, { year: true });
  const answered = localizedAnswered(sampleQuestions, locale, siteNow())
    .filter((q) => monthKey(q.publishedAt) === month)
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));

  return (
    <article className="mx-auto grid w-full max-w-2xl gap-6">
      <section aria-labelledby="recap-title" className="grid gap-5 rounded-card border border-line border-t-4 border-t-canada bg-surface p-6 shadow-card">
        <header className="grid gap-3">
          <h1 id="recap-title" className="m-0 font-display text-headline font-bold tracking-tight text-balance sm:text-display-sm">
            {capitalize(fill(t.recapPage.title, { month: name }))}
          </h1>
          <p className="m-0 max-w-[62ch] text-body text-ink-2">{fill(t.recapPage.lead, { month: name })}</p>
        </header>

        <ul className="m-0 grid list-none border-t border-line p-0">
          {answered.map((q) => (
            <li key={q.slug} className="grid gap-1 border-b border-line py-3">
              <span className="text-body-sm font-semibold text-ink">{q.question}</span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-2">
                <span data-side={q.outcome} className={`rounded-full px-2.5 py-0.5 font-bold text-on-fill ${q.outcome === "yes" ? "bg-side-a" : "bg-side-b"}`}>
                  {fill(t.resolution.answerIs, { answer: q.outcome === "yes" ? t.question.yes : t.question.no })}
                </span>
                <span>{fill(t.recapPage.answered, { date: formatLongDate(q.publishedAt, locale) })}</span>
              </span>
            </li>
          ))}
        </ul>

        <Link href={`/${locale}/board`} className="inline-flex min-h-12 items-center justify-center justify-self-start rounded-control bg-ink px-5 py-3 text-body font-bold text-paper hover:opacity-90">
          {t.question.makeYourCall}
        </Link>
      </section>
      <p className="m-0 text-caption text-ink-2">{t.legal.noValue}</p>
    </article>
  );
}
