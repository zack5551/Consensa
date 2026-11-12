/*
 * Screen: design system reference (/design).
 * One message: these are the building blocks every screen uses.
 * One action: switch EN/FR to check both languages.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CallPanel } from "@/components/call-panel";
import { CrowdBar } from "@/components/crowd-bar";
import { ForecastChart } from "@/components/forecast-chart";
import { ProvinceSplit } from "@/components/province-split";
import { QuestionCard } from "@/components/question-card";
import { StateBadge } from "@/components/state-badge";
import { StateNote } from "@/components/state-note";
import { Wordmark } from "@/components/wordmark";
import { sampleQuestions } from "@/content/sample-questions";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { formatLongDate, formatPercent } from "@/lib/format";
import { crowdNow, questionStates } from "@/lib/question";
import { fill } from "@/lib/text";

const swatches = [
  ["ink", "--cn-text"],
  ["ink2", "--cn-text-muted"],
  ["paper", "--cn-bg"],
  ["yes", "--cn-side-a"],
  ["no", "--cn-side-b"],
  ["accent", "--cn-accent"],
] as const;

const typeScale = [
  ["text-display", "56", "font-display"],
  ["text-headline", "32", "font-display"],
  ["text-title-sm", "20", "font-display"],
  ["text-body-lg", "18", "font-sans"],
  ["text-body", "16", "font-sans"],
  ["text-body-sm", "14", "font-sans"],
  ["text-caption", "12", "font-sans"],
] as const;

const spaces = [1, 2, 3, 4, 6, 8, 12] as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getDictionary(locale).meta.designTitle, robots: { index: false } } : {};
}

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
        <Wordmark className="text-headline" />
        <h1 className="m-0 font-display text-headline font-extrabold tracking-tight">{t.design.title}</h1>
        <p className="m-0 max-w-[60ch] text-body text-ink-2">{t.design.intro}</p>
      </header>

      <section aria-labelledby="ds-colour" className="grid gap-4">
        <h2 id="ds-colour" className="m-0 text-title-sm font-bold">{t.design.colours}</h2>
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-6">
          {swatches.map(([key, token]) => (
            <li key={key} className="overflow-hidden rounded-control border border-line bg-surface">
              <span className="block h-16" style={{ background: `var(${token})` }} aria-hidden="true" />
              <span className="block p-2 text-caption">
                <strong className="block">{t.design.swatches[key]}</strong>
                <code className="font-mono font-display text-ink-2">{token}</code>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ds-type" className="grid gap-3">
        <h2 id="ds-type" className="m-0 text-title-sm font-bold">{t.design.type}</h2>
        {typeScale.map(([cls, px, family]) => (
          <p key={cls} className="m-0 flex items-baseline gap-4">
            <code className="font-mono w-32 shrink-0 text-caption text-ink-2">{cls} · {px}</code>
            <span className={`${cls} ${family} font-bold`}>{t.design.sampleLine}</span>
          </p>
        ))}
      </section>

      <section aria-labelledby="ds-space" className="grid gap-3">
        <h2 id="ds-space" className="m-0 text-title-sm font-bold">{t.design.spacing}</h2>
        <ul className="m-0 flex list-none flex-wrap items-end gap-4 p-0">
          {spaces.map((n) => (
            <li key={n} className="grid justify-items-center gap-1">
              <span className="block bg-side-a" style={{ width: n * 4, height: n * 4 }} aria-hidden="true" />
              <code className="font-mono text-caption text-ink-2">{n * 4}px</code>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ds-states" className="grid gap-3">
        <h2 id="ds-states" className="m-0 text-title-sm font-bold">{t.design.states}</h2>
        <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
          {questionStates.map((s) => (
            <li key={s} className="grid gap-2 rounded-card border border-line bg-surface p-4">
              <StateBadge state={s} label={t.states[s]} />
              {s === "open" ? (
                <p className="m-0 text-body-sm text-ink-2">{t.today.subtitle}</p>
              ) : (
                <StateNote state={s} title={t.states[s]}>
                  {s === "closingSoon"
                    ? fill(t.stateNote.closingSoon, { date: formatLongDate(q.closesAt, locale) })
                    : s === "closed"
                      ? fill(t.stateNote.closed, { date: formatLongDate(q.resolution.resolvesAt, locale) })
                      : s === "resolved"
                        ? fill(t.stateNote.resolved, { answer: t.question.yes.toLowerCase(), crowd: pct(yes) })
                        : t.stateNote.disputed}
                </StateNote>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ds-components" className="grid gap-6">
        <h2 id="ds-components" className="m-0 text-title-sm font-bold">{t.design.components}</h2>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="grid gap-6">
            <QuestionCard q={q} locale={locale} t={t.question} states={t.states} href={`/${locale}/q/${q.slug}`} />
            <div className="rounded-card border border-line bg-surface p-5">
              <CrowdBar yes={yes} yesLabel={`${t.question.yes} ${pct(yes)}`} noLabel={`${t.question.no} ${pct(100 - yes)}`} />
            </div>
            <div className="rounded-card border border-line bg-surface p-5">
              <ForecastChart
                history={q.history}
                events={q.events.map((e) => ({ dayIndex: e.dayIndex, label: e.label[locale] }))}
                title={t.chart.title}
              format={pct}
                summary={fill(t.chart.summary, { days: q.history.length, from: pct(q.history[0] ?? yes), to: pct(yes) })}
              />
            </div>
            <div className="rounded-card border border-line bg-surface p-5">
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
