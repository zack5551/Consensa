"use client";

/*
 * Screen: error (anything under a locale that throws while rendering).
 * One message: it's on our side, and your calls are safe. One action: try again.
 */
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useShell } from "@/components/shell/shell-context";

export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { locale, status, notFound } = useShell();
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // Move focus so keyboard and screen-reader users land on the explanation, not mid-page.
    heading.current?.focus();
    // Sentry (personal info scrubbed) takes this over in M5. Only the digest is logged, never user data.
    if (error.digest) console.error(`render error ${error.digest}`);
  }, [error]);

  return (
    <section className="mx-auto grid max-w-[560px] justify-items-center gap-4 py-16 text-center">
      <svg viewBox="0 0 48 48" className="size-12" aria-hidden="true">
        <path d="M22 4a20 20 0 0 0 0 40V29a5 5 0 0 1 0-10Z" fill="var(--cn-side-a)" />
        <path d="M26 4a20 20 0 0 1 0 40V29a5 5 0 0 0 0-10Z" fill="var(--cn-side-b)" opacity=".45" />
      </svg>
      <h1 ref={heading} tabIndex={-1} className="m-0 text-headline font-extrabold tracking-tight text-balance outline-none">
        {status.errorTitle}
      </h1>
      <p className="m-0 text-body text-ink-2">{status.errorBody}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="rounded-control bg-ink px-5 py-3 text-body font-bold text-paper hover:opacity-90">
          {status.retry}
        </button>
        <Link href={`/${locale}/today`} className="rounded-control border border-line px-5 py-3 text-body font-semibold text-ink hover:bg-sunken">
          {notFound.back}
        </Link>
      </div>
    </section>
  );
}
