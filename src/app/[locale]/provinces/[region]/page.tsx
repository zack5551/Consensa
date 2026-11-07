/*
 * Screen: one region (e.g. Quebec).
 * One message: where this region differs from Canada right now, and how its crowd has done on results.
 * One action: open the question where it differs most.
 * Privacy: aggregates only. A result cell with fewer than MIN_CELL forecasters shows "Too few to show".
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BoardTabs } from "@/components/board-tabs";
import { GapBar } from "@/components/gap-bar";
import { LeaderboardTable } from "@/components/leaderboard-table";
import { ScreenView } from "@/components/screen-view";
import { StatTile } from "@/components/stat-tile";
import { sampleForecasters, SAMPLE_ME } from "@/content/sample-forecasters";
import { SAMPLE_NOW, sampleQuestions } from "@/content/sample-questions";
import { sampleResults } from "@/content/sample-results";
import { isLocale, locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { formatPercent } from "@/lib/format";
import { rankForecasters } from "@/lib/leaderboard";
import { crowdNow, isOpen, questionState } from "@/lib/question";
import { isPublishable, MIN_CELL, meanDistance, regionalAccuracy, regionFromSlug, regionGaps, regions, regionSlug, regionSlugs } from "@/lib/regions";
import { brierScore } from "@/lib/scoring";
import { formatBrier, formatOneDecimal } from "@/lib/score-format";
import { fill } from "@/lib/text";

type Params = Promise<{ locale: string; region: string }>;

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.flatMap((locale) => regionSlugs.map((region) => ({ locale, region })));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, region: slug } = await params;
  const region = regionFromSlug(slug);
  if (!isLocale(locale) || !region) return {};
  return {
    title: getDictionary(locale).provinces.headings[region],
    alternates: { languages: { "en-CA": `/en/provinces/${slug}`, "fr-CA": `/fr/provinces/${slug}` } },
  };
}

export default async function RegionPage({ params }: { params: Params }) {
  const { locale: raw, region: slug } = await params;
  const region = regionFromSlug(slug);
  if (!isLocale(raw) || !region) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const p = t.provinces;
  const pct = (v: number) => formatPercent(v, locale);
  const inName = p.inNames[region];

  const openQuestions = sampleQuestions.filter((q) => isOpen(questionState(q, SAMPLE_NOW)));
  const open = openQuestions.map((q) => ({ ...q, national: crowdNow(q) }));
  const gaps = regionGaps(open, region).slice(0, 5);
  const titles = new Map(openQuestions.map((q) => [q.slug, q.question[locale]]));
  const distance = meanDistance(open, region);
  const accuracy = regionalAccuracy(sampleResults);
  const mine = accuracy.find((a) => a.region === region);
  const top = rankForecasters(sampleForecasters, { region }).slice(0, 5);
  const firstGap = gaps[0];

  const gapLabel = (gap: number) => (gap === 0 ? p.gapSame : fill(gap > 0 ? p.gapMore : p.gapLess, { n: Math.abs(gap) }));

  return (
    <div className="grid gap-10">
      <ScreenView locale={locale} screen="region" />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <Link href={`/${locale}/provinces`} className="text-body-sm font-semibold text-link underline underline-offset-4">
            {p.backAll}
          </Link>
          <h1 className="m-0 font-display text-headline font-extrabold tracking-tight">{p.headings[region]}</h1>
          <p className="m-0 max-w-[60ch] text-body text-ink-2">{fill(p.regionSubtitle, { in: inName })}</p>
          <p className="m-0 text-caption text-ink-2">{t.legal.sample}</p>
        </div>
        {firstGap ? (
          <Link href={`/${locale}/q/${firstGap.slug}`} className="rounded-control bg-ink px-4 py-2 text-body-sm font-bold text-paper hover:opacity-90">
            {t.question.makeYourCall}
          </Link>
        ) : null}
      </header>

      <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label={p.statDistance} value={distance === null ? "—" : fill(p.distanceValue, { n: formatOneDecimal(distance, locale) })} />
        <StatTile label={p.statAccuracy} value={mine ? fill(p.rankValue, { rank: mine.rank, total: accuracy.length }) : p.suppressed} detail={mine ? `${p.accuracyColumns.brier} ${formatBrier(mine.brier, locale)}` : undefined} />
        <StatTile label={p.statResults} value={mine?.questions ?? 0} />
      </dl>

      <section aria-labelledby="differs" className="grid gap-3">
        <h2 id="differs" className="m-0 text-title-sm font-bold">
          {fill(p.differsTitle, { in: inName })}
        </h2>
        <ul className="m-0 grid list-none gap-3 p-0 lg:grid-cols-2">
          {gaps.map((g) => (
            <li key={g.slug} className="grid content-start gap-3 rounded-card border border-line bg-surface p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <Link href={`/${locale}/q/${g.slug}`} className="min-w-0 sm:flex-1 text-body-sm font-semibold text-balance hover:underline">
                  {titles.get(g.slug)}
                </Link>
                <span className={`shrink-0 self-start rounded-full px-2 py-0.5 text-caption font-semibold ${g.gap > 0 ? "bg-side-a-soft text-side-a-text" : g.gap < 0 ? "bg-side-b-soft text-side-b-text" : "bg-sunken text-ink-2"}`}>
                  {gapLabel(g.gap)}
                </span>
              </div>
              <GapBar regionLabel={t.province.names[region]} regionValue={g.region} canadaLabel={t.question.canadaSays} canadaValue={g.national} format={pct} />
              <p className="sr-only">{fill(p.gapSummary, { in: inName, value: pct(g.region), national: pct(g.national) })}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="region-results" className="grid gap-3">
        <h2 id="region-results" className="m-0 text-title-sm font-bold">
          {fill(p.resultsTitle, { in: inName })}
        </h2>
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <table className="w-full border-collapse text-left text-body-sm">
            <thead className="bg-sunken text-caption text-ink-2">
              <tr>
                <th scope="col" className="px-4 py-2 font-semibold">{p.resultColumns.question}</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">{p.resultColumns.region}</th>
                <th scope="col" className="hidden px-2 py-2 text-right font-semibold sm:table-cell">{p.resultColumns.answer}</th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">{p.resultColumns.brier}</th>
              </tr>
            </thead>
            <tbody>
              {sampleResults.map((r) => {
                const cell = r.regions[region];
                const shown = isPublishable(cell.forecasters);
                return (
                  <tr key={r.slug} className="border-t border-line align-top">
                    <th scope="row" className="px-4 py-3 font-normal text-balance">{r.question[locale]}</th>
                    <td className="px-2 py-3 text-right tabular">{shown ? pct(cell.percent) : <span className="text-caption text-ink-2">{p.suppressed}</span>}</td>
                    <td className="hidden px-2 py-3 text-right sm:table-cell">{r.outcome === 1 ? t.question.yes : t.question.no}</td>
                    <td className="px-4 py-3 text-right tabular">{shown ? formatBrier(brierScore(cell.percent / 100, r.outcome), locale) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-caption text-ink-2">{fill(p.cellNote, { min: MIN_CELL })}</p>
      </section>

      <section aria-labelledby="region-top" className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="region-top" className="m-0 text-title-sm font-bold">
            {fill(p.topTitle, { in: inName })}
          </h2>
          <Link href={`/${locale}/leaderboard/${slug}`} className="text-body-sm font-semibold text-link underline underline-offset-4">
            {fill(p.topAll, { in: inName })}
          </Link>
        </div>
        {top.length >= MIN_CELL ? (
          <LeaderboardTable rows={top} me={SAMPLE_ME} locale={locale} t={t} label={fill(t.leaderboard.tableLabel, { board: t.province.names[region] })} compact />
        ) : (
          <p className="m-0 rounded-card border border-dashed border-line-strong bg-surface p-4 text-body-sm text-ink-2">{fill(t.leaderboard.emptyTitle, { in: inName })}</p>
        )}
      </section>

      <BoardTabs
        label={p.otherRegions}
        size="sm"
        tabs={regions.map((r) => ({ href: `/${locale}/provinces/${regionSlug(r)}`, label: t.province.names[r], current: r === region }))}
      />
    </div>
  );
}
