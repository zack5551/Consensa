/*
 * Screen: search.
 * One message: any question, found by topic, place or source, in either language.
 * One action: type, then open a result.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ScreenView } from "@/components/screen-view";
import { SearchView, type SearchDoc } from "@/components/search-view";
import { SAMPLE_NOW, sampleQuestions } from "@/content/sample-questions";
import en from "@/i18n/dictionaries/en";
import fr from "@/i18n/dictionaries/fr";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { sortRows, toBoardRow } from "@/lib/board";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return { title: t.search.title, robots: { index: false }, alternates: { languages: { "en-CA": "/en/search", "fr-CA": "/fr/search" } } };
}

/**
 * Every question is indexed in both languages, whatever the reader's locale. Weights: the question
 * itself (3), its topic name (2), and its official source (1). Popular questions win ties.
 */
function buildDocs(): SearchDoc[] {
  const byPopularity = sortRows(
    sampleQuestions.map((q) => toBoardRow(q, SAMPLE_NOW)),
    "popular",
  );
  return byPopularity.map((row) => {
    const q = sampleQuestions.find((x) => x.slug === row.slug)!;
    return {
      row,
      fields: [
        { text: q.question.en, weight: 3 },
        { text: q.question.fr, weight: 3 },
        { text: en.board.categories[q.category], weight: 2 },
        { text: fr.board.categories[q.category], weight: 2 },
        { text: q.resolution.source.name.en, weight: 1 },
        { text: q.resolution.source.name.fr, weight: 1 },
      ],
    };
  });
}

export default async function SearchPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);

  return (
    <div className="mx-auto grid w-full max-w-[760px] gap-8">
      <ScreenView locale={locale} screen="search" />
      <h1 className="m-0 font-display text-headline font-bold tracking-tight text-balance sm:text-display">{t.search.title}</h1>
      <SearchView docs={buildDocs()} locale={locale} t={t.search} states={t.states} categories={t.board.categories} forecasters={t.question.forecasters} browseHref={`/${locale}/browse`} />
    </div>
  );
}
