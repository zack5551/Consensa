type Props = {
  history: readonly number[];
  events: ReadonlyArray<{ dayIndex: number; label: string }>;
  title: string;
  summary: string;
  /** Formats the axis labels for the locale ("50%" / "50 %"). */
  format?: (v: number) => string;
};

const GRID = [0, 25, 50, 75, 100] as const;

/**
 * The crowd's daily probability as a line. Lines are SVG stretched to the box (strokes stay crisp);
 * labels are HTML so they stay readable at phone width. A text summary covers screen readers.
 */
export function ForecastChart({ history, events, title, summary, format = (v) => `${v}%` }: Props) {
  const n = history.length;
  const x = (i: number) => (i / Math.max(1, n - 1)) * 100;
  const y = (v: number) => 100 - v;
  const line = history.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const last = history[n - 1] ?? 0;

  return (
    <figure className="m-0">
      <figcaption className="mb-3 text-body-sm font-bold">{title}</figcaption>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2" role="img" aria-label={summary}>
        <div className="relative h-48 sm:h-56" aria-hidden="true">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            {GRID.map((g) => (
              <line key={g} x1="0" x2="100" y1={y(g)} y2={y(g)} stroke="var(--cn-border)" vectorEffect="non-scaling-stroke" />
            ))}
            {events.map((e) => (
              <line key={e.dayIndex} x1={x(e.dayIndex)} x2={x(e.dayIndex)} y1="0" y2="100" stroke="var(--cn-text-muted)" strokeDasharray="3 3" opacity="0.6" vectorEffect="non-scaling-stroke" />
            ))}
            <path d={line} fill="none" stroke="var(--cn-side-a)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <span
            className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-side-a"
            style={{ left: "100%", top: `${y(last)}%` }}
          />
          <span
            className="absolute rounded-full bg-ink px-2 py-0.5 text-caption font-bold text-paper"
            style={{ left: "calc(100% - 10px)", top: `${y(last)}%`, transform: "translate(-100%, -50%)" }}
          >
            {format(last)}
          </span>
          {events.map((e) => (
            <span
              key={`dot-${e.dayIndex}`}
              aria-hidden="true"
              className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-side-a"
              style={{ left: `${x(e.dayIndex)}%`, top: `${y(history[e.dayIndex] ?? last)}%` }}
            />
          ))}
          {events.map((e, i) => {
            const nearEnd = x(e.dayIndex) > 70;
            return (
              <span
                key={e.dayIndex}
                className={`absolute max-w-[45%] truncate bg-surface px-1 text-caption text-ink-2 ${nearEnd ? "-translate-x-full" : ""}`}
                style={{ left: `${x(e.dayIndex)}%`, top: `${i * 20}px` }}
              >
                {e.label}
              </span>
            );
          })}
        </div>
        <div className="relative w-10 text-caption text-ink-2" aria-hidden="true">
          {GRID.map((g) => (
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
