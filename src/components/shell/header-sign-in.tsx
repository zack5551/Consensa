"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import type { Locale } from "@/i18n/config";
import { headerSignInHref } from "@/lib/return-path";

type Props = { locale: Locale; label: string };

/** The header's sign-in button. From a question page or onboarding it carries `next`, so signing in comes back there. */
export function HeaderSignIn(props: Props) {
  // useSearchParams needs a Suspense boundary on static pages; the fallback already knows the path, just not the query.
  return (
    <Suspense fallback={<SignInLink {...props} next={null} />}>
      <WithNext {...props} />
    </Suspense>
  );
}

function WithNext(props: Props) {
  const next = useSearchParams()?.get("next") ?? null;
  return <SignInLink {...props} next={next} />;
}

function SignInLink({ locale, label, next }: Props & { next: string | null }) {
  const pathname = usePathname() ?? `/${locale}`;
  return (
    <Link
      href={headerSignInHref(locale, pathname, next)}
      className="ml-1 hidden whitespace-nowrap rounded-control bg-ink px-3 py-2 text-body-sm font-bold text-paper transition-opacity duration-[var(--cn-duration-fast)] hover:opacity-90 lg:inline-flex"
    >
      {label}
    </Link>
  );
}
