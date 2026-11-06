/**
 * The lowercase "consensa" wordmark with PRISM's symbol: teal and violet halves, Canada's red point in the seam.
 * Paths come from brand/logo/symbol.svg; colours follow the theme tokens.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display text-title-sm font-extrabold tracking-[-0.02em] ${className}`}>
      <svg viewBox="0 0 100 100" width="24" height="24" aria-hidden="true" className="size-[1em] shrink-0">
        <path fill="var(--cn-side-a)" d="M47 .09A50 50 0 0 0 47 99.91V59.014a9.5 9.5 0 0 1 0-18.028Z" />
        <path fill="var(--cn-side-b)" d="M53 .09a50 50 0 0 1 0 99.82V59.014a9.5 9.5 0 0 0 0-18.028Z" />
        <circle fill="var(--cn-accent)" cx="50" cy="50" r="6.5" />
      </svg>
      <span>consensa</span>
    </span>
  );
}
