/**
 * Where PULSE listens: six news scouts, each reading its own beat's public feeds in both languages, plus official
 * release feeds. A scout hands what it finds to its writing desk (`draft/desks.ts`), so a story from the sports feeds
 * reaches the sports writer even when its headline has no keyword the engine knows (most French headlines).
 *
 * The CBC and Radio-Canada feeds come from each newsroom's published feed directory (cbc.ca/rss, ici.radio-canada.ca/rss,
 * checked 2026-11-25). `verified: false` means nobody has fetched the feed from production yet; the first live cycle
 * checks each one, and a feed that fails just adds nothing that run. No feed here receives user data: the engine only
 * reads public feeds (CLAUDE.md rule 7).
 *
 * Not here on purpose: sportsbooks, prediction markets, line aggregators and crypto exchanges (CLAUDE.md rule 8), and
 * crime, health, politics and world feeds, which can't carry questions the rules allow at launch.
 */
import type { Category } from "@/lib/question";
import { sourceSchema, type ScoutId, type Source } from "@/engine/types";

export interface Scout {
  id: ScoutId;
  name: string;
  /** The writing desk this scout reports to. */
  desk: string;
  /** The topic a story from this beat gets when its headline names none. Null: the desk decides. */
  category: Category | null;
}

export const SCOUTS: readonly Scout[] = [
  { id: "money", name: "Money and business scout", desk: "economy", category: "economy" },
  { id: "regions", name: "Canada and regions scout", desk: "regions", category: null },
  { id: "planet", name: "Weather, science and tech scout", desk: "weather", category: "science" },
  { id: "culture", name: "Culture and entertainment scout", desk: "culture", category: "culture" },
  { id: "sports", name: "Sports scout", desk: "sports", category: "sports" },
  // What Canadians are searching for. Only sources that are free and allowed: no scraping of X, Instagram, TikTok or
  // Facebook. YouTube (needs a free API key) and Reddit (needs their approval) can join later. Searches are counted
  // in aggregate by Google; nothing about any person is read or kept.
  { id: "social", name: "Social trends scout", desk: "culture", category: null },
];

const cbc = (id: string, name: string, path: string, scout: ScoutId, weight = 1): Source => ({
  id: `cbc-${id}`,
  name: `CBC News · ${name}`,
  kind: "news",
  lang: "en",
  url: `https://www.cbc.ca/webfeed/rss/rss-${path}`,
  format: "rss",
  weight,
  verified: false,
  scout,
});
const rc = (id: string, name: string, path: string, scout: ScoutId, weight = 1): Source => ({
  id: `rc-${id}`,
  name: `Radio-Canada · ${name}`,
  kind: "news",
  lang: "fr",
  url: `https://ici.radio-canada.ca/info/rss/${path}`,
  format: "rss",
  weight,
  verified: false,
  scout,
});
/** Regional newsrooms weigh less: one local story shouldn't outrank a national one. */
const LOCAL = 0.7;

const raw: Source[] = [
  // ── Money and business scout ──
  cbc("business", "Business", "business", "money"),
  rc("economie", "Économie", "info/economie/en-continu", "money"),
  { id: "statcan-daily-en", name: "Statistics Canada · The Daily", kind: "official", lang: "en", url: "https://www150.statcan.gc.ca/n1/rss/dai-quo/0-eng.atom", format: "atom", weight: 2, verified: false, scout: "money" },
  { id: "statcan-daily-fr", name: "Statistique Canada · Le Quotidien", kind: "official", lang: "fr", url: "https://www150.statcan.gc.ca/n1/rss/dai-quo/0-fra.atom", format: "atom", weight: 2, verified: false, scout: "money" },
  { id: "boc-press", name: "Bank of Canada · Press releases", kind: "official", lang: "en", url: "https://www.bankofcanada.ca/content_type/press-releases/feed/", format: "rss", weight: 2, verified: false, scout: "money" },

  // ── Canada and regions scout: national desks, every province and the North ──
  cbc("canada", "Canada", "canada", "regions"),
  rc("grands-titres", "Grands titres", "info", "regions"),
  rc("dernieres-nouvelles", "Dernières nouvelles", "dernieres-nouvelles", "regions"),
  // The Globe and Mail (zack, 2026-11-25: match the depth of CBC and the Globe). Headlines are topic signals only:
  // PULSE writes its own questions and settles them on official sources, never on the Globe's articles.
  { id: "globe-business", name: "The Globe and Mail · Business", kind: "news", lang: "en", url: "https://www.theglobeandmail.com/arc/outboundfeeds/rss/category/business/", format: "rss", weight: 1, verified: true, scout: "money" },
  { id: "globe-canada", name: "The Globe and Mail · Canada", kind: "news", lang: "en", url: "https://www.theglobeandmail.com/arc/outboundfeeds/rss/category/canada/", format: "rss", weight: 0.9, verified: false, scout: "regions" },
  { id: "globe-arts", name: "The Globe and Mail · Arts", kind: "news", lang: "en", url: "https://www.theglobeandmail.com/arc/outboundfeeds/rss/category/arts/", format: "rss", weight: 0.9, verified: false, scout: "culture" },
  { id: "globe-sports", name: "The Globe and Mail · Sports", kind: "news", lang: "en", url: "https://www.theglobeandmail.com/arc/outboundfeeds/rss/category/sports/", format: "rss", weight: 0.9, verified: false, scout: "sports" },
  { id: "global-canada", name: "Global News · Canada", kind: "news", lang: "en", url: "https://globalnews.ca/canada/feed/", format: "rss", weight: 0.8, verified: false, scout: "regions" },
  cbc("bc", "British Columbia", "canada-britishcolumbia", "regions", LOCAL),
  cbc("calgary", "Calgary", "canada-calgary", "regions", LOCAL),
  cbc("edmonton", "Edmonton", "canada-edmonton", "regions", LOCAL),
  cbc("saskatchewan", "Saskatchewan", "canada-saskatchewan", "regions", LOCAL),
  cbc("manitoba", "Manitoba", "canada-manitoba", "regions", LOCAL),
  cbc("toronto", "Toronto", "canada-toronto", "regions", LOCAL),
  cbc("ottawa", "Ottawa", "canada-ottawa", "regions", LOCAL),
  cbc("montreal", "Montreal", "canada-montreal", "regions", LOCAL),
  cbc("new-brunswick", "New Brunswick", "canada-newbrunswick", "regions", LOCAL),
  cbc("nova-scotia", "Nova Scotia", "canada-novascotia", "regions", LOCAL),
  cbc("pei", "P.E.I.", "canada-pei", "regions", LOCAL),
  cbc("newfoundland", "Newfoundland and Labrador", "canada-newfoundland", "regions", LOCAL),
  cbc("north", "North", "canada-north", "regions", LOCAL),
  rc("quebec", "Québec", "regions/quebec/en-continu", "regions", LOCAL),
  rc("montreal", "Grand Montréal", "regions/montreal-environs/en-continu", "regions", LOCAL),
  rc("ottawa-gatineau", "Ottawa-Gatineau", "regions/ottawa-gatineau/en-continu", "regions", LOCAL),
  rc("toronto", "Toronto", "regions/toronto/en-continu", "regions", LOCAL),
  rc("manitoba", "Manitoba", "regions/manitoba/en-continu", "regions", LOCAL),
  rc("alberta", "Alberta", "regions/alberta/en-continu", "regions", LOCAL),
  rc("colombie-britannique", "Colombie-Britannique", "regions/colombie-britannique/en-continu", "regions", LOCAL),
  rc("acadie", "Nouveau-Brunswick", "regions/nouveau-brunswick/en-continu", "regions", LOCAL),

  // ── Weather, science and tech scout ──
  { id: "eccc-news", name: "Environment and Climate Change Canada · News", kind: "official", lang: "en", url: "https://api.io.canada.ca/io-server/gc/news/en/v2?dept=environmentandclimatechangecanada&sort=publishedDate&orderBy=desc&format=atom", format: "atom", weight: 1.5, verified: false, scout: "planet" },
  cbc("technology", "Technology and science", "technology", "planet"),
  rc("environnement", "Environnement", "info/environnement/en-continu", "planet"),
  rc("science", "Science", "info/science/en-continu", "planet"),
  rc("techno", "Techno", "info/techno/en-continu", "planet"),

  // ── Culture and entertainment scout ──
  cbc("arts", "Arts", "arts", "culture"),
  rc("culture", "Culture", "culture/en-continu", "culture"),
  rc("cinema", "Cinéma", "culture/cinema", "culture"),
  rc("musique", "Musique", "culture/musique", "culture"),
  rc("tele", "Télé", "culture/tele/en-continu", "culture"),
  rc("livres", "Littérature", "culture/litterature", "culture"),

  // ── Sports scout ──
  cbc("sports", "Sports", "sports", "sports"),
  cbc("nhl", "NHL", "sports-nhl", "sports"),
  cbc("cfl", "CFL", "sports-cfl", "sports"),
  cbc("soccer", "Soccer", "sports-soccer", "sports"),
  cbc("curling", "Curling", "sports-curling", "sports"),
  rc("sports", "Sports", "sports/en-continu", "sports"),
  rc("hockey", "Hockey", "sports/hockey", "sports"),

  // ── Social trends scout ──
  { id: "google-trends-ca", name: "Google Trends · Canada", kind: "trend", lang: "en", url: "https://trends.google.com/trending/rss?geo=CA", format: "rss", weight: 0.6, verified: false, scout: "social" },
];

export const sources: readonly Source[] = raw.map((s) => sourceSchema.parse(s));

export function scoutOf(sourceId: string): Scout | undefined {
  const id = sources.find((s) => s.id === sourceId)?.scout;
  return SCOUTS.find((sc) => sc.id === id);
}

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
  "gillerprize.ca",
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
  // Pop culture and world sports (zack, 2026-11-25: "a Canadian consensus that tackles everything"). Each is the
  // award body's, chart's, league's or event's own site, so the answer is on the record.
  "billboard.com",
  // Public company filings in Canada (SEDAR+): a company's own reported figures settle business questions.
  "sedarplus.ca",
  "grammy.com",
  "oscars.org",
  "emmys.com",
  "goldenglobes.com",
  "tiff.net",
  "festival-cannes.com",
  "eurovision.tv",
  "thegameawards.com",
  "top10.netflix.com",
  "charts.spotify.com",
  "olympics.com",
  "fifa.com",
  "canadasoccer.com",
  "mlssoccer.com",
  "canpl.ca",
  "nba.com",
  "mlb.com",
  "thepwhl.com",
  "atptour.com",
  "wtatennis.com",
  "formula1.com",
  "hydroquebec.com",
  "ttc.ca",
  "metrolinx.com",
  "translink.ca",
  "stm.info",
  "rem.info",
  // Provinces, territories and the biggest cities: their own data settles regional questions.
  "gov.bc.ca",
  "alberta.ca",
  "saskatchewan.ca",
  "gov.mb.ca",
  "ontario.ca",
  "quebec.ca",
  "gnb.ca",
  "novascotia.ca",
  "princeedwardisland.ca",
  "gov.nl.ca",
  "yukon.ca",
  "gov.nt.ca",
  "gov.nu.ca",
  "toronto.ca",
  "montreal.ca",
  "ville.quebec.qc.ca",
  "ottawa.ca",
  "vancouver.ca",
  "calgary.ca",
  "edmonton.ca",
  "winnipeg.ca",
  "halifax.ca",
  "octranspo.com",
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
