import type { Locale } from "@/i18n/config";

type Languages = { "en-CA": string; "fr-CA": string; "x-default": string };

/**
 * Canonical and hreflang links for one public page. `path` is the page's path after the locale
 * ("" for the locale root, "/q/some-slug" otherwise). x-default points at English.
 * Pass `base` for absolute URLs (the sitemap); leave it out for paths that metadataBase resolves.
 */
export function pageAlternates(locale: Locale, path: string, base = ""): { canonical: string; languages: Languages } {
  return {
    canonical: `${base}/${locale}${path}`,
    languages: { "en-CA": `${base}/en${path}`, "fr-CA": `${base}/fr${path}`, "x-default": `${base}/en${path}` },
  };
}
