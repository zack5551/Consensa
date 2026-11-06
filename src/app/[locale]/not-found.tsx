"use client";

/*
 * Screen: not found (a stale link, a moved question, a typo).
 * One message: this page isn't here, but everything else is. One action: go back to today's five.
 */
import Link from "next/link";
import { useShell } from "@/components/shell/shell-context";

export default function NotFound() {
  const { locale, notFound } = useShell();
  return (
    <section className="mx-auto grid max-w-[560px] justify-items-center gap-4 py-16 text-center">
      <p className="m-0 font-display text-stat font-extrabold tabular text-ink-3" aria-hidden="true">
        404
      </p>
      <h1 className="m-0 text-headline font-extrabold tracking-tight text-balance">{notFound.title}</h1>
      <p className="m-0 text-body text-ink-2">{notFound.body}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href={`/${locale}/today`} className="rounded-control bg-ink px-5 py-3 text-body font-bold text-paper hover:opacity-90">
          {notFound.back}
        </Link>
        <Link href={`/${locale}/board`} className="rounded-control border border-line px-5 py-3 text-body font-semibold text-ink hover:bg-sunken">
          {notFound.board}
        </Link>
      </div>
    </section>
  );
}
