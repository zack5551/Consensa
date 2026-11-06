import { provinces, type Province } from "@/lib/question";

/** Tile map of Canada: one tile per region, arranged west to east in two rows.
 * Each tile is shaded by its yes share (deeper teal = higher), so the map reads at a
 * glance instead of as six identical bars. The figcaption gives screen readers the
 * highest and lowest. */
const placement: Record<Province, string> = {
  BC: "col-start-1 row-start-1",
  AB: "col-start-2 row-start-1",
  PR: "col-start-3 row-start-1",
  ON: "col-start-2 row-start-2",
  QC: "col-start-3 row-start-2",
  AT: "col-start-4 row-start-2",
};

type Props = {
  values: Record<Province, number>;
  title: string;
  summary: string;
  short: Record<Province, string>;
  names: Record<Province, string>;
  format: (v: number) => string;
};

export function ProvinceSplit({ values, title, summary, short, names, format }: Props) {
  return (
    <figure className="m-0">
      <figcaption className="mb-2 text-caption font-bold text-canada">{title}</figcaption>
      <ul className="grid grid-cols-4 gap-2" aria-label={summary}>
        {provinces.map((p) => {
          const value = values[p];
          const shade = 4 + (value / 100) * 20;
          return (
            <li
              key={p}
              className={`grid gap-0.5 rounded-card border border-line px-2 py-2.5 ${placement[p]}`}
              style={{ background: `color-mix(in srgb, var(--cn-side-a) ${shade}%, var(--cn-surface))` }}
            >
              <abbr title={names[p]} className="text-caption font-semibold text-ink-2 no-underline">
                {short[p]}
              </abbr>
              <span className="font-display text-title-sm font-bold tabular text-ink">{format(value)}</span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
