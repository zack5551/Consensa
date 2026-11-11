import Link from "next/link";
import { sampleForecasters, sampleOpenCalls, SAMPLE_ME } from "@/content/sample-forecasters";
import { SAMPLE_NOW, sampleQuestions } from "@/content/sample-questions";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { formatPercent } from "@/lib/format";
import { DEFAULT_MIN_CALLS, rankForecasters, skillWeightedConsensus, type LeaderboardRow } from "@/lib/leaderboard";
import { crowdNow, isOpen, questionState } from "@/lib/question";
import { MIN_CELL, regions, regionSlug, type Region } from "@/lib/regions";
import { formatSignedPoints, formatSignedSkill } from "@/lib/score-format";
import { fill } from "@/lib/text";
import { BoardTabs } from "./board-tabs";
import { EmptyState } from "./empty-state";
import { LeaderboardTable } from "./leaderboard-table";
import { LeaderboardViewed } from "./leaderboard-viewed";
import { ScreenView } from "./screen-view";

export type BoardScope = { kind: "canada" } | { kind: "region"; region: Region } | { kind: "friends" };

/** How many top forecasters make up the "sharpest" line. */
const SHARPEST_N = 10;

function sharpestLines(board: readonly LeaderboardRow[], locale: Locale) {
  const top = board.filter((r) => r.adjustedSkill > 0).slice(0, SHARPEST_N);
  return sampleQuestions
    .filter((q) => q.scored && isOpen(questionState(q, SAMPLE_NOW)))
    .flatMap((q) => {
      const entries = top.flatMap((r) => {
        const percent = sampleOpenCalls[r.handle]?.[q.slug];
        return percent === undefined ? [] : [{ percent, skill: r.adjustedSkill }];
      });
      const sharpest = entries.length >= MIN_CELL ? skillWeightedConsensus(entries) : null;
      return sharpest === null ? [] : [{ slug: q.slug, question: q.question[locale], canada: Math.round(crowdNow(q)), sharpest }];
    });
}

/**
 * The leaderboard, for any scope. One message: who's most accurate, ranked by skill, not points.
 * One action: find your own row.
 */
export function LeaderboardScreen({ locale, t, scope }: { locale: Locale; t: Dictionary; scope: BoardScope }) {
  const l = t.leaderboard;
  const canada = rankForecasters(sampleForecasters);
  const rows = scope.kind === "region" ? rankForecasters(sampleForecasters, { region: scope.region }) : scope.kind === "canada" ? canada : [];
  const me = sampleForecasters.find((f) => f.handle === SAMPLE_ME);
  const myRow = rows.find((r) => r.handle === SAMPLE_ME);
  const boardName = scope.kind === "region" ? t.province.names[scope.region] : scope.kind === "friends" ? l.tabs.friends : l.tabs.canada;
  const tab = scope.kind === "region" ? "province" : scope.kind;
  const pct = (v: number) => formatPercent(v, locale);
  const regionOpen = scope.kind === "region" && rows.length >= MIN_CELL;
  const showBoard = scope.kind === "canada" || regionOpen;
  const podium = showBoard ? rows.slice(0, 3) : [];
  const sharpest = scope.kind === "canada" ? sharpestLines(canada, locale) : [];

  const mainTabs = [
    { href: `/${locale}/leaderboard`, label: l.tabs.canada, current: scope.kind === "canada" },
    ...(me ? [{ href: `/${locale}/leaderboard/${regionSlug(me.region)}`, label: t.province.names[me.region], current: scope.kind === "region" && scope.region === me.region }] : []),
    { href: `/${locale}/leaderboard/friends`, label: l.tabs.friends, current: scope.kind === "friends" },
  ];
  const regionTabs = regions
    .filter((r) => r !== me?.region)
    .map((r) => ({ href: `/${locale}/leaderboard/${regionSlug(r)}`, label: t.province.names[r], current: scope.kind === "region" && scope.region === r }));

  return (
    <div className="grid gap-12">
      <ScreenView locale={locale} screen="leaderboard" />
      <LeaderboardViewed locale={locale} tab={tab} />

      <header className="grid gap-3">
        <h1 className="m-0 font-display text-headline font-bold tracking-tight text-balance sm:text-display">{l.title}</h1>
        <p className="m-0 max-w-[60ch] text-body-lg text-ink-2">{l.subtitle}</p>
        <p className="m-0 text-caption text-ink-2">{l.sampleNote}</p>
      </header>

      <div className="grid gap-3">
        <BoardTabs label={l.tabsLabel} tabs={mainTabs} />
        <BoardTabs label={l.regionsLabel} tabs={regionTabs} size="sm" />
      </div>

      {scope.kind === "friends" ? (
        <EmptyState
          title={l.friendsTitle}
          body={t.record.friendsEmpty}
          action={
            <Link href={`/${locale}/leaderboard`} className="rounded-control bg-ink px-4 py-2 text-body-sm font-bold text-paper hover:opacity-90">
              {l.emptyAction}
            </Link>
          }
        />
      ) : !showBoard && scope.kind === "region" ? (
        <EmptyState
          title={fill(l.emptyTitle, { in: t.provinces.inNames[scope.region] })}
          body={fill(l.emptyBody, { min: MIN_CELL, calls: DEFAULT_MIN_CALLS })}
          action={
            <Link href={`/${locale}/leaderboard`} className="rounded-control bg-ink px-4 py-2 text-body-sm font-bold text-paper hover:opacity-90">
              {l.emptyAction}
            </Link>
          }
        />
      ) : (
        <>
          <section aria-label={l.podiumLabel}>
            {/* The top three as stat blocks under a rule, not mini-cards. First place gets the heavier rule. */}
            <ol className="m-0 grid list-none gap-x-8 gap-y-6 p-0 sm:grid-cols-3">
              {podium.map((r) => (
                <li key={r.handle} className={`grid content-start gap-2 pt-3 ${r.rank === 1 ? "border-t-4 border-ink" : "border-t-2 border-line-strong"}`}>
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-display text-title font-bold tabular text-ink-3">{r.rank}</span>
                    <span className="flex items-baseline gap-1.5">
                      <span className="font-display text-headline font-bold tabular text-side-a-text">{r.skill === null ? "—" : formatSignedSkill(r.skill, locale)}</span>
                      <span className="text-caption font-semibold text-ink-2">{l.columns.skill}</span>
                    </span>
                  </span>
                  <span className="grid min-w-0 gap-0.5">
                    <Link href={`/${locale}/forecasters/${r.handle}`} className="truncate font-display text-title-sm font-bold hover:underline">
                      {r.displayName}
                    </Link>
                    <span className="text-body-sm text-ink-2">{t.province.names[r.region]}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-sunken p-3 text-body-sm">
            <p className="m-0">{myRow ? fill(l.yourRank, { rank: myRow.rank, total: rows.length }) : l.notOnBoard}</p>
            {myRow ? (
              <a href={`#${myRow.handle}`} className="font-semibold text-link underline underline-offset-4">
                {l.jumpToYou}
              </a>
            ) : null}
          </div>

          <LeaderboardTable rows={rows} me={SAMPLE_ME} locale={locale} t={t} label={fill(l.tableLabel, { board: boardName })} />

          <details className="group border-y border-line py-4">
            <summary className="cursor-pointer text-body-sm font-bold">{l.methodTitle}</summary>
            <p className="mb-0 mt-2 max-w-[70ch] text-body-sm text-ink-2">{fill(l.methodBody, { min: DEFAULT_MIN_CALLS })}</p>
          </details>
        </>
      )}

      {sharpest.length > 0 ? (
        <section aria-labelledby="sharpest" className="grid gap-4">
          <div className="grid gap-1">
            <h2 id="sharpest" className="m-0 font-display text-headline font-bold tracking-tight text-balance">
              {l.sharpestTitle}
            </h2>
            <p className="m-0 max-w-[70ch] text-body-sm text-ink-2">{fill(l.sharpestHelp, { n: SHARPEST_N })}</p>
          </div>
          {/* A ruled list with the two numbers in fixed columns, so the eye reads down each column instead of box by box. */}
          <div className="grid border-t-2 border-ink">
            <div className="hidden grid-cols-[minmax(0,1fr)_7rem_7rem_3rem] gap-4 border-b border-line py-2 text-caption sm:grid" aria-hidden="true">
              <span />
              <span className="text-right font-bold text-canada">{l.sharpestColumns.canada}</span>
              <span className="text-right font-semibold text-ink-2">{l.sharpestColumns.sharpest}</span>
              <span />
            </div>
            <ul className="m-0 grid list-none p-0">
              {sharpest.map((s) => (
                <li key={s.slug} className="grid gap-2 border-b border-line py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-4 sm:py-3">
                  <Link href={`/${locale}/q/${s.slug}`} className="font-display text-body font-bold text-balance hover:underline">
                    {s.question}
                  </Link>
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-4 sm:grid-cols-[7rem_7rem_3rem] sm:items-baseline">
                    <dl className="m-0 contents">
                      <div className="grid gap-0.5 sm:justify-items-end">
                        <dt className="text-caption font-bold text-canada sm:sr-only">{l.sharpestColumns.canada}</dt>
                        <dd className="m-0 font-display text-title-sm font-bold tabular">{pct(s.canada)}</dd>
                      </div>
                      <div className="grid gap-0.5 sm:justify-items-end">
                        <dt className="text-caption font-semibold text-ink-2 sm:sr-only">{l.sharpestColumns.sharpest}</dt>
                        <dd className="m-0 font-display text-title-sm font-bold tabular">{pct(s.sharpest)}</dd>
                      </div>
                    </dl>
                    <span className="text-caption text-ink-2 tabular sm:text-right" aria-hidden="true">
                      {formatSignedPoints(s.sharpest - s.canada, locale)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}
