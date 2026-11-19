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

const carriesNext = /^\/(?:en|fr)\/(?:welcome|sign-in)\/?$/;
const questionPage = /^\/(?:en|fr)\/q\/[A-Za-z0-9._~-]+\/?$/;

/** Whether a return path is a question page (`/en/q/boc-cut-dec-2026`), so the "come back to this question" line is true. */
export function isQuestionPath(next: string | null | undefined): boolean {
  const back = returnPath(next);
  return back !== null && questionPage.test(back);
}

/**
 * The header's language switch: the same page in the other language. On onboarding and sign-in, `next` comes along in
 * that language too (as the in-page language step does), so switching language never loses the question.
 */
export function headerLocaleHref(pathname: string, next: string | null | undefined, locale: Locale): string {
  const base = pathname.replace(/^\/(en|fr)(?=\/|$)/, `/${locale}`);
  return carriesNext.test(pathname) ? withNext(base, inLocale(next, locale)) : base;
}

/**
 * The header's sign-in link. From a question page it brings people back to that question; from onboarding it keeps
 * the `next` already there. Anywhere else it is the plain sign-in page.
 */
export function headerSignInHref(locale: Locale, pathname: string, next: string | null | undefined): string {
  const base = `/${locale}/sign-in`;
  if (questionPage.test(pathname)) return withNext(base, pathname);
  if (/^\/(?:en|fr)\/welcome\/?$/.test(pathname)) return withNext(base, next);
  return base;
}
