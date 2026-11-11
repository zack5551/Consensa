import type { ReactNode } from "react";

/** A labelled number. The value uses Manrope and tabular digits; the detail line is optional context. */
export function StatTile({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="grid content-start gap-1 border-t-2 border-ink pt-3">
      <dt className="order-2 text-body-sm text-ink-2">{label}</dt>
      <dd className="order-1 m-0 font-display text-headline font-bold tabular">{value}</dd>
      {detail ? <dd className="order-3 m-0 text-caption text-ink-2">{detail}</dd> : null}
    </div>
  );
}
