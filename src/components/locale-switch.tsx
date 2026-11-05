"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/i18n/config";

/** Links to the same page in the other language and remembers the choice. */
export function LocaleSwitch({ locale, label, switchTo }: { locale: Locale; label: string; switchTo: string }) {
  const pathname = usePathname() ?? `/${locale}`;
  const other: Locale = locale === "en" ? "fr" : "en";
  const href = pathname.replace(/^\/(en|fr)(?=\/|$)/, `/${other}`);
  return (
    <nav aria-label={label}>
      <Link
        href={href}
        hrefLang={other}
        lang={other}
        onClick={() => {
          document.cookie = `locale=${other}; path=/; max-age=31536000; samesite=lax`;
        }}
        className="rounded-pill border border-line px-3 py-1 text-2 font-semibold text-ink transition-colors duration-[var(--duration-fast)] hover:bg-surface-2"
      >
        {switchTo}
      </Link>
    </nav>
  );
}
