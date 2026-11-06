import Link from "next/link";
import { Fragment } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import type { LeaderboardRow } from "@/lib/leaderboard";
import { formatBrier, formatSignedSkill } from "@/lib/score-format";

type Props = {
  rows: readonly LeaderboardRow[];
  /** Handle of the person viewing, highlighted as "You". */
  me?: string;
  locale: Locale;
  t: Dictionary;
  label: string;
  /** Fewer columns, for teasers on other screens. */
  compact?: boolean;
};

/**
 * Accuracy leaderboard. A real table for screen readers (rank, forecaster, calls, Brier, skill vs Canada, streak).
 * Secondary columns step out at phone width. Where ranks skip (a teaser with your row), a quiet gap row shows it.
 */
export function LeaderboardTable({ rows, me, locale, t, label, compact = false }: Props) {
  const c = t.leaderboard.columns;
  const wide = compact ? "hidden" : "hidden sm:table-cell";
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <table className="w-full border-collapse text-left text-body-sm">
        <caption className="sr-only">{label}</caption>
        <thead className="bg-sunken text-caption text-ink-2">
          <tr>
            <th scope="col" className="w-14 px-4 py-2 font-semibold">{c.rank}</th>
            <th scope="col" className="px-2 py-2 font-semibold">{c.forecaster}</th>
            <th scope="col" className="px-2 py-2 text-right font-semibold">{c.calls}</th>
            <th scope="col" className={`${wide} px-2 py-2 text-right font-semibold`}>{c.brier}</th>
            <th scope="col" className="px-4 py-2 text-right font-semibold">{c.skill}</th>
            <th scope="col" className={`${wide} px-4 py-2 text-right font-semibold`}>{c.streak}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isMe = row.handle === me;
            const prev = rows[i - 1];
            const gap = prev !== undefined && row.rank > prev.rank + 1 && compact;
            return (
              <Fragment key={row.handle}>
                {gap ? (
                  <tr aria-hidden="true" className="border-t border-line">
                    <td colSpan={6} className="px-4 py-1 text-center text-caption text-ink-3">
                      ⋯
                    </td>
                  </tr>
                ) : null}
                <tr id={compact ? undefined : row.handle} className={`scroll-mt-20 border-t border-line ${isMe ? "bg-side-a-soft" : ""}`}>
                  <td className="px-4 py-3 font-display font-extrabold tabular">{row.rank}</td>
                  <th scope="row" className="px-2 py-3 font-normal">
                    <span className="grid gap-0.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <Link href={`/${locale}/forecasters/${row.handle}`} className="font-semibold text-ink hover:underline">
                          {row.displayName}
                        </Link>
                        {isMe ? <span className="rounded-full bg-ink px-2 py-0.5 text-caption font-bold text-paper">{t.leaderboard.you}</span> : null}
                      </span>
                      <span className="text-caption text-ink-2">{t.province.names[row.region]}</span>
                    </span>
                  </th>
                  <td className="px-2 py-3 text-right tabular">{row.count}</td>
                  <td className={`${wide} px-2 py-3 text-right tabular`}>{formatBrier(row.brier, locale)}</td>
                  <td className={`px-4 py-3 text-right font-semibold tabular ${row.skill !== null && row.skill > 0.005 ? "text-side-a-text" : "text-ink-2"}`}>
                    {row.skill === null ? "—" : formatSignedSkill(row.skill, locale)}
                  </td>
                  <td className={`${wide} px-4 py-3 text-right tabular`}>{row.currentStreak}</td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
