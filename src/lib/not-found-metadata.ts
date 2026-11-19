import type { Metadata } from "next";
import { defaultLocale, isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";

/**
 * The metadata for any page that answers 404: "Page not found · Cansensa" / « Page introuvable · Cansensa », not indexed.
 * The not-found file sets it for the server-rendered head, but Next.js also sends the page's own metadata to the browser,
 * so a page whose params lead to notFound() returns this from generateMetadata instead of claiming a title of its own.
 */
export function notFoundMetadata(locale: string | undefined): Metadata {
  const l = locale && isLocale(locale) ? locale : defaultLocale;
  return { title: getDictionary(l).meta.notFoundTitle, robots: { index: false } };
}
