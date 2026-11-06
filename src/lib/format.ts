import { intlLocale, type Locale } from "@/i18n/config";

/** "38%" in English, "38 %" (non-breaking space) in French. Input is 0–100. */
export function formatPercent(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale], { style: "percent", maximumFractionDigits: 0 }).format(value / 100);
}

/** "18,420" in English, "18 420" in French. */
export function formatCount(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale]).format(value);
}

/** "Dec. 9" / "9 déc." (UTC so server and client agree). */
export function formatShortDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale[locale], { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

export function formatLongDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale[locale], { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

/** "0.142" / "0,142": Brier scores always show three decimals. */
export function formatBrier(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale], { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value);
}
