/**
 * Dated official releases the engine can build checkable questions around. A news story says what Canada is
 * talking about; the calendar says when an official source will settle it.
 *
 * SAMPLE DATA until the live calendar sync lands: dates follow each publisher's usual pattern (Bank of Canada's
 * published schedule, the Labour Force Survey on the first Friday of the month) and must be checked against
 * bankofcanada.ca and statcan.gc.ca before a question built on them is approved. `verified` records that check.
 */
import { z } from "zod";
import { bilingual } from "@/engine/types";

export const releaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  topic: z.enum(["boc-rate", "lfs-unemployment", "cpi", "climate-month"]),
  name: bilingual,
  /** When the source publishes (UTC). */
  at: z.iso.datetime(),
  /** Reference period the release covers, when there is one (YYYY-MM). */
  refPeriod: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  sourceUrl: z.url(),
  verified: z.boolean(),
});
export type Release = z.infer<typeof releaseSchema>;

const raw: Release[] = [
  {
    id: "boc-2026-12-09",
    topic: "boc-rate",
    name: { en: "Bank of Canada rate announcement", fr: "Annonce du taux de la Banque du Canada" },
    at: "2026-12-09T14:45:00Z",
    sourceUrl: "https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/",
    verified: false,
  },
  {
    id: "lfs-2026-11",
    topic: "lfs-unemployment",
    name: { en: "Labour Force Survey, November 2026", fr: "Enquête sur la population active, novembre 2026" },
    at: "2026-12-04T13:30:00Z",
    refPeriod: "2026-11",
    sourceUrl: "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1410028701",
    verified: false,
  },
  {
    id: "lfs-2026-12",
    topic: "lfs-unemployment",
    name: { en: "Labour Force Survey, December 2026", fr: "Enquête sur la population active, décembre 2026" },
    at: "2027-01-08T13:30:00Z",
    refPeriod: "2026-12",
    sourceUrl: "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1410028701",
    verified: false,
  },
  {
    id: "climate-2026-12",
    topic: "climate-month",
    name: { en: "ECCC daily climate data, December 2026", fr: "Données climatiques quotidiennes d’ECCC, décembre 2026" },
    at: "2027-01-02T17:00:00Z",
    refPeriod: "2026-12",
    sourceUrl: "https://climate.weather.gc.ca/",
    verified: false,
  },
];

export const releases: readonly Release[] = raw.map((r) => releaseSchema.parse(r));

/** Releases from now until `horizonDays` out, soonest first. */
export function upcoming(now: Date, horizonDays = 120, list: readonly Release[] = releases): Release[] {
  const end = now.getTime() + horizonDays * 86_400_000;
  return list
    .filter((r) => Date.parse(r.at) > now.getTime() && Date.parse(r.at) <= end)
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** Statistics Canada vectors the engine knows how to read. Check each id against WDS before relying on it. */
export const KNOWN_VECTORS = {
  /** Unemployment rate, Canada, 15 years and over, seasonally adjusted (table 14-10-0287-01). */
  unemploymentRate: 2062815,
} as const;

/** ECCC climate stations the engine knows by name. */
export const KNOWN_STATIONS = {
  torontoPearson: { climateId: "6158731", name: { en: "Toronto Pearson (YYZ)", fr: "Pearson de Toronto (YYZ)" } },
  montrealTrudeau: { climateId: "702S006", name: { en: "Montréal-Trudeau (YUL)", fr: "Montréal-Trudeau (YUL)" } },
  ottawaAirport: { climateId: "6106001", name: { en: "Ottawa airport (YOW)", fr: "Aéroport d’Ottawa (YOW)" } },
} as const;
