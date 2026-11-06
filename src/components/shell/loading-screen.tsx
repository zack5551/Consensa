"use client";

import { useShell } from "@/components/shell/shell-context";

/**
 * The loading state for any route whose data streams in: an sr-only status line plus skeletons that
 * match the card grid, so nothing jumps when the real cards land. Use it from a route's loading.tsx.
 * (It isn't mounted at the [locale] root on purpose: a root Suspense boundary would turn real 404s into 200s.)
 */
export function LoadingScreen() {
  const { status } = useShell();
  return (
    <div className="grid gap-6" aria-busy="true">
      <p role="status" className="sr-only">
        {status.loading}
      </p>
      <div className="grid gap-2" aria-hidden="true">
        <span className="block h-8 w-56 max-w-full animate-pulse rounded-control bg-sunken motion-reduce:animate-none" />
        <span className="block h-4 w-80 max-w-full animate-pulse rounded-control bg-sunken motion-reduce:animate-none" />
      </div>
      <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <li key={i} className="grid gap-3 rounded-card border border-line bg-surface p-4">
            <span className="block h-3 w-24 animate-pulse rounded-full bg-sunken motion-reduce:animate-none" />
            <span className="block h-5 w-full animate-pulse rounded-control bg-sunken motion-reduce:animate-none" />
            <span className="block h-5 w-2/3 animate-pulse rounded-control bg-sunken motion-reduce:animate-none" />
            <span className="block h-3 w-full animate-pulse rounded-full bg-sunken motion-reduce:animate-none" />
            <span className="block h-9 w-32 justify-self-end animate-pulse rounded-control bg-sunken motion-reduce:animate-none" />
          </li>
        ))}
      </ul>
    </div>
  );
}
