import { PlatformMark } from "@/components/platform-mark";
import type { SocialPlatform } from "@/lib/social";
import { fill } from "@/lib/text";

/**
 * One platform's poll on a question page: `line` is its result ("X poll, Nov 5: 58% yes · 1,240 votes"), `yes` the
 * yes share in percent for the bar, `href` our official post there. A made-up sample row has no post to open.
 */
export type SocialPollRow = { platform: SocialPlatform; name: string; line: string; yes: number; href?: string };

/**
 * "Canada says" next to the first platform's result: the Canada-checked number beside the open one (zack). LEX: like
 * with like, so each number says what it is ("54% chance", "65% voted yes").
 */
export type SocialCompare = {
  canadaLabel: string;
  canadaValue: string;
  canadaUnit: string;
  canadaNote: string;
  pollLabel: string;
  pollValue: string;
  pollUnit: string;
  pollNote: string;
};

type Props = {
  title: string;
  /** LEX's label: "Not verified. May include people outside Canada and under 18." */
  label: string;
  /** "Open our {platform} post (new tab)": the logo's accessible name. */
  openLabel: string;
  rows: readonly SocialPollRow[];
  /** Set when any row is made-up preview data. */
  sampleLabel?: string;
  compare?: SocialCompare;
};

const box = "inline-grid size-11 shrink-0 place-items-center rounded-control border border-line bg-surface";

/**
 * Our posts on social media for this question: each platform's logo opens our post there, with that platform's own
 * poll result beside it. Shown apart from "Canada says" and never mixed into it. Totals only, no usernames. Plain
 * links: nothing loads from the platforms until someone taps one. Renders nothing when there are no rows.
 */
export function SocialPolls({ title, label, openLabel, rows, sampleLabel, compare }: Props) {
  if (rows.length === 0) return null;
  return (
    <section aria-label={title} className="grid gap-3 border-t border-line pt-4" data-testid="social-polls">
      <h2 className="m-0 text-caption font-bold uppercase tracking-wide text-ink-2">
        {title}
        {sampleLabel && <span className="font-normal normal-case tracking-normal"> · {sampleLabel}</span>}
      </h2>
      {compare && (
        <dl className="m-0 grid grid-cols-2 gap-3" data-testid="social-compare">
          {(
            [
              [compare.canadaLabel, compare.canadaValue, compare.canadaUnit, compare.canadaNote, "text-canada"],
              [compare.pollLabel, compare.pollValue, compare.pollUnit, compare.pollNote, "text-ink-2"],
            ] as const
          ).map(([name, value, unit, note, tone]) => (
            <div key={name} className="grid content-start gap-0.5 rounded-control border border-line bg-surface p-3">
              <dt className={`m-0 text-caption font-bold uppercase tracking-wide ${tone}`}>{name}</dt>
              <dd className="m-0 text-body-sm text-ink-2">
                <span className="font-display text-title font-bold text-ink tabular">{value}</span> {unit}
              </dd>
              <dd className="m-0 text-caption text-ink-2">{note}</dd>
            </div>
          ))}
        </dl>
      )}
      <ul className="m-0 grid list-none gap-2 p-0">
        {rows.map((r) => (
          <li key={`${r.platform}-${r.line}`} className="flex items-center gap-3 text-body-sm text-ink tabular">
            {r.href ? (
              <a
                href={r.href}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
                aria-label={fill(openLabel, { platform: r.name })}
                data-platform={r.platform}
                className={`${box} hover:bg-sunken`}
              >
                <PlatformMark platform={r.platform} />
              </a>
            ) : (
              <span className={box}>
                <PlatformMark platform={r.platform} />
              </span>
            )}
            <span className="grid min-w-0 flex-1 gap-1.5">
              <span>{r.line}</span>
              {/* The platform's own yes/no split, teal yes and violet no like the crowd bar; the line carries the numbers. */}
              <span className="flex h-1.5 overflow-hidden rounded-full bg-side-b" aria-hidden="true">
                <span className="block h-full w-full origin-left bg-side-a" style={{ transform: `scaleX(${r.yes / 100})` }} />
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="m-0 text-caption text-ink-2">{label}</p>
    </section>
  );
}
