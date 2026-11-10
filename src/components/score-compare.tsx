/**
 * Your Brier score next to Canada's, as two bars on the same scale. Lower is better, so the shorter bar wins.
 * The numbers are in the text; the bars only support them.
 */
type Row = { label: string; value: number; display: string; tone: "you" | "crowd" };

const SCALE_MAX = 0.3;

export function ScoreCompare({ rows, help }: { rows: readonly Row[]; help: string }) {
  return (
    <div className="grid gap-3">
      <dl className="m-0 grid gap-2">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3">
            <dt className={`text-body-sm ${r.tone === "crowd" ? "font-bold text-canada" : "font-semibold text-ink"}`}>{r.label}</dt>
            <span className="block h-2.5 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
              <span
                className={`block h-full rounded-full ${r.tone === "you" ? "bg-ink" : "bg-ink-3"}`}
                style={{ width: `${Math.min(100, (r.value / SCALE_MAX) * 100)}%` }}
              />
            </span>
            <dd className="m-0 font-display text-body font-bold tabular">{r.display}</dd>
          </div>
        ))}
      </dl>
      <p className="m-0 text-caption text-ink-2">{help}</p>
    </div>
  );
}
