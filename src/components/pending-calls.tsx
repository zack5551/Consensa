"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { readAllCalls, subscribeCalls } from "@/lib/calls-store";

type Item = { slug: string; href: string; question: string; closes: string };

type Props = {
  items: readonly Item[];
  title: string;
  help: string;
  empty: string;
  action: { href: string; label: string };
  locale: "en" | "fr";
};

/**
 * Calls made in this browser on questions that haven't resolved yet. The server renders a quiet placeholder;
 * the list fills in after hydration from the calls store, and updates if a call is saved in another tab.
 */
export function PendingCalls({ items, title, help, empty, action, locale }: Props) {
  const slugs = items.map((i) => i.slug);
  const snapshot = useSyncExternalStore(
    subscribeCalls,
    () => JSON.stringify(readAllCalls(slugs)),
    () => null,
  );
  const calls: Record<string, number> = snapshot ? (JSON.parse(snapshot) as Record<string, number>) : {};
  const mine = items.filter((i) => i.slug in calls);
  const pct = (v: number) => new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", { style: "percent" }).format(v / 100);

  return (
    <section aria-labelledby="pending-title" className="grid gap-3">
      <div className="grid gap-1">
        <h2 id="pending-title" className="m-0 text-title-sm font-bold">
          {title}
        </h2>
        <p className="m-0 text-body-sm text-ink-2">{help}</p>
      </div>
      {snapshot === null ? (
        <div className="h-16 animate-pulse rounded-card bg-sunken motion-reduce:animate-none" aria-hidden="true" />
      ) : mine.length === 0 ? (
        <p className="m-0 flex flex-wrap items-center justify-between gap-3 rounded-card border border-dashed border-line-strong bg-surface p-4 text-body-sm text-ink-2">
          <span>{empty}</span>
          <Link href={action.href} className="rounded-control border border-line px-3 py-2 font-semibold text-ink hover:bg-sunken">
            {action.label}
          </Link>
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {mine.map((i) => (
            <li key={i.slug} className="flex items-center justify-between gap-3 rounded-control border border-line bg-surface p-3">
              <span className="grid min-w-0 gap-0.5">
                <Link href={i.href} className="truncate text-body-sm font-semibold hover:underline">
                  {i.question}
                </Link>
                <span className="text-caption text-ink-2">{i.closes}</span>
              </span>
              <span className="font-display text-body font-bold tabular">{pct(calls[i.slug]!)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
