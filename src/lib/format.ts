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
  return formatDate(new Intl.DateTimeFormat(intlLocale[locale], parts), date, locale);
}

/**
 * Formats a date, with the French ordinal for the first of the month: « le 1er novembre 2026 », « 1er nov. »
 * (Intl writes « 1 novembre »). Every other day stays a cardinal number, as French writes it.
 */
function formatDate(format: Intl.DateTimeFormat, date: Date, locale: Locale): string {
  if (locale !== "fr") return format.format(date);
  return format
    .formatToParts(date)
    .map((part) => (part.type === "day" && part.value === "1" ? "1er" : part.value))
    .join("");
}

/**
 * The zone a date is read in (LEX, 2026-11-19). A timestamp ("2026-11-04T02:00:00Z") is a moment, so it shows the
 * Eastern calendar day: a game at 9 p.m. ET on Nov 3 closes on November 3, not November 4. A date-only string
 * ("2026-08-02") is already a calendar day, so it stays in UTC and never shifts back a day. Fixed zones keep the
 * server and the client in agreement.
 */
function dateZone(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? "UTC" : "America/Toronto";
}

/** "Dec. 9" / "9 déc." ("1er nov." on the first), on the Eastern calendar day for a timestamp (see dateZone). */
export function formatShortDate(iso: string, locale: Locale): string {
  return formatDate(new Intl.DateTimeFormat(intlLocale[locale], { month: "short", day: "numeric", timeZone: dateZone(iso) }), new Date(iso), locale);
}

/** "December 9, 2026" / "9 décembre 2026" ("1er novembre 2026" on the first), on the Eastern calendar day for a timestamp (see dateZone). */
export function formatLongDate(iso: string, locale: Locale): string {
  return formatDate(new Intl.DateTimeFormat(intlLocale[locale], { year: "numeric", month: "long", day: "numeric", timeZone: dateZone(iso) }), new Date(iso), locale);
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
  return formatDate(new Intl.DateTimeFormat(intlLocale[locale], { weekday: "long", month: "long", day: "numeric", timeZone }), new Date(iso), locale);
}
