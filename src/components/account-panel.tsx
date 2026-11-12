"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { optionalConsents, type ConsentState, type OptionalConsent } from "@/lib/account";
import { PROFILE_STORAGE_KEY } from "@/lib/onboarding";
import { accountsEnabled } from "@/lib/supabase/env";
import { fill } from "@/lib/text";

type State = { kind: "loading" } | { kind: "signedOut" } | { kind: "ready"; email: string; consents: ConsentState };

/**
 * The account area at the foot of My record (Law 25, CASL): your choices, a download of your data, and deleting your
 * account. No new screen. It shows only when accounts are on; in the preview there is no account to manage.
 */
export function AccountPanel({ locale, t, consentLabels }: { locale: Locale; t: Dictionary["account"]; consentLabels: Record<OptionalConsent, string> }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [note, setNote] = useState<string>("");
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState<"" | "failed" | "reauth">("");
  const ids = useId();

  useEffect(() => {
    if (!accountsEnabled) return;
    let live = true;
    fetch("/api/account", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { signedIn?: boolean; email?: string; consents?: ConsentState }) => {
        if (!live) return;
        setState(body.signedIn && body.email && body.consents ? { kind: "ready", email: body.email, consents: body.consents } : { kind: "signedOut" });
      })
      .catch(() => live && setState({ kind: "signedOut" }));
    return () => {
      live = false;
    };
  }, []);

  if (!accountsEnabled) return null;

  async function change(kind: OptionalConsent, on: boolean) {
    if (state.kind !== "ready") return;
    const before = state.consents;
    setState({ ...state, consents: { ...before, [kind]: on } });
    setNote("");
    const res = await fetch("/api/account/consents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, on }) }).catch(() => null);
    if (!res?.ok) {
      setState((s) => (s.kind === "ready" ? { ...s, consents: before } : s));
      setNote(t.consentFailed);
      return;
    }
    setNote(t.consentSaved);
    // Keep this browser's copy of the onboarding choices in step, so nothing here acts on an old "yes".
    try {
      const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
      if (raw) {
        const profile = JSON.parse(raw) as { consents?: Record<string, boolean> };
        window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ ...profile, consents: { ...profile.consents, [kind]: on } }));
      }
    } catch {
      /* storage blocked */
    }
  }

  async function remove() {
    setDeleting(true);
    setDeleteFailed("");
    const res = await fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }) }).catch(() => null);
    if (!res?.ok) {
      setDeleting(false);
      const body = res?.status === 403 ? ((await res.json().catch(() => null)) as { error?: string } | null) : null;
      setDeleteFailed(body?.error === "reauth" ? "reauth" : "failed");
      return;
    }
    // The account is gone; clear this browser's copy too (calls and onboarding answers).
    try {
      for (const key of Object.keys(window.localStorage)) if (key.startsWith("consensa:")) window.localStorage.removeItem(key);
    } catch {
      /* storage blocked */
    }
    window.location.assign(`/${locale}`);
  }

  return (
    <section aria-labelledby={`${ids}-title`} className="grid gap-6 border-t-2 border-ink pt-5">
      <h2 id={`${ids}-title`} className="m-0 font-display text-headline font-bold tracking-tight text-balance">
        {t.title}
      </h2>

      {state.kind === "loading" ? (
        <p className="m-0 text-body-sm text-ink-2" role="status">
          {t.loading}
        </p>
      ) : state.kind === "signedOut" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 max-w-[60ch] text-body-sm text-ink-2">{t.signedOut}</p>
          <Link href={`/${locale}/sign-in`} className="rounded-control bg-ink px-4 py-2 text-body-sm font-bold text-paper hover:opacity-90">
            {t.signIn}
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 min-w-0 break-words text-body-sm">{fill(t.signedInAs, { email: state.email })}</p>
            <form method="post" action="/api/auth/sign-out">
              <input type="hidden" name="next" value={`/${locale}`} />
              <button type="submit" className="min-h-11 rounded-control border border-line px-4 py-2 text-body-sm font-semibold hover:bg-sunken">
                {t.signOut}
              </button>
            </form>
          </div>

          <fieldset className="m-0 grid gap-3 border-0 border-t border-line p-0 pt-5">
            <legend className="float-left mb-1 w-full font-display text-title-sm font-bold">{t.consentsTitle}</legend>
            <p className="m-0 text-body-sm text-ink-2">{t.consentsHelp}</p>
            {optionalConsents.map((kind) => (
              <label key={kind} className="flex min-h-11 cursor-pointer items-start gap-3 text-body-sm">
                <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--cn-side-a)]" checked={state.consents[kind]} onChange={(e) => void change(kind, e.target.checked)} />
                <span>{consentLabels[kind]}</span>
              </label>
            ))}
            <p className="m-0 min-h-5 text-caption text-ink-2" role="status">
              {note}
            </p>
          </fieldset>

          <div className="grid gap-3 border-t border-line pt-5">
            <h3 className="m-0 font-display text-title-sm font-bold">{t.dataTitle}</h3>
            <p className="m-0 max-w-[60ch] text-body-sm text-ink-2">{t.dataHelp}</p>
            <a href="/api/account/export" download className="justify-self-start rounded-control border border-line px-4 py-2 text-body-sm font-semibold hover:bg-sunken">
              {t.download}
            </a>
          </div>

          <div className="grid gap-3 border-t border-line pt-5">
            <h3 className="m-0 font-display text-title-sm font-bold">{t.deleteTitle}</h3>
            <p className="m-0 max-w-[60ch] text-body-sm text-ink-2">{t.deleteHelp}</p>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-body-sm">
              <input type="checkbox" className="mt-0.5 size-5 shrink-0" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
              <span>{t.deleteConfirm}</span>
            </label>
            {deleteFailed === "failed" && (
              <p role="alert" className="m-0 text-body-sm font-semibold text-[var(--cn-danger)]">
                {t.deleteFailed}
              </p>
            )}
            {deleteFailed === "reauth" && (
              <p role="alert" className="m-0 max-w-[60ch] text-body-sm font-semibold text-[var(--cn-danger)]">
                {t.deleteReauth}{" "}
                <Link href={`/${locale}/sign-in`} className="underline">
                  {t.signInAgain}
                </Link>
              </p>
            )}
            <button
              type="button"
              disabled={!confirm || deleting}
              aria-busy={deleting || undefined}
              onClick={() => void remove()}
              className="min-h-11 justify-self-start rounded-control border border-[var(--cn-danger)] px-4 py-2 text-body-sm font-bold text-[var(--cn-danger)] hover:bg-sunken disabled:opacity-60"
            >
              {deleting ? t.deleting : t.deleteAction}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
