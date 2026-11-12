"use client";

/*
 * Screen: not found (a stale link, a moved question, a typo).
 * The Consensa mark, split apart with a "?" where the halves should meet — a forecast
 * that missed. One message: this page isn't here, but everything else is. One action: go back to today's five.
 * Bilingual through the [locale] shell: the layout fills the notFound strings from the dictionary.
 */
import Link from "next/link";
import { useShell } from "@/components/shell/shell-context";

export default function NotFound() {
  const { locale, notFound, methodology } = useShell();
  return (
    <section className="mx-auto grid max-w-xl justify-items-center gap-4 py-16 text-center">
      <svg
        width="200"
        height="120"
        viewBox="0 0 200 120"
        aria-hidden="true"
        focusable="false"
        className="h-auto w-50"
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
      <h1 className="m-0 font-display text-headline font-bold tracking-tight sm:text-display text-balance">{notFound.title}</h1>
      <p className="m-0 text-body-lg text-ink-2">{notFound.body}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href={`/${locale}/today`} className="rounded-control bg-ink px-5 py-3 text-body font-bold text-paper hover:opacity-90">
          {notFound.back}
        </Link>
        <Link href={`/${locale}/board`} className="rounded-control border border-line px-5 py-3 text-body font-semibold text-ink hover:bg-sunken">
          {notFound.board}
        </Link>
        <Link href={`/${locale}/methodology`} className="rounded-control border border-line px-5 py-3 text-body font-semibold text-ink hover:bg-sunken">
          {methodology.title}
        </Link>
      </div>
    </section>
  );
}
