"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import type { Locale } from "@/i18n/config";
import { headerLocaleHref } from "@/lib/return-path";

type Props = { locale: Locale; label: string; switchTo: string };

/**
 * Links to the same page in the other language and remembers the choice. On onboarding and sign-in it keeps `next`
 * (in the other language), so the question someone came from survives the switch.
 */
export function LocaleSwitch(props: Props) {
  // useSearchParams needs a Suspense boundary on static pages; until it resolves, the link is the plain other-language page.
  return (
    <Suspense fallback={<SwitchLink {...props} next={null} />}>
      <WithNext {...props} />
    </Suspense>
  );
}

function WithNext(props: Props) {
  const next = useSearchParams()?.get("next") ?? null;
  return <SwitchLink {...props} next={next} />;
}

function SwitchLink({ locale, label, switchTo, next }: Props & { next: string | null }) {
  const pathname = usePathname() ?? `/${locale}`;
  const other: Locale = locale === "en" ? "fr" : "en";
  return (
    <nav aria-label={label}>
      <Link
        href={headerLocaleHref(pathname, next, other)}
        hrefLang={other}
        lang={other}
        onClick={() => {
          document.cookie = `locale=${other}; path=/; max-age=31536000; samesite=lax`;
        }}
        className="rounded-full border border-line px-3 py-1 text-body-sm font-semibold text-ink transition-colors duration-[var(--cn-duration-fast)] hover:bg-sunken"
      >
        {switchTo}
      </Link>
    </nav>
  );
}
