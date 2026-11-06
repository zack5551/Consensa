/**
 * SAMPLE FEEDS. Invented headlines in the shape of real RSS and Atom feeds, for tests, local runs and the preview
 * until the engine fetches live feeds. None of these are real news reports. Times sit in the day before
 * `SAMPLE_NOW` (2026-11-06T12:00:00Z) so every run is deterministic.
 *
 * The mix is deliberate: stories the engine should draft (rates, jobs, snow), stories it should decline (no
 * official source), and a story it must block before drafting (a fatal crash).
 */
import { getSource } from "@/engine/sources/registry";
import { parseFeed, type FeedResult } from "@/engine/sources/feed";

function rss(items: Array<{ title: string; description: string; link: string; at: string }>): string {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Sample</title>${items
    .map((i) => `<item><title><![CDATA[${i.title}]]></title><description><![CDATA[${i.description}]]></description><link>${i.link}</link><pubDate>${new Date(i.at).toUTCString()}</pubDate></item>`)
    .join("")}</channel></rss>`;
}

function atom(entries: Array<{ title: string; summary: string; link: string; at: string }>): string {
  return `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Sample</title>${entries
    .map((e) => `<entry><title>${e.title}</title><summary>${e.summary}</summary><link rel="alternate" href="${e.link}"/><published>${e.at}</published></entry>`)
    .join("")}</feed>`;
}

export const sampleFeedXml: Record<string, string> = {
  "cbc-business": rss([
    { title: "Economists split on whether Bank of Canada will cut rate again in December", description: "Sample: a softer inflation reading has forecasters revisiting the Bank of Canada's next move.", link: "https://www.cbc.ca/news/business/sample-boc-december", at: "2026-11-06T09:10:00Z" },
    { title: "Canada's unemployment rate edges up as hiring slows", description: "Sample: Statistics Canada's Labour Force Survey shows the jobless rate rising.", link: "https://www.cbc.ca/news/business/sample-jobs-october", at: "2026-11-06T08:40:00Z" },
  ]),
  "cbc-canada": rss([
    { title: "Toronto braces for first big snowfall of the season", description: "Sample: Environment Canada says 10 to 15 cm could fall across the GTA this weekend.", link: "https://www.cbc.ca/news/canada/toronto/sample-snow", at: "2026-11-06T07:30:00Z" },
    { title: "Two killed in highway crash near Kingston, police say", description: "Sample: a collision on Highway 401 closed eastbound lanes overnight.", link: "https://www.cbc.ca/news/canada/sample-crash", at: "2026-11-06T06:00:00Z" },
    { title: "Kingston crash: two killed as Highway 401 reopens", description: "Sample: police continue to investigate.", link: "https://www.cbc.ca/news/canada/sample-crash-2", at: "2026-11-06T09:00:00Z" },
  ]),
  "rc-economie": rss([
    { title: "La Banque du Canada pourrait baisser son taux directeur en décembre", description: "Exemple : les économistes sont divisés sur la prochaine décision de la Banque du Canada.", link: "https://ici.radio-canada.ca/nouvelle/exemple-taux", at: "2026-11-06T10:05:00Z" },
    { title: "Le taux de chômage grimpe au Canada", description: "Exemple : l’Enquête sur la population active montre une hausse du chômage.", link: "https://ici.radio-canada.ca/nouvelle/exemple-chomage", at: "2026-11-06T09:20:00Z" },
  ]),
  "rc-grands-titres": rss([
    { title: "Tempête de neige : Toronto et l’Est ontarien sous avertissement", description: "Exemple : jusqu’à 15 cm de neige attendus.", link: "https://ici.radio-canada.ca/nouvelle/exemple-neige", at: "2026-11-06T08:00:00Z" },
  ]),
  "statcan-daily-en": atom([
    { title: "Labour Force Survey, October 2026", summary: "Sample release: employment was little changed and the unemployment rate rose.", link: "https://www150.statcan.gc.ca/n1/daily-quotidien/261106/dq261106a-eng.htm", at: "2026-11-06T08:30:00Z" },
  ]),
  "global-canada": rss([
    { title: "Snowfall warning: Toronto could see 15 cm this weekend", description: "Sample: the first significant snow of the season is on the way for the GTA.", link: "https://globalnews.ca/news/sample-snow-warning/", at: "2026-11-06T10:30:00Z" },
  ]),
  "google-trends-ca": rss([
    { title: "celebrity cooking show finale", description: "Sample trending search.", link: "https://trends.google.com/trending?geo=CA&sample=1", at: "2026-11-06T05:00:00Z" },
  ]),
};

/** The sample feeds as `fetchFeeds` would return them. */
export function sampleFeedResults(): FeedResult[] {
  return Object.entries(sampleFeedXml).map(([id, xml]) => {
    const source = getSource(id);
    if (!source) throw new Error(`Unknown sample source ${id}`);
    return { sourceId: id, ...parseFeed(xml, source) };
  });
}
