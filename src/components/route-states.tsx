"use client";

import { useParams } from "next/navigation";
import en from "@/i18n/dictionaries/en";
import fr from "@/i18n/dictionaries/fr";

function useStatus() {
  const params = useParams<{ locale?: string }>();
  return params?.locale === "fr" ? fr.status : en.status;
}

/** Route loading state: a quiet skeleton in the page's shape. Screen readers hear one status line. */
export function RouteLoading() {
  const t = useStatus();
  return (
    <div className="grid gap-6" aria-busy="true">
      <p role="status" className="sr-only">
        {t.loading}
      </p>
      <div className="grid gap-3" aria-hidden="true">
        <div className="h-9 w-2/3 max-w-md animate-pulse rounded-control bg-sunken motion-reduce:animate-none" />
        <div className="h-5 w-full max-w-lg animate-pulse rounded-control bg-sunken motion-reduce:animate-none" />
      </div>
      <div className="h-48 animate-pulse rounded-card bg-sunken motion-reduce:animate-none" aria-hidden="true" />
      <div className="grid gap-3 sm:grid-cols-3" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-card bg-sunken motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  );
}

/** Route error state: what happened, that calls are safe, and one way forward. */
export function RouteError({ reset }: { reset: () => void }) {
  const t = useStatus();
  return (
    <div role="alert" className="grid justify-items-start gap-3 rounded-card border border-line bg-surface p-6">
      <h1 className="m-0 font-display text-title font-extrabold">{t.errorTitle}</h1>
      <p className="m-0 text-body text-ink-2">{t.errorBody}</p>
      <button type="button" onClick={reset} className="rounded-control bg-ink px-4 py-2 text-body-sm font-bold text-paper hover:opacity-90">
        {t.retry}
      </button>
    </div>
  );
}
