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
    <div className="grid gap-8">
      <ScreenView locale={locale} screen="leaderboard" />
      <LeaderboardViewed locale={locale} tab={tab} />

      <header className="grid gap-2">
        <h1 className="m-0 font-display text-headline font-extrabold tracking-tight">{l.title}</h1>
        <p className="m-0 max-w-[60ch] text-body text-ink-2">{l.subtitle}</p>
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
            <ol className="m-0 grid list-none gap-3 p-0 sm:grid-cols-3">
              {podium.map((r) => (
                <li key={r.handle} className={`grid gap-1 rounded-card border bg-surface p-4 shadow-card ${r.rank === 1 ? "border-side-a" : "border-line"}`}>
                  <span className="font-display text-title font-extrabold tabular text-ink-2">{r.rank}</span>
                  <Link href={`/${locale}/forecasters/${r.handle}`} className="truncate text-body font-bold hover:underline">
                    {r.displayName}
                  </Link>
                  <span className="text-caption text-ink-2">{t.province.names[r.region]}</span>
                  <span className="mt-1 font-display text-title-sm font-extrabold text-side-a-text tabular">
                    {r.skill === null ? "—" : formatSignedSkill(r.skill, locale)}
                    <span className="ml-1 font-sans text-caption font-semibold text-ink-2">{l.columns.skill}</span>
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

          <details className="group rounded-card border border-line bg-surface p-4">
            <summary className="cursor-pointer text-body-sm font-bold">{l.methodTitle}</summary>
            <p className="mb-0 mt-2 max-w-[70ch] text-body-sm text-ink-2">{fill(l.methodBody, { min: DEFAULT_MIN_CALLS })}</p>
          </details>
        </>
      )}

      {sharpest.length > 0 ? (
        <section aria-labelledby="sharpest" className="grid gap-3">
          <div className="grid gap-1">
            <h2 id="sharpest" className="m-0 text-title-sm font-bold">
              {l.sharpestTitle}
            </h2>
            <p className="m-0 max-w-[70ch] text-body-sm text-ink-2">{fill(l.sharpestHelp, { n: SHARPEST_N })}</p>
          </div>
          <ul className="m-0 grid list-none gap-2 p-0">
            {sharpest.map((s) => (
              <li key={s.slug} className="grid gap-3 rounded-control border border-line bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <Link href={`/${locale}/q/${s.slug}`} className="text-body-sm font-semibold text-balance hover:underline">
                  {s.question}
                </Link>
                <div className="flex items-end gap-5">
                  <dl className="m-0 flex gap-5">
                    <div className="grid gap-0.5">
                      <dt className="text-caption font-bold text-canada">{l.sharpestColumns.canada}</dt>
                      <dd className="m-0 font-display text-title-sm font-extrabold tabular">{pct(s.canada)}</dd>
                    </div>
                    <div className="grid gap-0.5">
                      <dt className="text-caption font-semibold text-ink-2">{l.sharpestColumns.sharpest}</dt>
                      <dd className="m-0 font-display text-title-sm font-extrabold tabular">{pct(s.sharpest)}</dd>
                    </div>
                  </dl>
                  <span className="pb-1 text-caption text-ink-2 tabular" aria-hidden="true">
                    {formatSignedPoints(s.sharpest - s.canada, locale)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
