import type { TrendPoint } from "@/lib/record";

type Props = {
  points: readonly TrendPoint[];
  title: string;
  help: string;
  youLabel: string;
  crowdLabel: string;
  summary: string;
  format: (brier: number) => string;
};

/**
 * Running Brier score, you vs Canada, one point per result. Lower is better, so the axis runs 0 at the bottom.
 * Lines are SVG stretched to the box; labels are HTML. The summary covers screen readers.
 */
export function TrendChart({ points, title, help, youLabel, crowdLabel, summary, format }: Props) {
  const n = points.length;
  const top = Math.max(0.3, ...points.flatMap((p) => [p.user, p.crowd])) * 1.1;
  const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - (v / top) * 100;
  const path = (key: "user" | "crowd") => points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(p[key]).toFixed(2)}`).join(" ");
  const last = points[n - 1];
  const grid = [0, 0.1, 0.2, 0.3].filter((g) => g <= top);

  return (
    <figure className="m-0 grid gap-3">
      <figcaption className="grid gap-1">
        <span className="text-body font-bold">{title}</span>
        <span className="text-body-sm text-ink-2">{help}</span>
      </figcaption>
      <ul className="m-0 flex list-none flex-wrap gap-4 p-0 text-caption font-semibold" aria-hidden="true">
        <li className="inline-flex items-center gap-2">
          <span className="block h-0.5 w-5 bg-ink" />
          {youLabel}
        </li>
        <li className="inline-flex items-center gap-2 text-ink-2">
          <span className="block h-0 w-5 border-t-2 border-dashed border-ink-3" />
          {crowdLabel}
        </li>
      </ul>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2" role="img" aria-label={summary}>
        <div className="relative h-40 sm:h-48" aria-hidden="true">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            {grid.map((g) => (
              <line key={g} x1="0" x2="100" y1={y(g)} y2={y(g)} stroke="var(--cn-border)" strokeDasharray={g === 0 ? undefined : "2 4"} vectorEffect="non-scaling-stroke" />
            ))}
            <path d={path("crowd")} fill="none" stroke="var(--cn-text-subtle)" strokeWidth="2" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
            <path d={path("user")} fill="none" stroke="var(--cn-text)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {last ? (
            <span className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink" style={{ left: `${x(n - 1)}%`, top: `${y(last.user)}%` }} />
          ) : null}
        </div>
        <div className="relative w-10 text-caption text-ink-2" aria-hidden="true">
          {grid.map((g) => (
            <span key={g} className="absolute -translate-y-1/2 tabular" style={{ top: `${y(g)}%` }}>
              {format(g)}
            </span>
          ))}
        </div>
      </div>
      <p className="sr-only">{summary}</p>
    </figure>
  );
}
