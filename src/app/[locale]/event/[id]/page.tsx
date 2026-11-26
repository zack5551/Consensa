/*
 * Screen: an event page (the Oscars, the Grey Cup, a Bank of Canada decision day).
 * One message: every question about this one big event, in one place, hottest first.
 * One action: open a question and make your call.
 * Up from three days before the event to a day after it starts; otherwise it's a 404, so it disappears on its own.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { boardStrings } from "@/components/board-strings";
import { BoardView } from "@/components/board-view";
import { eventWhen } from "@/components/event-strip";
import { ScreenView } from "@/components/screen-view";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { pageAlternates } from "@/lib/alternates";
import { toBoardRow } from "@/lib/board";
import { siteNow } from "@/lib/clock";
import { eventHub } from "@/lib/heat";
import { recentCallCounts, withLiveCrowd } from "@/lib/live";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import { siteQuestions } from "@/lib/site-questions";
import { fill } from "@/lib/text";

type Params = Promise<{ locale: string; id: string }>;

/** Event pages come and go with the news, so none is built ahead; each renders on first visit and refreshes every minute. */
export const revalidate = 60;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, id } = await params;
  const hub = isLocale(locale) ? eventHub(await siteQuestions(), id, siteNow()) : undefined;
  if (!isLocale(locale) || !hub) return notFoundMetadata(locale);
  const name = hub.event.name[locale];
  return { title: name, description: fill(getDictionary(locale).event.subtitle, { name }), alternates: pageAlternates(locale, `/event/${id}`) };
}

export default async function EventPage({ params }: { params: Params }) {
  const { locale: raw, id } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const now = siteNow();
  const hub = eventHub(await siteQuestions(), id, now);
  if (!hub) notFound();
  const [questions, recent] = await Promise.all([withLiveCrowd(hub.questions), recentCallCounts()]);
  const rows = questions.map((q) => toBoardRow(q, now, recent.get(q.slug) ?? 0));
  const name = hub.event.name[locale];

  return (
    <div className="grid gap-8">
      <ScreenView locale={locale} screen="board" />
      <nav aria-label={t.board.title}>
        <Link href={`/${locale}/board`} className="text-body-sm font-semibold text-link underline-offset-4 hover:underline">
          ← {t.event.back}
        </Link>
      </nav>
      <header className="grid gap-3">
        <p className="m-0 text-caption font-bold uppercase tracking-widest text-ink-2 tabular">{eventWhen(hub.event.at, now, locale, t.event)}</p>
        <h1 className="m-0 font-display text-headline font-bold tracking-tight text-balance sm:text-display">{name}</h1>
        <p className="m-0 max-w-[60ch] text-body-lg text-ink-2">{fill(t.event.subtitle, { name })}</p>
      </header>
      <BoardView rows={rows} locale={locale} t={boardStrings(t)} todayHref={`/${locale}/today`} />
      <p className="m-0 text-caption text-ink-2">{t.legal.noValue}</p>
    </div>
  );
}
