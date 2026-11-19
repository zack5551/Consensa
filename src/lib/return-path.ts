/**
 * Links into sign-up and sign-in that bring people back to the page they were on. Framework-free so it can be
 * unit-tested. `next` is always checked with `returnPath` (src/lib/supabase/config.ts) before it is used.
 */
import type { Locale } from "@/i18n/config";
import { returnPath } from "@/lib/supabase/config";

function withNext(base: string, next: string | null | undefined, extra = ""): string {
  const back = returnPath(next);
  const query = [extra, back ? `next=${back}` : ""].filter(Boolean).join("&");
  return query ? `${base}?${query}` : base;
}

/** The onboarding link, e.g. `/en/welcome?next=/en/q/boc-cut-dec-2026`. */
export function welcomeHref(locale: Locale, next?: string | null, extra = ""): string {
  return withNext(`/${locale}/welcome`, next, extra);
}

/** The same page in the other language: `/en/q/x` becomes `/fr/q/x`. Null when `next` isn't a safe return path. */
export function inLocale(next: string | null | undefined, locale: Locale): string | null {
  const back = returnPath(next);
  return back ? returnPath(`/${locale}${back.slice(3)}`) : null;
}

/** Where the email link sends people once they're signed in. */
export function landingPath(locale: Locale, next: string | null | undefined): string {
  return returnPath(next) ?? `/${locale}/today`;
}
