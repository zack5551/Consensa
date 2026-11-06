import type { CalibrationBin } from "@/lib/scoring";

type Props = {
  bins: readonly CalibrationBin[];
  title: string;
  help: string;
  axisX: string;
  axisY: string;
  perfect: string;
  summary: string;
  /** One sentence per bin for screen readers, already filled. */
  describe: (bin: CalibrationBin) => string;
  format: (percent: number) => string;
};

const GRID = [0, 25, 50, 75, 100] as const;

/**
 * Calibration: what you said (x) against how often it happened (y). The dashed diagonal is perfect calibration.
 * Dots are HTML so they stay round at any width; their size follows how many calls are in the bin.
 * The list after the chart gives the same data as text.
 */
export function CalibrationChart({ bins, title, help, axisX, axisY, perfect, summary, describe, format }: Props) {
  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  return (
    <figure className="m-0 grid gap-3">
      <figcaption className="grid gap-1">
        <span className="text-body font-bold">{title}</span>
        <span className="text-body-sm text-ink-2">{help}</span>
      </figcaption>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2" role="img" aria-label={summary}>
        <div className="relative w-9 text-caption text-ink-2" aria-hidden="true">
          {GRID.map((g) => (
            <span key={g} className="absolute right-0 -translate-y-1/2 tabular" style={{ top: `${100 - g}%` }}>
              {format(g)}
            </span>
          ))}
        </div>
        <div className="relative aspect-square w-full max-w-sm" aria-hidden="true">
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible">
            {GRID.map((g) => (
              <g key={g}>
                <line x1="0" x2="100" y1={100 - g} y2={100 - g} stroke="var(--cn-border)" vectorEffect="non-scaling-stroke" />
                <line y1="0" y2="100" x1={g} x2={g} stroke="var(--cn-border)" vectorEffect="non-scaling-stroke" />
              </g>
            ))}
            <line x1="0" y1="100" x2="100" y2="0" stroke="var(--cn-text-subtle)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          </svg>
          {bins.map((b) => {
            const size = 0.75 + (b.count / maxCount) * 1.25;
            return (
              <span
                key={b.lower}
                className="absolute -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-surface bg-ink shadow-card"
                style={{ left: `${b.meanForecast * 100}%`, bottom: `${b.observedRate * 100}%`, width: `${size}rem`, height: `${size}rem` }}
              />
            );
          })}
        </div>
        <span aria-hidden="true" />
        <div className="relative h-4 max-w-sm text-caption text-ink-2" aria-hidden="true">
          {GRID.map((g) => (
            <span key={g} className={`absolute tabular ${g === 0 ? "" : g === 100 ? "-translate-x-full" : "-translate-x-1/2"}`} style={{ left: `${g}%` }}>
              {format(g)}
            </span>
          ))}
        </div>
      </div>
      <p className="m-0 flex flex-wrap gap-x-4 text-caption text-ink-2" aria-hidden="true">
        <span>↔ {axisX}</span>
        <span>↕ {axisY}</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="block w-4 -rotate-45 border-t-2 border-dashed border-ink-3" />
          {perfect}
        </span>
      </p>
      <ul className="sr-only">
        {bins.map((b) => (
          <li key={b.lower}>{describe(b)}</li>
        ))}
      </ul>
    </figure>
  );
}
