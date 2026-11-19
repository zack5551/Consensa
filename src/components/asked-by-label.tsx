/**
 * A guest or brand question's "Asked by" / "Sponsored by" label (LEX, guest and brand questions). Small and muted, but
 * always visible, with no click: it sits right next to the question wherever the question appears. Pass the label
 * already built by askedByLabel(); render nothing when the question has none.
 */
export function AskedByLabel({ label, className = "" }: { label: string | undefined; className?: string }) {
  if (!label) return null;
  return (
    <span className={`block text-caption font-semibold text-ink-2 ${className}`.trim()} data-asked-by>
      {label}
    </span>
  );
}
