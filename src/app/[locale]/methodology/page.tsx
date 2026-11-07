/*
 * Screen: methodology (trust page).
 * One message: here is exactly how the numbers are made, scored and resolved.
 * One action: check the public resolution log.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScreenView } from "@/components/screen-view";
import { sampleQuestions } from "@/content/sample-questions";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { formatBrier, formatPercent } from "@/lib/format";
import { crowdRecord } from "@/lib/question";
import { brierScore } from "@/lib/scoring";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).methodology.title, alternates: { languages: { "en-CA": "/en/methodology", "fr-CA": "/fr/methodology" } } };
}

const examples = [
  [80, 1],
  [80, 0],
  [50, 1],
  [10, 0],
] as const;

export default async function MethodologyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const m = t.methodology;
  const record = crowdRecord(sampleQuestions);
  const sections = [
    ["crowd", m.crowd.title],
    ["scoring", m.scoring.title],
    ["resolution", m.resolution.title],
    ["why", m.why.title],
    ["record", m.record.title],
    ["money", m.money.title],
    ["data", m.data.title],
  ] as const;

  return (
    <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
      <ScreenView locale={locale} screen="methodology" />
      <nav aria-labelledby="toc" className="lg:sticky lg:top-20">
        <h2 id="toc" className="m-0 mb-2 text-caption font-bold uppercase tracking-wide text-ink-2">
          {m.nav}
        </h2>
        <ol className="m-0 grid list-none gap-1 p-0 text-body-sm">
          {sections.map(([id, title]) => (
            <li key={id}>
              <a href={`#${id}`} className="block rounded-control px-2 py-1.5 text-ink-2 hover:bg-sunken hover:text-ink">
                {title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <article className="grid max-w-[68ch] gap-10">
        <header className="grid gap-3">
          <h1 className="m-0 font-display text-headline font-extrabold tracking-tight">{m.title}</h1>
          <p className="m-0 text-body-lg text-ink-2">{m.intro}</p>
        </header>

        <section id="crowd" aria-labelledby="crowd-h" className="grid scroll-mt-20 gap-3">
          <h2 id="crowd-h" className="m-0 font-display text-title-sm font-bold">{m.crowd.title}</h2>
          <p className="m-0">{m.crowd.body}</p>
          <p className="m-0 rounded-control border-l-4 border-side-a bg-side-a-soft px-4 py-3 font-display font-bold">{m.crowd.onePerson}</p>
        </section>

        <section id="scoring" aria-labelledby="scoring-h" className="grid scroll-mt-20 gap-3">
          <h2 id="scoring-h" className="m-0 font-display text-title-sm font-bold">{m.scoring.title}</h2>
          <p className="m-0">{m.scoring.body}</p>
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full border-collapse text-left text-body-sm">
              <caption className="sr-only">{m.scoring.tableCaption}</caption>
              <thead>
                <tr className="border-b border-line text-ink-2">
                  <th scope="col" className="px-4 py-2 font-semibold">{m.scoring.call}</th>
                  <th scope="col" className="px-4 py-2 font-semibold">{m.scoring.outcome}</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">{m.scoring.score}</th>
                </tr>
              </thead>
              <tbody>
                {examples.map(([p, o]) => (
                  <tr key={`${p}-${o}`} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 tabular">{formatPercent(p, locale)}</td>
                    <td className="px-4 py-2">{o === 1 ? t.question.yes : t.question.no}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular">{formatBrier(brierScore(p / 100, o), locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-2" role="img" aria-label={`${m.scoring.scaleTitle}: 0 ${m.scoring.scalePerfect}, ${locale === "fr" ? "0,25" : "0.25"} ${m.scoring.scaleFlip}, ${locale === "fr" ? "1,0" : "1.0"} ${m.scoring.scaleWrong}`}>
            <p className="m-0 text-body-sm font-bold">{m.scoring.scaleTitle}</p>
            <div className="relative mx-1.5 h-1.5 rounded-full bg-line">
              <span className="absolute top-1/2 left-0 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" />
              <span className="absolute top-1/2 left-1/4 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" />
              <span className="absolute top-1/2 right-0 size-3.5 translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" />
            </div>
            <div className="relative mx-1.5 h-5 text-caption text-ink-2">
              <span className="absolute left-0">0 · {m.scoring.scalePerfect}</span>
              <span className="absolute left-1/4 -translate-x-1/2">{locale === "fr" ? "0,25" : "0.25"} · {m.scoring.scaleFlip}</span>
              <span className="absolute right-0">{locale === "fr" ? "1,0" : "1.0"} · {m.scoring.scaleWrong}</span>
            </div>
          </div>
          <p className="m-0 text-body-sm text-ink-2">{m.scoring.polls}</p>
        </section>

        <section id="resolution" aria-labelledby="resolution-h" className="grid scroll-mt-20 gap-3">
          <h2 id="resolution-h" className="m-0 font-display text-title-sm font-bold">{m.resolution.title}</h2>
          <p className="m-0">{m.resolution.body}</p>
          <p className="m-0">{m.resolution.disputes}</p>
          <Link href={`/${locale}/resolutions`} className="justify-self-start font-semibold text-link underline underline-offset-4">
            {m.resolution.logLink} →
          </Link>
        </section>

        <section id="why" aria-labelledby="why-h" className="grid scroll-mt-20 gap-3">
          <h2 id="why-h" className="m-0 font-display text-title-sm font-bold">{m.why.title}</h2>
          <p className="m-0">{m.why.body}</p>
        </section>

        <section id="record" aria-labelledby="record-h" className="grid scroll-mt-20 gap-3">
          <h2 id="record-h" className="m-0 font-display text-title-sm font-bold">{m.record.title}</h2>
          <p className="m-0">{m.record.body}</p>
          <dl className="m-0 grid gap-3 sm:grid-cols-3">
            {(
              [
                [m.record.brier, record.meanBrier === null ? "—" : formatBrier(record.meanBrier, locale)],
                [m.record.resolved, String(record.resolved)],
                [m.record.rightSide, record.rightSide === null ? "—" : formatPercent(record.rightSide, locale)],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="border-t-2 border-ink bg-sunken px-4 py-3">
                <dt className="text-caption text-ink-2">{label}</dt>
                <dd className="m-0 font-display text-headline font-bold tabular">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="m-0 text-caption text-ink-2">{t.legal.sample}</p>
        </section>

        <section id="money" aria-labelledby="money-h" className="grid scroll-mt-20 gap-3">
          <h2 id="money-h" className="m-0 font-display text-title-sm font-bold">{m.money.title}</h2>
          <p className="m-0">{m.money.body}</p>
          <p className="m-0 text-body-sm font-semibold">{t.legal.noValue}</p>
        </section>

        <section id="data" aria-labelledby="data-h" className="grid scroll-mt-20 gap-3">
          <h2 id="data-h" className="m-0 font-display text-title-sm font-bold">{m.data.title}</h2>
          <p className="m-0">{m.data.body}</p>
        </section>
      </article>
    </div>
  );
}
