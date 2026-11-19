/** `href` is the official post. Leave it out for made-up sample rows, which have no real post to open. */
export type SocialPollRow = { platform: string; line: string; href?: string };

type Props = {
  title: string;
  /** LEX's label: "Not verified. May include people outside Canada and under 18." */
  label: string;
  rows: readonly SocialPollRow[];
  viewPost: string;
  /** Set when any row is made-up preview data. */
  sampleLabel?: string;
};

/**
 * Native poll totals from our own social posts, shown apart from "Canada says" and never mixed into it.
 * Totals only, no usernames. Renders nothing when there are no rows.
 */
export function SocialPolls({ title, label, rows, viewPost, sampleLabel }: Props) {
  if (rows.length === 0) return null;
  return (
    <section aria-label={title} className="grid gap-2 border-t border-line pt-4" data-testid="social-polls">
      <h2 className="m-0 text-caption font-bold uppercase tracking-wide text-ink-2">
        {title}
        {sampleLabel && <span className="font-normal normal-case tracking-normal"> · {sampleLabel}</span>}
      </h2>
      <ul className="m-0 grid list-none gap-1 p-0">
        {rows.map((r) => (
          <li key={r.line} className="flex flex-wrap items-baseline justify-between gap-x-3 text-body-sm text-ink tabular">
            <span>{r.line}</span>
            {r.href && (
              <a href={r.href} target="_blank" rel="noopener noreferrer" className="text-caption text-link underline underline-offset-4">
                {viewPost}
                <span className="sr-only"> ({r.platform})</span>
              </a>
            )}
          </li>
        ))}
      </ul>
      <p className="m-0 text-caption text-ink-2">{label}</p>
    </section>
  );
}
