import { intlLocale, type Locale } from "@/i18n/config";

/** A Brier score to three decimals: "0.131" / "0,131". */
export function formatBrier(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale], { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value);
}

/** Skill vs the crowd (a 0–1 ratio) as a whole percent, unsigned: "26%" / "26 %". */
export function formatSkill(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale], { style: "percent", maximumFractionDigits: 0 }).format(Math.abs(value));
}

/** Skill with its sign, for tables: "+26%", "−8%", "0%". Uses a true minus sign. */
export function formatSignedSkill(value: number, locale: Locale): string {
  const rounded = Math.round(value * 100) / 100;
  return new Intl.NumberFormat(intlLocale[locale], { style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero" })
    .format(rounded === 0 ? 0 : rounded)
    .replace("-", "−");
}

/** Whole points with a sign: "+9" / "−4". */
export function formatSignedPoints(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale], { maximumFractionDigits: 0, signDisplay: "exceptZero" }).format(Math.round(value)).replace("-", "−");
}

/** One decimal for averages like "2.4" / "2,4". */
export function formatOneDecimal(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale], { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

/** "Aug. 2026" / "août 2026". */
export function formatMonthYear(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale[locale], { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
}
