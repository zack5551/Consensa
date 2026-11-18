import { intlLocale, type Locale } from "@/i18n/config";

/** "38%" in English, "38 %" (non-breaking space) in French. Input is 0–100. */
export function formatPercent(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale], { style: "percent", maximumFractionDigits: 0 }).format(value / 100);
}

/** "18,420" in English, "18 420" in French. */
export function formatCount(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale]).format(value);
}

/**
 * Sports times in Eastern time, e.g. "Apr 16, 7:00 p.m." / "16 avr., 19 h" (the dictionary adds "ET" / "HE").
 * Fixed zone so server and client agree. French drops ":00" on the hour.
 */
export function formatEasternTime(iso: string, locale: Locale): string {
  const date = new Date(iso);
  const zone = "America/Toronto";
  const onTheHour = new Intl.DateTimeFormat("en-CA", { minute: "numeric", timeZone: zone }).format(date) === "0";
  const parts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", timeZone: zone };
  if (locale === "en" || !onTheHour) parts.minute = "2-digit";
  return new Intl.DateTimeFormat(intlLocale[locale], parts).format(date);
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

/**
 * "Monday, November 16" / "lundi 16 novembre". Defaults to UTC; pass "America/Toronto" for the reader's
 * calendar day, so the Today page doesn't flip to tomorrow at 7 p.m. Eastern.
 */
export function formatDayHeading(iso: string, locale: Locale, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat(intlLocale[locale], { weekday: "long", month: "long", day: "numeric", timeZone }).format(new Date(iso));
}
