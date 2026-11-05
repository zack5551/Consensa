/*
 * Screen: design system reference (temporary home until product screens are approved).
 * One message: these are the building blocks every screen uses.
 * One action: switch EN/FR to check both languages.
 */
import { notFound } from "next/navigation";
import { CallPanel } from "@/components/call-panel";
import { CrowdBar } from "@/components/crowd-bar";
import { ForecastChart } from "@/components/forecast-chart";
import { ProvinceSplit } from "@/components/province-split";
import { QuestionCard } from "@/components/question-card";
import { Wordmark } from "@/components/wordmark";
import { sampleQuestions } from "@/content/sample-questions";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { formatPercent } from "@/lib/format";
import { crowdNow } from "@/lib/question";
import { fill } from "@/lib/text";

const swatches = [
  ["ink", "--color-ink"],
  ["ink2", "--color-ink-2"],
  ["paper", "--color-paper"],
  ["yes", "--color-yes"],
  ["no", "--color-no"],
  ["accent", "--color-accent"],
] as const;

const typeScale = [
  ["text-6", "48"],
  ["text-5", "28"],
  ["text-4", "20"],
  ["text-3", "16"],
  ["text-2", "14"],
  ["text-1", "12"],
] as const;

const spaces = [1, 2, 3, 4, 6, 8, 12] as const;

export default async function DesignSystemPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const q = sampleQuestions[0]!;
  const yes = crowdNow(q);
  const pct = (v: number) => formatPercent(v, locale);

  return (
    <div className="grid gap-12">
      <header className="grid gap-2">
        <Wordmark className="text-5" />
        <h1 className="m-0 text-5 font-extrabold tracking-tight">{t.design.title}</h1>
        <p className="m-0 max-w-[60ch] text-3 text-ink-2">{t.design.intro}</p>
      </header>

      <section aria-labelledby="ds-colour" className="grid gap-4">
        <h2 id="ds-colour" className="m-0 text-4 font-bold">{t.design.colours}</h2>
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-6">
          {swatches.map(([key, token]) => (
            <li key={key} className="overflow-hidden rounded-md border border-line bg-surface">
              <span className="block h-16" style={{ background: `var(${token})` }} aria-hidden="true" />
              <span className="block p-2 text-1">
                <strong className="block">{t.design.swatches[key]}</strong>
                <code className="font-mono text-ink-2">{token}</code>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ds-type" className="grid gap-3">
        <h2 id="ds-type" className="m-0 text-4 font-bold">{t.design.type}</h2>
        {typeScale.map(([cls, px]) => (
          <p key={cls} className="m-0 flex items-baseline gap-4">
            <code className="w-24 shrink-0 font-mono text-1 text-ink-2">{cls} · {px}</code>
            <span className={`${cls} font-bold`}>{t.design.sampleLine}</span>
          </p>
        ))}
      </section>

      <section aria-labelledby="ds-space" className="grid gap-3">
        <h2 id="ds-space" className="m-0 text-4 font-bold">{t.design.spacing}</h2>
        <ul className="m-0 flex list-none flex-wrap items-end gap-4 p-0">
          {spaces.map((n) => (
            <li key={n} className="grid justify-items-center gap-1">
              <span className="block bg-yes" style={{ width: n * 4, height: n * 4 }} aria-hidden="true" />
              <code className="font-mono text-1 text-ink-2">{n * 4}px</code>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ds-components" className="grid gap-6">
        <h2 id="ds-components" className="m-0 text-4 font-bold">{t.design.components}</h2>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="grid gap-6">
            <QuestionCard q={q} locale={locale} t={t.question} />
            <div className="rounded-lg border border-line bg-surface p-5">
              <CrowdBar yes={yes} yesLabel={`${t.question.yes} ${pct(yes)}`} noLabel={`${t.question.no} ${pct(100 - yes)}`} />
            </div>
            <div className="rounded-lg border border-line bg-surface p-5">
              <ForecastChart
                history={q.history}
                events={q.events.map((e) => ({ dayIndex: e.dayIndex, label: e.label[locale] }))}
                title={t.chart.title}
                summary={fill(t.chart.summary, { days: q.history.length, from: pct(q.history[0] ?? yes), to: pct(yes) })}
              />
            </div>
            <div className="rounded-lg border border-line bg-surface p-5">
              <ProvinceSplit
                values={q.provinces}
                title={t.province.title}
                summary={fill(t.province.summary, { high: t.province.names.AB, highValue: pct(q.provinces.AB), low: t.province.names.QC, lowValue: pct(q.provinces.QC) })}
                short={t.province.short}
                names={t.province.names}
                format={pct}
              />
            </div>
          </div>
          <CallPanel slug={`design-${q.slug}`} crowd={yes} locale={locale} t={t.call} canadaSays={t.question.canadaSays} />
        </div>
      </section>
    </div>
  );
}
