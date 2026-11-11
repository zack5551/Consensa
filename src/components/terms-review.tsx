"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { formatLongDate } from "@/lib/format";
import { accountsEnabled } from "@/lib/supabase/env";
import { fill } from "@/lib/text";

type State = "hidden" | "ask" | "saving" | "failed" | "done";

/**
 * Shown above the Terms only to a signed-in person who accepted an older version (Terms s. 18). Everyone else sees
 * nothing. Accepting adds a new row to the consent log; declining is deleting the account, linked from here.
 */
export function TermsReview({ locale, t }: { locale: Locale; t: Dictionary["legalPages"]["termsReview"] }) {
  const [state, setState] = useState<State>("hidden");
  const [version, setVersion] = useState("");

  useEffect(() => {
    if (!accountsEnabled) return;
    let live = true;
    fetch("/api/account", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { signedIn?: boolean; termsCurrent?: boolean; termsVersion?: string } | null) => {
        if (!live || !body?.signedIn || body.termsCurrent !== false || !body.termsVersion) return;
        setVersion(body.termsVersion);
        setState("ask");
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (state === "hidden") return null;

  async function accept() {
    setState("saving");
    const res = await fetch("/api/account/terms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version }) }).catch(() => null);
    setState(res?.ok ? "done" : "failed");
  }

  return (
    <section id="accept" aria-labelledby="terms-review-title" className="mx-auto mb-8 grid max-w-[720px] gap-3 rounded-card border-2 border-ink bg-surface p-5 shadow-card">
      <h2 id="terms-review-title" className="m-0 text-title-sm font-bold">
        {t.title}
      </h2>
      {state === "done" ? (
        <p role="status" className="m-0 text-body-sm font-semibold">
          {t.accepted}
        </p>
      ) : (
        <>
          <p className="m-0 text-body-sm text-ink-2">{fill(t.body, { date: formatLongDate(`${version}T12:00:00Z`, locale) })}</p>
          {state === "failed" && (
            <p role="alert" className="m-0 text-body-sm font-semibold text-[var(--cn-danger)]">
              {t.failed}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={state === "saving"}
              aria-busy={state === "saving" || undefined}
              onClick={() => void accept()}
              className="min-h-11 rounded-control bg-ink px-4 py-2 text-body-sm font-bold text-paper hover:opacity-90 disabled:opacity-60"
            >
              {state === "saving" ? t.accepting : t.accept}
            </button>
            <Link href={`/${locale}/record`} className="text-body-sm text-link underline underline-offset-4">
              {t.account}
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
