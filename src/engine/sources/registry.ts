/**
 * Where PULSE listens. Canadian newsrooms in both languages, official release feeds, and what Canada is searching.
 *
 * `verified: false` means the URL comes from the publisher's feed directory but nobody has fetched it from
 * production yet; the first live cycle checks each one and logs any that fail to parse. No feed here receives user
 * data: the engine only reads public feeds (CLAUDE.md rule 7).
 *
 * Not here on purpose: sportsbooks, prediction markets, line aggregators and crypto exchanges (CLAUDE.md rule 8).
 */
import { sourceSchema, type Source } from "@/engine/types";

const raw: Source[] = [
  // Newsrooms
  { id: "cbc-canada", name: "CBC News · Canada", kind: "news", lang: "en", url: "https://www.cbc.ca/webfeed/rss/rss-canada", format: "rss", weight: 1, verified: false },
  { id: "cbc-business", name: "CBC News · Business", kind: "news", lang: "en", url: "https://www.cbc.ca/webfeed/rss/rss-business", format: "rss", weight: 1, verified: false },
  { id: "cbc-arts", name: "CBC News · Arts", kind: "news", lang: "en", url: "https://www.cbc.ca/webfeed/rss/rss-arts", format: "rss", weight: 1, verified: false },
  { id: "rc-grands-titres", name: "Radio-Canada · Grands titres", kind: "news", lang: "fr", url: "https://ici.radio-canada.ca/rss/4159", format: "rss", weight: 1, verified: false },
  { id: "rc-economie", name: "Radio-Canada · Économie", kind: "news", lang: "fr", url: "https://ici.radio-canada.ca/rss/5717", format: "rss", weight: 1, verified: false },
  { id: "global-canada", name: "Global News · Canada", kind: "news", lang: "en", url: "https://globalnews.ca/canada/feed/", format: "rss", weight: 0.8, verified: false },

  // Official releases (these weigh more: they come with a source that can settle a question)
  { id: "statcan-daily-en", name: "Statistics Canada · The Daily", kind: "official", lang: "en", url: "https://www150.statcan.gc.ca/n1/rss/dai-quo/0-eng.atom", format: "atom", weight: 2, verified: false },
  { id: "statcan-daily-fr", name: "Statistique Canada · Le Quotidien", kind: "official", lang: "fr", url: "https://www150.statcan.gc.ca/n1/rss/dai-quo/0-fra.atom", format: "atom", weight: 2, verified: false },
  { id: "boc-press", name: "Bank of Canada · Press releases", kind: "official", lang: "en", url: "https://www.bankofcanada.ca/content_type/press-releases/feed/", format: "rss", weight: 2, verified: false },
  { id: "eccc-news", name: "Environment and Climate Change Canada · News", kind: "official", lang: "en", url: "https://api.io.canada.ca/io-server/gc/news/en/v2?dept=environmentandclimatechangecanada&sort=publishedDate&orderBy=desc&format=atom", format: "atom", weight: 1.5, verified: false },

  // Trends
  { id: "google-trends-ca", name: "Google Trends · Canada", kind: "trend", lang: "en", url: "https://trends.google.com/trending/rss?geo=CA", format: "rss", weight: 0.6, verified: false },
];

export const sources: readonly Source[] = raw.map((s) => sourceSchema.parse(s));

export function getSource(id: string): Source | undefined {
  return sources.find((s) => s.id === id);
}

/**
 * Domains a question may cite as its resolution source. A draft citing anything else is blocked: a newsroom can
 * start a story, but only an official or primary source settles it.
 */
export const resolutionDomains: readonly string[] = [
  "bankofcanada.ca",
  "statcan.gc.ca",
  "weather.gc.ca",
  "canada.ca",
  "gc.ca",
  "crea.ca",
  "cmhc-schl.gc.ca",
  "elections.ca",
  "scotiabankgillerprize.ca",
  "junoawards.ca",
  "polarismusicprize.ca",
  "academy.ca",
  "nhl.com",
  "cfl.ca",
  "asc-csa.gc.ca",
  "nasa.gov",
  "nobelprize.org",
  "imdb.com",
  "boxofficemojo.com",
  "olympic.ca",
  "hydroquebec.com",
  "ttc.ca",
  "metrolinx.com",
  "translink.ca",
  "stm.info",
  "rem.info",
];

export function isResolutionDomain(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return resolutionDomains.some((d) => host === d || host.endsWith(`.${d}`));
}
