import Link from "next/link";
import type { ReactNode } from "react";
import { getQuestion } from "@/content/sample-questions";
import { getResult } from "@/content/sample-results";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { formatPercent } from "@/lib/format";
import { DEFAULT_MIN_CALLS, percentileOf, type ForecasterRecord, type LeaderboardRow } from "@/lib/leaderboard";
import { confidenceLean, crowdBrier, summarizeRecord, type Verdict } from "@/lib/record";
import { formatBrier, formatOneDecimal, formatSkill } from "@/lib/score-format";
import { fill } from "@/lib/text";
import { CalibrationChart } from "./calibration-chart";
import { EmptyState } from "./empty-state";
import { ScoreCompare } from "./score-compare";
import { StatTile } from "./stat-tile";
import { TrendChart } from "./trend-chart";
import { VerdictBadge } from "./verdict-badge";

type Props = {
  locale: Locale;
  t: Dictionary;
  forecaster: ForecasterRecord;
  /** The Canada board, for the rank line. */
  board: readonly LeaderboardRow[];
  /** "You" on your own record, the display name on someone else's. */
  youLabel: string;
  /** Shown when there are no scored calls yet. */
  emptyAction: ReactNode;
  /** Extra sections after the results (e.g. calls waiting for results). */
  children?: ReactNode;
};

/** The accuracy record: one headline (sharper or behind Canada), then the evidence. Shared by "My record" and public profiles. */
export function RecordView({ locale, t, forecaster, board, youLabel, emptyAction, children }: Props) {
  const r = t.record;
  const s = summarizeRecord(forecaster.calls);
  const pct = (v: number) => formatPercent(v, locale);
  const brier = (v: number) => formatBrier(v, locale);

  if (s.count === 0 || s.brier === null || s.crowdBrier === null) {
    return (
      <div className="grid gap-8">
        <EmptyState title={r.emptyTitle} body={r.emptyBody} action={emptyAction} />
        {children}
      </div>
    );
  }

  const row = board.find((b) => b.handle === forecaster.handle);
  const percentile = percentileOf(forecaster.handle, board);
  const headline =
    s.skill === null || Math.round(s.skill * 100) === 0
      ? r.skillLevel
      : fill(s.skill > 0 ? r.skillSharper : r.skillBehind, { n: formatSkill(s.skill, locale) });
  const verdictLabel: Record<Verdict, string> = { calledIt: t.call.calledIt, missed: t.call.notThisTime, tossUp: t.call.tossUp };
  // The "Called it!" moment: the right-side call that beat Canada by the most.
  const best = s.recent
    .filter((c) => c.verdict === "calledIt")
    .map((c) => ({ ...c, edge: crowdBrier(c) - c.brier }))
    .filter((c) => c.edge > 0)
    .sort((a, b) => b.edge - a.edge)[0];
  const bestResult = best ? getResult(best.slug) : undefined;
  const lean = confidenceLean(s.calibration);
  const answer = (o: 0 | 1) => (o === 1 ? t.question.yes : t.question.no);

  return (
    <div className="grid gap-12">
      <section aria-labelledby="record-headline" className="grid gap-5 rounded-card border border-line border-t-4 border-t-canada bg-surface p-5 sm:p-8">
        <div className="grid gap-2">
          <h2 id="record-headline" className={`m-0 font-display text-headline font-bold tracking-tight text-balance sm:text-display ${s.skill !== null && s.skill > 0 ? "text-side-a-text" : "text-ink"}`}>
            {headline}
          </h2>
          <p className="m-0 text-body-sm text-ink-2">{fill(r.skillHelp, { n: s.count })}</p>
        </div>
        <ScoreCompare
          rows={[
            { label: youLabel, value: s.brier, display: brier(s.brier), tone: "you" },
            { label: t.question.canadaSaid, value: s.crowdBrier, display: brier(s.crowdBrier), tone: "crowd" },
          ]}
          help={r.brierHelp}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          {row && percentile !== null ? (
            <Link href={`/${locale}/leaderboard#${forecaster.handle}`} className="rounded-full bg-sunken px-3 py-1 text-body-sm font-semibold tabular hover:bg-line">
              {fill(r.rankLine, { rank: row.rank, top: pct(Math.max(1, 100 - percentile)) })}
            </Link>
          ) : (
            <p className="m-0 text-body-sm text-ink-2">{fill(r.unranked, { n: Math.max(1, DEFAULT_MIN_CALLS - s.count) })}</p>
          )}
          <p className="m-0 text-caption text-ink-2">{r.noPoints}</p>
        </div>
      </section>

      <dl className="m-0 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <StatTile label={r.scoredCalls} value={s.count} />
        <StatTile
          label={r.rightSide}
          value={s.hitRate === null ? "—" : pct(s.hitRate * 100)}
          detail={fill(r.rightSideValue, { n: s.calledIt, total: s.calledIt + s.missed })}
        />
        <StatTile label={r.streak} value={fill(r.streakCalls, { n: s.streaks.current })} detail={fill(r.bestStreak, { n: s.streaks.best })} />
      </dl>

      {best && bestResult ? (
        <section aria-labelledby="called-it" className="grid gap-2 rounded-card border border-side-a bg-side-a-soft p-5">
          <h2 id="called-it" className="m-0 font-display text-title font-bold tracking-tight text-side-a-text">
            {r.calledItTitle}
          </h2>
          <p className="m-0 max-w-[60ch] text-body">
            {fill(best.outcome === 1 ? r.calledItBody : r.calledItBodyNo, { you: pct(best.userPercent), question: bestResult.question[locale], crowd: pct(best.crowdPercent) })}
          </p>
        </section>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="grid content-start gap-3 border-t-2 border-ink pt-4">
          <CalibrationChart
            bins={s.calibration}
            title={r.calibrationTitle}
            help={r.calibrationHelp}
            axisX={r.calibrationAxisX}
            axisY={r.calibrationAxisY}
            perfect={r.perfect}
            summary={fill(r.calibrationSummary, { n: s.count })}
            describe={(b) => fill(r.calibrationPoint, { said: pct(b.meanForecast * 100), happened: pct(b.observedRate * 100), n: b.count })}
            format={pct}
          />
          <p className="m-0 rounded-control bg-sunken p-3 text-body-sm">{lean ? fill(r.lean[lean.lean], { n: lean.points }) : r.lean.thin}</p>
        </section>
        <section className="grid content-start gap-3 border-t-2 border-ink pt-4">
          <TrendChart
            points={s.trend}
            title={r.trendTitle}
            help={r.trendHelp}
            youLabel={youLabel}
            crowdLabel={r.trendCrowd}
            summary={fill(r.trendSummary, { n: s.count, you: brier(s.brier), crowd: brier(s.crowdBrier) })}
            format={(v) => formatOneDecimal(v, locale)}
          />
        </section>
      </div>

      <section aria-labelledby="by-topic" className="grid gap-6">
        <h2 id="by-topic" className="m-0 font-display text-headline font-bold tracking-tight text-balance">
          {r.topicsTitle}
        </h2>
        <div className="overflow-x-auto border-t-2 border-ink">
          <table className="w-full border-collapse text-left text-body-sm">
            <thead className="text-caption text-ink-2">
              <tr>
                <th scope="col" className="px-4 py-2 font-semibold">{r.topicColumns.topic}</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">{r.topicColumns.calls}</th>
                <th scope="col" className="hidden px-2 py-2 text-right font-semibold sm:table-cell">{r.topicColumns.you}</th>
                <th scope="col" className="hidden px-2 py-2 text-right font-semibold sm:table-cell">{r.topicColumns.crowd}</th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">{r.topicColumns.verdict}</th>
              </tr>
            </thead>
            <tbody>
              {s.categories.map((c) => {
                const v = c.skill === null || Math.round(c.skill * 100) === 0 ? "level" : c.skill > 0 ? "sharper" : "behind";
                return (
                  <tr key={c.category} className="border-t border-line">
                    <th scope="row" className="px-4 py-3 font-semibold">{t.board.categories[c.category]}</th>
                    <td className="px-2 py-3 text-right tabular">{c.count}</td>
                    <td className="hidden px-2 py-3 text-right tabular sm:table-cell">{brier(c.brier)}</td>
                    <td className="hidden px-2 py-3 text-right tabular sm:table-cell">{brier(c.crowdBrier)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${v === "sharper" ? "text-side-a-text" : "text-ink-2"}`}>{r.topicVerdict[v]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="results" className="grid gap-6">
        <h2 id="results" className="m-0 font-display text-headline font-bold tracking-tight text-balance">
          {r.historyTitle}
        </h2>
        <ol className="m-0 grid list-none border-t-2 border-ink p-0" aria-label={r.resultsLabel}>
          {s.recent.map((c) => {
            const res = getResult(c.slug);
            const title = res?.question[locale] ?? c.slug;
            const hasPage = getQuestion(c.slug) !== undefined;
            return (
              <li key={c.slug} className="grid gap-2 border-b border-line py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="grid min-w-0 gap-1">
                  {hasPage ? (
                    <Link href={`/${locale}/q/${c.slug}`} className="font-display text-body font-bold text-balance hover:underline">
                      {title}
                    </Link>
                  ) : (
                    <span className="font-display text-body font-bold text-balance">{title}</span>
                  )}
                  <span className="flex flex-wrap gap-x-3 text-caption text-ink-2 tabular">
                    <span>
                      {youLabel} {pct(c.userPercent)}
                    </span>
                    <span>
                      {t.question.canadaSaid} {pct(c.crowdPercent)}
                    </span>
                    <span>{fill(t.resolution.answerIs, { answer: answer(c.outcome) })}</span>
                    <span>
                      {r.columns.score} {brier(c.brier)}
                    </span>
                  </span>
                </div>
                <VerdictBadge verdict={c.verdict} label={verdictLabel[c.verdict]} />
              </li>
            );
          })}
        </ol>
      </section>

      {children}
    </div>
  );
}
