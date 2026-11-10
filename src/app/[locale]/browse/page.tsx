/*
 * Screen: browse by topic.
 * One message: Canada's questions, grouped by what they're about, each with where the crowd stands.
 * One action: open a topic.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CrowdBar } from "@/components/crowd-bar";
import { ScreenView } from "@/components/screen-view";
import { Icon } from "@/components/shell/icons";
import { SAMPLE_NOW, sampleQuestions } from "@/content/sample-questions";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { formatCount, formatPercent } from "@/lib/format";
import { categories, crowdNow, isOpen, questionState } from "@/lib/question";
import { fill } from "@/lib/text";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return { title: t.browse.title, description: t.browse.subtitle, alternates: { languages: { "en-CA": "/en/browse", "fr-CA": "/fr/browse" } } };
}

export default async function BrowsePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const pct = (v: number) => formatPercent(v, locale);

  const topics = categories.map((c) => {
    const inTopic = sampleQuestions.filter((q) => q.category === c);
    const open = inTopic.filter((q) => isOpen(questionState(q, SAMPLE_NOW)));
    const lead = [...open].sort((a, b) => b.forecasters - a.forecasters)[0];
    const calls = inTopic.reduce((n, q) => n + q.forecasters, 0);
    return { c, open: open.length, lead, calls };
  });

  return (
    <div className="grid gap-8">
      <ScreenView locale={locale} screen="browse" />
      <header className="grid gap-1">
        <h1 className="m-0 font-display text-headline font-extrabold tracking-tight sm:text-display-sm">{t.browse.title}</h1>
        <p className="m-0 text-body text-ink-2">{t.browse.subtitle}</p>
      </header>
      <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {topics.map(({ c, open, lead, calls }) => (
          <li key={c} className="relative grid content-start gap-4 rounded-card border border-line bg-surface p-5 shadow-card transition-colors duration-[var(--cn-duration-fast)] hover:border-line-strong">
            <div className="grid gap-1">
              <h2 className="m-0 flex items-center justify-between gap-2 text-title-sm font-bold">
                <Link href={`/${locale}/browse/${c}`} className="after:absolute after:inset-0 after:rounded-card hover:underline focus-visible:underline">
                  {t.board.categories[c]}
                </Link>
                <Icon name="arrow" className="size-4 text-ink-2" />
              </h2>
              <p className="m-0 text-body-sm text-ink-2">{t.browse.topics[c]}</p>
            </div>
            {lead ? (
              <div className="grid gap-2 rounded-control bg-sunken p-3">
                <p className="m-0 text-caption font-semibold uppercase tracking-wide text-ink-2">{t.browse.mostCalled}</p>
                <p className="m-0 text-body-sm font-semibold leading-snug">{lead.question[locale]}</p>
                <CrowdBar yes={crowdNow(lead)} yesLabel={`${t.question.yes} ${pct(crowdNow(lead))}`} noLabel={`${t.question.no} ${pct(100 - crowdNow(lead))}`} />
              </div>
            ) : (
              <p className="m-0 rounded-control bg-sunken p-3 text-body-sm text-ink-2">{t.browse.noneOpen}</p>
            )}
            <p className="m-0 flex gap-3 text-caption text-ink-2 tabular">
              <span className="font-semibold text-ink">{open === 1 ? t.browse.openCountOne : fill(t.browse.openCount, { n: formatCount(open, locale) })}</span>
              <span>{fill(t.browse.calls, { n: formatCount(calls, locale) })}</span>
            </p>
          </li>
        ))}
      </ul>
      <p className="m-0 text-caption text-ink-2">{t.legal.noValue}</p>
    </div>
  );
}
