"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { solveBotCheck } from "@/lib/bot-check-client";
import { formatLongDate } from "@/lib/format";
import { fill } from "@/lib/text";

type T = Dictionary["socialLink"];
type ResultCode = keyof T["result"];
type LinkRow = { platform: string; linkedAt: string; paused: boolean };
type State = { kind: "loading" } | { kind: "signedOut" } | { kind: "unavailable" } | { kind: "ready"; available: string[]; links: LinkRow[] };

/** What the start route can answer, mapped to the message shown. */
const startErrors: Record<string, ResultCode> = { "outside canada": "outside", "bot check": "botCheck", unconfirmed: "unconfirmed", "slow down": "slow", "sign in": "signedOut" };

/**
 * Link or unlink an X account. The consent box is its own, unticked choice (Law 25: express consent), and the
 * button does nothing until it is ticked. Linking opens X's own sign-in; we never see a password. Facebook,
 * Instagram and Threads are named but can't be linked until Meta approves the app.
 */
export function SocialLinkPanel({ locale, t, result }: { locale: Locale; t: T; result: ResultCode | null }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [consent, setConsent] = useState(false);
  const [needConsent, setNeedConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(result ? { text: t.result[result], bad: result !== "linked" } : null);
  const ids = useId();

  async function load(): Promise<State> {
    const res = await fetch("/api/account/social", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return { kind: "unavailable" };
    const body = (await res.json().catch(() => null)) as { signedIn?: boolean; available?: string[]; links?: LinkRow[] } | null;
    if (!body?.signedIn) return { kind: "signedOut" };
    return { kind: "ready", available: body.available ?? [], links: body.links ?? [] };
  }

  useEffect(() => {
    let live = true;
    void load().then((next) => live && setState(next));
    return () => {
      live = false;
    };
  }, []);

  async function link() {
    if (!consent) {
      setNeedConsent(true);
      return;
    }
    setBusy(true);
    setNote(null);
    const altcha = await solveBotCheck();
    const res = await fetch("/api/account/social/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(altcha ? { "x-altcha": altcha } : {}) },
      body: JSON.stringify({ platform: "x", consent: true, locale }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (res?.ok && body?.url) {
      window.location.assign(body.url); // on to X's own sign-in page
      return;
    }
    setBusy(false);
    setNote({ text: t.result[startErrors[body?.error ?? ""] ?? "failed"], bad: true });
  }

  async function unlink() {
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/account/social", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform: "x" }) }).catch(() => null);
    if (res?.ok) {
      setConsent(false);
      setState(await load());
      setNote({ text: t.unlinked, bad: false });
    } else {
      setNote({ text: t.unlinkFailed, bad: true });
    }
    setBusy(false);
  }

  const x = state.kind === "ready" ? state.links.find((l) => l.platform === "x") : undefined;

  return (
    <section aria-labelledby={`${ids}-x`} className="grid gap-5 rounded-card border border-line border-t-4 border-t-ink bg-surface p-5 sm:p-6">
      {note && (
        <p role={note.bad ? "alert" : "status"} className="m-0 rounded-control border border-line bg-sunken p-3 text-body-sm font-semibold">
          {note.text}
        </p>
      )}

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
      ) : state.kind === "unavailable" ? (
        <p className="m-0 text-body-sm text-ink-2">{t.notAvailable}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id={`${ids}-x`} className="m-0 font-display text-title-sm font-bold">
              {t.platforms.x}
            </h2>
            {x && <p className="m-0 text-body-sm font-bold">{x.paused ? t.paused : t.linked}</p>}
          </div>

          {x ? (
            <div className="grid gap-3">
              <p className="m-0 text-body-sm text-ink-2">{fill(t.linkedSince, { date: formatLongDate(x.linkedAt, locale) })}</p>
              {x.paused && <p className="m-0 max-w-[60ch] text-body-sm text-ink-2">{t.pausedHelp}</p>}
              <button
                type="button"
                disabled={busy}
                aria-busy={busy || undefined}
                onClick={() => void unlink()}
                className="min-h-11 justify-self-start rounded-control border border-line px-4 py-2 text-body-sm font-semibold hover:bg-sunken disabled:opacity-60"
              >
                {busy ? t.unlinking : t.unlink}
              </button>
            </div>
          ) : state.available.includes("x") ? (
            <fieldset className="m-0 grid gap-3 border-0 p-0">
              <legend className="sr-only">{t.consentLegend}</legend>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 text-body-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-5 shrink-0 accent-[var(--cn-side-a)]"
                  checked={consent}
                  aria-describedby={needConsent && !consent ? `${ids}-need` : undefined}
                  onChange={(e) => {
                    setConsent(e.target.checked);
                    setNeedConsent(false);
                  }}
                />
                <span>{t.consent}</span>
              </label>
              {needConsent && !consent && (
                <p id={`${ids}-need`} role="alert" className="m-0 text-body-sm font-semibold text-[var(--cn-danger)]">
                  {t.consentRequired}
                </p>
              )}
              <button
                type="button"
                disabled={busy}
                aria-busy={busy || undefined}
                onClick={() => void link()}
                className="min-h-11 justify-self-start rounded-control bg-ink px-5 py-3 text-body font-bold text-paper hover:opacity-90 disabled:opacity-60"
              >
                {busy ? t.linking : t.link}
              </button>
            </fieldset>
          ) : (
            <p className="m-0 text-body-sm text-ink-2">{t.notAvailable}</p>
          )}

          <p className="m-0 border-t border-line pt-4 text-body-sm text-ink-2">{t.notYet}</p>
        </>
      )}
    </section>
  );
}
