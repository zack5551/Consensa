/**
 * A tiny trend line of the crowd's chance (0–100). Decorative: the row's text already says the
 * current number and the 7-day change, so this is aria-hidden. Teal when the crowd moved toward yes,
 * violet when it moved toward no, muted when flat.
 */
export function Sparkline({ values, className = "h-6 w-20" }: { values: readonly number[]; className?: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(8, max - min); // keep small wobbles small instead of stretching them to full height
  const mid = (min + max) / 2;
  const x = (i: number) => (i / (values.length - 1)) * 100;
  const y = (v: number) => 50 - ((v - mid) / span) * 80;
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const delta = (values[values.length - 1] ?? 0) - (values[0] ?? 0);
  const stroke = delta > 0 ? "var(--cn-side-a)" : delta < 0 ? "var(--cn-side-b)" : "var(--cn-text-subtle)";
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={className} aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
