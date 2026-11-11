/*
 * Screen: one topic's board (e.g. /fr/browse/weather).
 * One message: every question in this topic, and where Canada stands on each.
 * One action: open a question.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { boardStrings } from "@/components/board-strings";
import { BoardView } from "@/components/board-view";
import { ScreenView } from "@/components/screen-view";
import { SAMPLE_NOW, sampleQuestions } from "@/content/sample-questions";
import { isLocale, locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { toBoardRow } from "@/lib/board";
import { formatCount } from "@/lib/format";
import { categories, isOpen, type Category } from "@/lib/question";
import { fill } from "@/lib/text";

type Params = Promise<{ locale: string; category: string }>;

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.flatMap((locale) => categories.map((category) => ({ locale, category })));
}

function isCategory(value: string): value is Category {
  return (categories as readonly string[]).includes(value);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, category } = await params;
  if (!isLocale(locale) || !isCategory(category)) return {};
  const t = getDictionary(locale);
  return {
    title: t.board.categories[category],
    description: t.browse.topics[category],
    alternates: { languages: { "en-CA": `/en/browse/${category}`, "fr-CA": `/fr/browse/${category}` } },
  };
}

export default async function CategoryPage({ params }: { params: Params }) {
  const { locale: raw, category } = await params;
  if (!isLocale(raw) || !isCategory(category)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const rows = sampleQuestions.filter((q) => q.category === category).map((q) => toBoardRow(q, SAMPLE_NOW));
  const open = rows.filter((r) => isOpen(r.state)).length;
  const calls = rows.reduce((n, r) => n + r.forecasters, 0);

  return (
    <div className="grid gap-6">
      <ScreenView locale={locale} screen="browse" />
      <nav aria-label={t.browse.title}>
        <Link href={`/${locale}/browse`} className="text-body-sm font-semibold text-link underline-offset-4 hover:underline">
          ← {t.browse.all}
        </Link>
      </nav>
      <header className="grid gap-2">
        <h1 className="m-0 font-display text-headline font-bold tracking-tight text-balance sm:text-display">{t.board.categories[category]}</h1>
        <p className="m-0 max-w-[60ch] text-body-lg text-ink-2">{t.browse.topics[category]}</p>
        <p className="m-0 flex gap-3 text-caption text-ink-2 tabular">
          <span className="font-semibold text-ink">{open === 1 ? t.browse.openCountOne : fill(t.browse.openCount, { n: formatCount(open, locale) })}</span>
          <span>{fill(t.browse.calls, { n: formatCount(calls, locale) })}</span>
        </p>
      </header>
      <BoardView rows={rows} locale={locale} t={boardStrings(t)} fixedTopic={category} todayHref={`/${locale}/today`} />
      <p className="m-0 text-caption text-ink-2">{t.legal.noValue}</p>
    </div>
  );
}
