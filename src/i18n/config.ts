export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/** BCP 47 tags used for Intl formatting. */
export const intlLocale: Record<Locale, string> = { en: "en-CA", fr: "fr-CA" };

/** Picks a locale from an Accept-Language header. French wins only when it is preferred. */
export function negotiateLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return defaultLocale;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag = "", q] = part.trim().split(";q=");
      return { lang: tag.toLowerCase().slice(0, 2), q: q ? Number(q) : 1 };
    })
    .filter((x) => !Number.isNaN(x.q))
    .sort((a, b) => b.q - a.q);
  const hit = ranked.find((x) => isLocale(x.lang));
  return hit && isLocale(hit.lang) ? hit.lang : defaultLocale;
}
