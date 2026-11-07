/*
 * Screen: provinces overview.
 * One message: where Canada's regions agree, where they split, and whose crowd called it best.
 * One action: open a region.
 * Privacy: aggregates only; a region's number is hidden when fewer than MIN_CELL forecasters are behind it.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProvinceSplit } from "@/components/province-split";
import { ScreenView } from "@/components/screen-view";
import { SAMPLE_NOW, sampleQuestions } from "@/content/sample-questions";
import { sampleResults } from "@/content/sample-results";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { formatPercent } from "@/lib/format";
import { crowdNow, isOpen, provinceExtremes, questionState } from "@/lib/question";
import { bellwether, MIN_CELL, meanDistance, regionalAccuracy, regions, regionSlug } from "@/lib/regions";
import { formatBrier, formatOneDecimal } from "@/lib/score-format";
import { fill } from "@/lib/text";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).provinces.title, alternates: { languages: { "en-CA": "/en/provinces", "fr-CA": "/fr/provinces" } } };
}

export default async function ProvincesPage({ params }: { params: Params }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const p = t.provinces;
  const pct = (v: number) => formatPercent(v, locale);

  const open = sampleQuestions.filter((q) => isOpen(questionState(q, SAMPLE_NOW))).map((q) => ({ ...q, national: crowdNow(q) }));
  const bell = bellwether(open);
  const accuracy = regionalAccuracy(sampleResults);
  const accuracyBy = new Map(accuracy.map((a) => [a.region, a]));
  const splits = open
    .map((q) => ({ q, spread: Math.max(...regions.map((r) => q.provinces[r])) - Math.min(...regions.map((r) => q.provinces[r])) }))
    .sort((a, b) => b.spread - a.spread)
    .slice(0, 3);
  const best = accuracy[0];
  const worst = accuracy[accuracy.length - 1];

  return (
    <div className="grid gap-10">
      <ScreenView locale={locale} screen="provinces" />
      <header className="grid gap-2">
        <h1 className="m-0 font-display text-headline font-extrabold tracking-tight">{p.title}</h1>
        <p className="m-0 max-w-[60ch] text-body text-ink-2">{p.subtitle}</p>
        <p className="m-0 text-caption text-ink-2">{t.legal.sample}</p>
      </header>

      {bell ? (
        <section aria-labelledby="bellwether" className="grid gap-1 rounded-card border border-line bg-surface p-5 shadow-card">
          <h2 id="bellwether" className="m-0 text-caption font-bold uppercase tracking-wide text-canada">
            {p.bellwetherTitle}
          </h2>
          <p className="m-0 font-display text-title font-extrabold text-balance">{p.headings[bell.region]}</p>
          <p className="m-0 max-w-[60ch] text-body-sm text-ink-2">
            {fill(p.bellwetherBody, { region: p.headings[bell.region], n: formatOneDecimal(bell.distance, locale) })}
          </p>
        </section>
      ) : null}

      <nav aria-label={p.regionsLabel}>
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {regions.map((r) => {
            const d = meanDistance(open, r);
            const acc = accuracyBy.get(r);
            return (
              <li key={r}>
                <Link
                  href={`/${locale}/provinces/${regionSlug(r)}`}
                  className="grid h-full gap-2 rounded-card border border-line bg-surface p-4 transition-colors duration-[var(--cn-duration-fast)] hover:border-line-strong hover:bg-sunken"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-display text-title-sm font-extrabold">{p.headings[r]}</span>
                    <span className="text-ink-2" aria-hidden="true">
                      →
                    </span>
                  </span>
                  {d !== null ? <span className="text-body-sm text-ink-2">{fill(p.distance, { n: formatOneDecimal(d, locale) })}</span> : null}
                  {acc ? <span className="text-caption font-semibold text-side-a-text">{fill(p.accuracyRank, { rank: acc.rank })}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <section aria-labelledby="splits" className="grid gap-4">
        <div className="grid gap-1">
          <h2 id="splits" className="m-0 text-title-sm font-bold">
            {p.splitsTitle}
          </h2>
          <p className="m-0 text-body-sm text-ink-2">{p.splitsHelp}</p>
        </div>
        <ul className="m-0 grid list-none gap-3 p-0 lg:grid-cols-3">
          {splits.map(({ q, spread }) => {
            const { high, low } = provinceExtremes(q.provinces);
            return (
              <li key={q.slug} className="grid content-start gap-3 rounded-card border border-line bg-surface p-4">
                <Link href={`/${locale}/q/${q.slug}`} className="text-body-sm font-semibold text-balance hover:underline">
                  {q.question[locale]}
                </Link>
                <span className="text-caption font-semibold text-ink-2">{fill(p.spread, { n: Math.round(spread) })}</span>
                <ProvinceSplit
                  values={q.provinces}
                  title={t.province.title}
                  summary={fill(t.province.summary, { high: t.province.names[high], highValue: pct(q.provinces[high]), low: t.province.names[low], lowValue: pct(q.provinces[low]) })}
                  short={t.province.short}
                  names={t.province.names}
                  format={pct}
                />
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="accuracy" className="grid gap-3">
        <div className="grid gap-1">
          <h2 id="accuracy" className="m-0 text-title-sm font-bold">
            {p.accuracyTitle}
          </h2>
          <p className="m-0 max-w-[70ch] text-body-sm text-ink-2">{fill(p.accuracyHelp, { n: sampleResults.length })}</p>
        </div>
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <table className="w-full border-collapse text-left text-body-sm">
            <caption className="sr-only">
              {best && worst ? fill(p.accuracySummary, { best: p.headings[best.region], worst: p.headings[worst.region] }) : p.accuracyTitle}
            </caption>
            <thead className="bg-sunken text-caption text-ink-2">
              <tr>
                <th scope="col" className="w-14 px-4 py-2 font-semibold">{p.accuracyColumns.rank}</th>
                <th scope="col" className="px-2 py-2 font-semibold">{p.accuracyColumns.region}</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">{p.accuracyColumns.brier}</th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">{p.accuracyColumns.questions}</th>
              </tr>
            </thead>
            <tbody>
              {accuracy.map((a) => (
                <tr key={a.region} className="border-t border-line">
                  <td className="px-4 py-3 font-display font-extrabold tabular">{a.rank}</td>
                  <th scope="row" className="px-2 py-3 font-semibold">
                    <Link href={`/${locale}/provinces/${regionSlug(a.region)}`} className="hover:underline">
                      {p.headings[a.region]}
                    </Link>
                  </th>
                  <td className="px-2 py-3 text-right tabular">{formatBrier(a.brier, locale)}</td>
                  <td className="px-4 py-3 text-right tabular">{a.questions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-caption text-ink-2">{fill(p.cellNote, { min: MIN_CELL })}</p>
      </section>
    </div>
  );
}
