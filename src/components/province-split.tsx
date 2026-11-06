import { provinces, type Province } from "@/lib/question";

type Props = {
  values: Record<Province, number>;
  title: string;
  summary: string;
  short: Record<Province, string>;
  names: Record<Province, string>;
  format: (v: number) => string;
};

/** Six mini-bars, one per region. The figcaption gives screen readers the highest and lowest. */
export function ProvinceSplit({ values, title, summary, short, names, format }: Props) {
  return (
    <figure className="m-0">
      <figcaption className="mb-2 text-caption font-bold text-canada">{title}</figcaption>
      <ul className="grid grid-cols-6 gap-2" aria-label={summary}>
        {provinces.map((p) => (
          <li key={p} className="grid justify-items-center gap-1">
            <span className="relative block h-10 w-full overflow-hidden rounded-sm bg-side-b-soft" aria-hidden="true">
              <span className="absolute inset-x-0 bottom-0 bg-side-a" style={{ height: `${values[p]}%` }} />
            </span>
            <abbr title={names[p]} className="text-caption text-ink-2 no-underline">
              {short[p]}
            </abbr>
            <span className="text-caption tabular text-ink">{format(values[p])}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
