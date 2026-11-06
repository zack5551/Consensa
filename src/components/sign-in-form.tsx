"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { emailSchema } from "@/lib/onboarding";
import { fill } from "@/lib/text";

/**
 * Passwordless sign-in: one email field, one action. The "sent" message is the same whether or not
 * the address has an account, so the form can't be used to find out who's signed up. In the preview
 * nothing is sent, and the screen says so.
 */
export function SignInForm({ locale, t }: { locale: Locale; t: Dictionary["signIn"] }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const ids = useId();

  useEffect(() => {
    if (sent) heading.current?.focus();
  }, [sent]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!emailSchema.safeParse(value).success) {
      setError(true);
      return;
    }
    setSent(value);
  }

  if (sent) {
    return (
      <section className="grid gap-4">
        <h2 ref={heading} tabIndex={-1} className="m-0 font-display text-headline font-extrabold tracking-tight outline-none">
          {t.sentTitle}
        </h2>
        <p className="m-0 text-body-lg text-ink-2">{fill(t.sentBody, { email: sent })}</p>
        <p role="note" className="m-0 rounded-control border border-line bg-sunken p-3 text-body-sm">
          {t.previewNote}
        </p>
        <button type="button" onClick={() => setSent(null)} className="justify-self-start rounded-control border border-line px-4 py-2 text-body-sm font-semibold hover:bg-sunken">
          {t.another}
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      <div className="grid gap-2">
        <label htmlFor={`${ids}-email`} className="text-body font-semibold">
          {t.email}
        </label>
        <input
          id={`${ids}-email`}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(false);
          }}
          aria-invalid={error || undefined}
          aria-describedby={error ? `${ids}-err` : undefined}
          className="h-12 w-full rounded-control border border-control bg-surface px-3 text-body text-ink aria-[invalid]:border-[var(--cn-danger)]"
        />
        {error && (
          <p id={`${ids}-err`} className="m-0 text-body-sm font-semibold text-[var(--cn-danger)]">
            {t.invalid}
          </p>
        )}
      </div>
      <button type="submit" className="min-h-11 rounded-control bg-ink px-5 py-3 text-body font-bold text-paper hover:opacity-90">
        {t.submit}
      </button>
      <p className="m-0 text-body-sm text-ink-2">
        {t.newHere}{" "}
        <Link href={`/${locale}/welcome`} className="font-semibold text-link underline underline-offset-2">
          {t.getStarted}
        </Link>
      </p>
    </form>
  );
}
