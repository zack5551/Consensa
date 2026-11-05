/** The lowercase "consensa" wordmark with the teal/violet split circle and the red dot. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-4 font-extrabold tracking-[-0.035em] ${className}`}>
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" className="shrink-0">
        <circle cx="12" cy="12" r="11" fill="var(--color-no)" />
        <path d="M12 1a11 11 0 0 0 0 22z" fill="var(--color-yes)" />
      </svg>
      <span>
        consensa<span className="text-accent">.</span>
      </span>
    </span>
  );
}
