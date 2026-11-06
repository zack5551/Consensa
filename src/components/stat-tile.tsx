import type { ReactNode } from "react";

/** A labelled number. The value uses Manrope and tabular digits; the detail line is optional context. */
export function StatTile({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="grid content-start gap-1 rounded-card border border-line bg-surface p-4">
      <dt className="text-caption font-semibold text-ink-2">{label}</dt>
      <dd className="m-0 font-display text-title font-extrabold tabular">{value}</dd>
      {detail ? <dd className="m-0 text-caption text-ink-2">{detail}</dd> : null}
    </div>
  );
}
