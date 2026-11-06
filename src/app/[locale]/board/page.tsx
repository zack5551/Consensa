/*
 * Screen: the Board (power users).
 * One message: every question in one place, with the latest numbers and how they moved.
 * One action: filter to what you care about and open a question.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { boardStrings } from "@/components/board-strings";
import { BoardView } from "@/components/board-view";
import { ScreenView } from "@/components/screen-view";
import { Icon } from "@/components/shell/icons";
import { SAMPLE_NOW, sampleQuestions } from "@/content/sample-questions";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { toBoardRow } from "@/lib/board";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return { title: t.board.title, description: t.board.subtitle, alternates: { languages: { "en-CA": "/en/board", "fr-CA": "/fr/board" } } };
}

export default async function BoardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const rows = sampleQuestions.map((q) => toBoardRow(q, SAMPLE_NOW));

  return (
    <div className="grid gap-6">
      <ScreenView locale={locale} screen="board" />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="m-0 font-display text-headline font-extrabold tracking-tight sm:text-display-sm">{t.board.title}</h1>
          <p className="m-0 text-body text-ink-2">{t.board.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/${locale}/browse`} className="inline-flex min-h-10 items-center rounded-control border border-line px-3 py-2 text-body-sm font-semibold hover:bg-sunken">
            {t.browse.title}
          </Link>
          <Link href={`/${locale}/search`} className="inline-flex min-h-10 items-center gap-2 rounded-control border border-line px-3 py-2 text-body-sm font-semibold hover:bg-sunken">
            <Icon name="search" className="size-4" />
            {t.nav.search}
          </Link>
        </div>
      </header>
      <BoardView rows={rows} locale={locale} t={boardStrings(t)} todayHref={`/${locale}/today`} />
      <p className="m-0 text-caption text-ink-2">{t.legal.noValue}</p>
    </div>
  );
}
