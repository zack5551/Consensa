import { PlatformMark } from "@/components/platform-mark";
import type { SocialPlatform } from "@/lib/social";

/**
 * One platform on a question page. `line` is its poll result ("X poll, Nov 5: 58% yes · 1,240 votes") when we have
 * one; `href` is our official post there. A made-up sample row has a line but no post to open.
 */
export type SocialPollRow = { platform: SocialPlatform; name: string; line?: string; href?: string };

type Props = {
  title: string;
  /** LEX's label: "Not verified. May include people outside Canada and under 18." Shown when any row has a result. */
  label: string;
  /** "Open our {platform} post (new tab)": the logo's accessible name. */
  openLabel: string;
  rows: readonly SocialPollRow[];
  /** Set when any row is made-up preview data. */
  sampleLabel?: string;
};

const box = "inline-grid size-11 shrink-0 place-items-center rounded-control border border-line bg-surface";

/**
 * Our posts on social media for this question: each platform's logo opens our post there, with that platform's own
 * poll result beside it. Shown apart from "Canada says" and never mixed into it. Totals only, no usernames. Plain
 * links: nothing loads from the platforms until someone taps one. Renders nothing when there are no rows.
 */
export function SocialPolls({ title, label, openLabel, rows, sampleLabel }: Props) {
  if (rows.length === 0) return null;
  return (
    <section aria-label={title} className="grid gap-3 border-t border-line pt-4" data-testid="social-polls">
      <h2 className="m-0 text-caption font-bold uppercase tracking-wide text-ink-2">
        {title}
        {sampleLabel && <span className="font-normal normal-case tracking-normal"> · {sampleLabel}</span>}
      </h2>
      <ul className="m-0 grid list-none gap-2 p-0">
        {rows.map((r) => (
          <li key={`${r.platform}-${r.line ?? ""}`} className="flex items-center gap-3 text-body-sm text-ink tabular">
            {r.href ? (
              <a
                href={r.href}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
                aria-label={openLabel.replace("{platform}", r.name)}
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
            <span>{r.line ?? r.name}</span>
          </li>
        ))}
      </ul>
      {rows.some((r) => r.line) && <p className="m-0 text-caption text-ink-2">{label}</p>}
    </section>
  );
}
