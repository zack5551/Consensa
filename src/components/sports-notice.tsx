/**
 * The two lines every sports screen carries (LEX's sports-questions rules): a "fan forecasts, not advice" label next
 * to the no-value label, and a non-affiliation footer. Strings come in from the dictionary.
 */
export function SportsNotice({ label, footer }: { label?: string; footer: string }) {
  return (
    <>
      {label && (
        <p className="m-0 text-caption text-ink-2" data-testid="sports-label">
          {label}
        </p>
      )}
      <p className="m-0 text-caption text-ink-2" data-testid="sports-footer">
        {footer}
      </p>
    </>
  );
}
