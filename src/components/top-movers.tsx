import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { dayText, type BoardRow } from "@/lib/board";
import { formatPercent } from "@/lib/format";

/** The open questions that moved most since yesterday. Renders nothing on a quiet day. */
export function TopMovers({ rows, locale, t }: { rows: readonly BoardRow[]; locale: Locale; t: Dictionary["board"] }) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="movers-label" className="grid gap-3 border-t-2 border-ink pt-3">
      <h2 id="movers-label" className="m-0 text-caption font-bold uppercase tracking-widest text-ink-2">
        {t.moversLabel}
      </h2>
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <li key={r.slug} className="relative grid content-start gap-2 rounded-card border border-line bg-surface p-4 transition-colors duration-[var(--cn-duration-fast)] hover:border-line-strong">
            <Link href={`/${locale}/q/${r.slug}`} className="font-display text-body font-bold leading-snug text-balance text-ink after:absolute after:inset-0 after:rounded-card hover:underline focus-visible:underline">
              {r.title[locale]}
            </Link>
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-display text-title-sm font-bold tabular">{formatPercent(r.crowd, locale)}</span>
              <span className={`text-caption font-semibold tabular ${r.day > 0 ? "text-side-a-text" : "text-side-b-text"}`}>{dayText(r.day, t)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
