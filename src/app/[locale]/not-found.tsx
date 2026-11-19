/*
 * Screen: not found (a stale link, a moved question, a typo).
 * One message: this page isn't here, but everything else is. One action: go back to today's five.
 * The screen itself is NotFoundView. This file gives every 404 its own title, "Page not found · Cansensa" /
 * « Page introuvable · Cansensa », so it never shows the home title or the title of the page that 404'd.
 */
import type { Metadata } from "next";
import { NotFoundView } from "@/components/shell/not-found-view";
import { defaultLocale, isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";

/** Next.js hands the not-found file the [locale] segment's params. Anything unexpected falls back to the default locale. */
export async function generateMetadata(props: { params?: Promise<{ locale?: string }> }): Promise<Metadata> {
  const raw = (await props.params)?.locale;
  const locale = raw && isLocale(raw) ? raw : defaultLocale;
  return { title: getDictionary(locale).meta.notFoundTitle, robots: { index: false } };
}

export default function NotFound() {
  return <NotFoundView />;
}
