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
  /** Shade tiles across this question's own range, so close values still read apart. */
  relative?: boolean;
  /** Regions with too few real calls to show: their tile reads "—" and stays unshaded. */
  hidden?: readonly Province[];
  /** Explains the "—" tiles; shown only when a tile is hidden. */
  hiddenNote?: string;
};

export function ProvinceSplit({ values, title, summary, short, names, format, relative = false, hidden = [], hiddenNote }: Props) {
  const all = provinces.filter((p) => !hidden.includes(p)).map((p) => values[p]);
  const min = all.length ? Math.min(...all) : 0;
  const span = (all.length ? Math.max(...all) : 0) - min || 1;
  return (
    <figure className="m-0">
      <figcaption className="mb-2 text-caption font-bold text-canada">{title}</figcaption>
      <ul className="grid grid-cols-4 gap-2" aria-label={summary}>
        {provinces.map((p) => {
          const value = values[p];
          const off = hidden.includes(p);
          const shade = off ? 0 : relative ? 6 + ((value - min) / span) * 34 : 4 + (value / 100) * 20;
          return (
            <li
              key={p}
              className={`grid gap-0.5 rounded-card border border-line px-2 py-2.5 ${placement[p]}`}
              style={{ background: `color-mix(in srgb, var(--cn-side-a) ${shade}%, var(--cn-surface))` }}
            >
              <abbr title={names[p]} className={`text-caption font-semibold no-underline ${relative ? "text-ink" : "text-ink-2"}`}>
                {short[p]}
              </abbr>
              <span className={`font-display text-title-sm font-bold tabular ${off ? "text-ink-3" : "text-ink"}`}>{off ? "—" : format(value)}</span>
            </li>
          );
        })}
      </ul>
      {hidden.length > 0 && hiddenNote ? <p className="mb-0 mt-2 text-caption text-ink-2">{hiddenNote}</p> : null}
    </figure>
  );
}
