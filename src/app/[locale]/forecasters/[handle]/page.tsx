/*
 * Screen: a forecaster's public record.
 * One message: how accurate this person is compared with Canada, on resolved questions only.
 * One action: back to the leaderboard (or, on your own profile, open your full record).
 * Privacy: shows resolved calls only. Calls on open questions stay private until they close.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RecordView } from "@/components/record-view";
import { ScreenView } from "@/components/screen-view";
import { getForecaster, SAMPLE_ME, sampleForecasters } from "@/content/sample-forecasters";
import { isLocale, locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { formatLongDate } from "@/lib/format";
import { rankForecasters } from "@/lib/leaderboard";
import { fill } from "@/lib/text";

type Params = Promise<{ locale: string; handle: string }>;

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.flatMap((locale) => sampleForecasters.map((f) => ({ locale, handle: f.handle })));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, handle } = await params;
  const f = getForecaster(handle);
  if (!isLocale(locale) || !f) return {};
  return {
    title: fill(getDictionary(locale).forecaster.title, { name: f.displayName }),
    alternates: { languages: { "en-CA": `/en/forecasters/${handle}`, "fr-CA": `/fr/forecasters/${handle}` } },
  };
}

export default async function ForecasterPage({ params }: { params: Params }) {
  const { locale: raw, handle } = await params;
  const f = getForecaster(handle);
  if (!isLocale(raw) || !f) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const board = rankForecasters(sampleForecasters);
  const isMe = f.handle === SAMPLE_ME;

  const back = (
    <Link href={`/${locale}/leaderboard`} className="rounded-control border border-line px-4 py-2 text-body-sm font-semibold hover:bg-sunken">
      {t.forecaster.back}
    </Link>
  );

  return (
    <div className="grid gap-8">
      <ScreenView locale={locale} screen="forecaster" />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <p className="m-0 flex flex-wrap items-center gap-2 text-caption text-ink-2">
            <span>@{f.handle}</span>
            <span aria-hidden="true">·</span>
            <span>{t.province.names[f.region]}</span>
            <span aria-hidden="true">·</span>
            <span>{fill(t.forecaster.joined, { date: formatLongDate(f.joinedAt, locale) })}</span>
            {isMe ? <span className="rounded-full bg-ink px-2 py-0.5 font-bold text-paper">{t.forecaster.itsYou}</span> : null}
          </p>
          <h1 className="m-0 font-display text-headline font-bold tracking-tight text-balance sm:text-display">{fill(t.forecaster.title, { name: f.displayName })}</h1>
          <p className="m-0 max-w-[60ch] text-body text-ink-2">{t.forecaster.subtitle}</p>
          <p className="m-0 text-caption text-ink-2">{t.leaderboard.sampleNote}</p>
        </div>
        {isMe ? (
          <Link href={`/${locale}/record`} className="rounded-control bg-ink px-4 py-2 text-body-sm font-bold text-paper hover:opacity-90">
            {t.forecaster.seeMine}
          </Link>
        ) : (
          back
        )}
      </header>
      <RecordView locale={locale} t={t} forecaster={f} board={board} youLabel={f.displayName} emptyAction={back} />
    </div>
  );
}
