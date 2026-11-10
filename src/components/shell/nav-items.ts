import type { Locale } from "@/i18n/config";
import type { IconName } from "./icons";

/**
 * The app's five destinations, in order. The same list drives the desktop header and the phone tab
 * bar so they can never disagree. `also` lists other route prefixes that belong to the same place
 * (browse and search are part of the board).
 */
export const navItems = [
  { key: "today", path: "/today", icon: "today", also: [] },
  { key: "board", path: "/board", icon: "board", also: ["/browse", "/search"] },
  { key: "provinces", path: "/provinces", icon: "provinces", also: [] },
  { key: "leaderboard", path: "/leaderboard", icon: "leaderboard", also: ["/forecasters"] },
  { key: "record", path: "/record", icon: "record", also: [] },
] as const satisfies ReadonlyArray<{ key: string; path: `/${string}`; icon: IconName; also: readonly string[] }>;

export type NavKey = (typeof navItems)[number]["key"];

/** "/today" → "/fr/today". "/" and "/#how" stay on the locale's home ("/fr", "/fr#how"). */
export function localeHref(locale: Locale, path: string): string {
  if (path === "/") return `/${locale}`;
  if (path.startsWith("/#") || path.startsWith("/?")) return `/${locale}${path.slice(1)}`;
  return `/${locale}${path}`;
}

/** Which nav item a pathname belongs to, if any. Matches whole segments, so /todayx is not /today. */
export function activeNav(pathname: string, locale: Locale): NavKey | null {
  const rest = pathname.replace(new RegExp(`^/${locale}(?=/|$)`), "") || "/";
  const under = (prefix: string) => rest === prefix || rest.startsWith(`${prefix}/`);
  for (const item of navItems) {
    if (under(item.path) || item.also.some(under)) return item.key;
  }
  return null;
}
