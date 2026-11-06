type Props = { en: number; fr: number; title: string; enLabel: string; frLabel: string; summary: string; format: (v: number) => string };

/** One crowd, two languages: the chance among calls made in English and in French, side by side. */
export function LanguageSplit({ en, fr, title, enLabel, frLabel, summary, format }: Props) {
  const rows = [
    ["en", enLabel, en],
    ["fr", frLabel, fr],
  ] as const;
  return (
    <figure className="m-0">
      <figcaption className="mb-3 text-body-sm font-bold">{title}</figcaption>
      <ul className="m-0 grid list-none gap-3 p-0" aria-label={summary}>
        {rows.map(([key, label, value]) => (
          <li key={key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
            <span className="text-body-sm text-ink-2" lang={key}>
              {label}
            </span>
            <span className="font-display text-body font-bold tabular">{format(value)}</span>
            <span className="col-span-2 block h-2 overflow-hidden rounded-full bg-side-b-soft" aria-hidden="true">
              <span className="block h-full rounded-full bg-side-a" style={{ width: `${value}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
