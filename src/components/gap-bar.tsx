/**
 * A region's chance next to Canada's on one question: two thin bars on the same 0–100 scale.
 * The text label carries the meaning; the bars only support it.
 */
export function GapBar({ regionLabel, regionValue, canadaLabel, canadaValue, format }: {
  regionLabel: string;
  regionValue: number;
  canadaLabel: string;
  canadaValue: number;
  format: (v: number) => string;
}) {
  const rows = [
    { label: regionLabel, value: regionValue, bar: "bg-side-a", text: "text-ink font-semibold" },
    { label: canadaLabel, value: canadaValue, bar: "bg-ink-3", text: "text-canada font-bold" },
  ];
  return (
    <dl className="m-0 grid gap-1.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_3rem] items-center gap-2">
          <dt className={`truncate text-caption ${r.text}`}>{r.label}</dt>
          <span className="block h-2 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
            <span className={`block h-full rounded-full ${r.bar}`} style={{ width: `${r.value}%` }} />
          </span>
          <dd className="m-0 text-right text-caption font-semibold tabular">{format(r.value)}</dd>
        </div>
      ))}
    </dl>
  );
}
