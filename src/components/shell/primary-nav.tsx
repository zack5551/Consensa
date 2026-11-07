"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/i18n/config";
import { Icon } from "./icons";
import { activeNav, localeHref, navItems, type NavKey } from "./nav-items";

type Props = { locale: Locale; labels: Record<NavKey, string>; navLabel: string };

/** Desktop and tablet: the five destinations inline in the header. Hidden on phones, where the tab bar takes over. */
export function PrimaryNav({ locale, labels, navLabel }: Props) {
  const active = activeNav(usePathname() ?? "", locale);
  return (
    <nav aria-label={navLabel} className="hidden md:block">
      <ul className="m-0 flex list-none items-center gap-1 p-0">
        {navItems.map((item) => {
          const current = active === item.key;
          return (
            <li key={item.key}>
              <Link
                href={localeHref(locale, item.path)}
                aria-current={current ? "page" : undefined}
                className={`relative inline-flex h-10 items-center rounded-control px-3 text-body-sm font-semibold transition-colors duration-[var(--cn-duration-fast)] hover:bg-sunken ${
                  current ? "text-ink" : "text-ink-2 hover:text-ink"
                }`}
              >
                {labels[item.key]}
                {current ? <span className="absolute inset-x-3 -bottom-[9px] h-0.5 rounded-full bg-ink" aria-hidden="true" /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Phones: a bottom tab bar, thumb-reachable, 56px tall plus the home-indicator inset.
 * Labels come from nav.short (one word each) so they fit five across at 320px in French.
 */
export function TabBar({ locale, labels, navLabel }: Props) {
  const active = activeNav(usePathname() ?? "", locale);
  return (
    <nav aria-label={navLabel} className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="m-0 grid list-none grid-cols-5 p-0">
        {navItems.map((item) => {
          const current = active === item.key;
          return (
            <li key={item.key} className="min-w-0">
              <Link
                href={localeHref(locale, item.path)}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-center text-[length:var(--cn-text-caption)] leading-tight font-semibold ${
                  current ? "text-ink" : "text-ink-2"
                }`}
              >
                <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors duration-[var(--cn-duration-fast)] ${current ? "bg-sunken" : ""}`}>
                  <Icon name={item.icon} className="size-5" />
                </span>
                <span className="max-w-full whitespace-nowrap tracking-tight">{labels[item.key]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
