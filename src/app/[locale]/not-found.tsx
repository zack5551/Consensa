import Link from "next/link";
import en from "@/i18n/dictionaries/en";

/*
 * Screen: not found (a stale link, a moved question, a typo).
 * The Consensa mark, split apart with a "?" where the halves should meet — a forecast
 * that missed. One message: this page isn't here, but everything else is.
 * Still English-only, like the old version: the [locale] shell in PR #13 is what makes
 * a 404 bilingual. The French strings are already in the dictionaries for it.
 */
export default function NotFound() {
  return (
    <section className="mx-auto grid max-w-[560px] justify-items-center gap-4 py-16 text-center">
      <svg
        width="200"
        height="120"
        viewBox="0 0 200 120"
        role="img"
        aria-label="The Consensa mark, split apart"
        className="h-auto w-[200px]"
      >
        <path d="M 62 20 A 40 40 0 0 0 62 100 Z" fill="var(--cn-side-a)" />
        <path d="M 138 20 A 40 40 0 0 1 138 100 Z" fill="var(--cn-side-b)" />
        <path
          d="M 70 40 C 85 18, 115 18, 130 40"
          fill="none"
          stroke="var(--cn-ink)"
          strokeWidth="2"
          strokeDasharray="1 6"
          strokeLinecap="round"
        />
        <text x="100" y="74" textAnchor="middle" fontSize="32" fontWeight="700" fill="var(--cn-ink)" fontFamily="Georgia, 'Times New Roman', serif">
          ?
        </text>
      </svg>
      <p className="m-0 text-caption font-semibold tracking-wide text-ink-2 uppercase">404</p>
      <h1 className="m-0 font-display text-headline font-extrabold tracking-tight text-balance">{en.notFound.title}</h1>
      <p className="m-0 text-body-lg text-ink-2">{en.notFound.body}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/en/today" className="rounded-control bg-ink px-5 py-3 text-body font-bold text-paper hover:opacity-90">
          {en.notFound.back}
        </Link>
        <Link href="/en/methodology" className="rounded-control border border-line px-5 py-3 text-body font-semibold text-ink hover:bg-sunken">
          {en.methodology.title}
        </Link>
      </div>
    </section>
  );
}
