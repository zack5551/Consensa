/**
 * The events scout (zack, 2026-11-25: "the big event which i like"). Big dates Canadians follow, so the engine writes
 * a few questions about each one in the days before it, and the board can group them ("World Juniors: 3 questions").
 *
 * Each event also catches the news about it: a story whose headlines name the event (World Juniors, Golden Globes)
 * is tagged with it, so news questions join the same group.
 *
 * No junior or amateur events, with one exception LEX approved on 2026-11-28 at zack's request: the IIHF World Junior
 * Championship, team and tournament questions only, never about a player (sports-questions-rules.md).
 *
 * Dates were checked on 2026-11-25 against the organiser or two outlets (sources in each entry). Add an event only
 * with a confirmed date. Reading these costs nothing; only the writer calls they lead to count against the caps.
 */
import { createHash } from "node:crypto";
import type { Desk } from "@/engine/draft/desks";
import type { Bilingual, Signal, Story } from "@/engine/types";

export interface BigEvent {
  id: string;
  name: Bilingual;
  /** When it starts (UTC). */
  at: string;
  /** When a multi-day event ends (UTC). Leave out for a one-night event. */
  endsAt?: string;
  /** The desk that writes about it. */
  desk: string;
  /** Where the event itself is announced or settled. */
  url: string;
  /** Lower-case words that mark a headline as being about this event. */
  keywords: readonly string[];
  /** Days before `at` that the engine starts writing about it. */
  leadDays: number;
}

export const BIG_EVENTS: readonly BigEvent[] = [
  {
    // bankofcanada.ca schedule; the site's own hand-written questions close on it.
    id: "boc-decision-2026-12-09",
    name: { en: "Bank of Canada rate decision, Dec. 9", fr: "Décision de la Banque du Canada sur les taux, 9 décembre" },
    at: "2026-12-09T14:45:00Z",
    desk: "economy",
    url: "https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/",
    keywords: ["bank of canada", "banque du canada", "taux directeur", "policy rate", "rate decision"],
    leadDays: 10,
  },
  {
    // IIHF World Junior Championship in Edmonton and Red Deer, Dec. 26, 2026 to Jan. 5, 2027 (Hockey Canada's schedule
    // page, NHL.com and Wikipedia citing stats.iihf.com, checked 2026-11-28). The first game is the afternoon of Dec. 26
    // Mountain time; the gold medal game is the evening of Jan. 5. LEX's limits: team and tournament only, no players.
    id: "world-juniors-2027",
    name: { en: "World Juniors (IIHF World Junior Championship)", fr: "Championnat mondial de hockey junior de l’IIHF" },
    at: "2026-12-26T20:00:00Z",
    endsAt: "2027-01-06T05:00:00Z",
    desk: "sports",
    url: "https://www.iihf.com/",
    keywords: ["world junior", "world juniors", "mondial junior", "championnat mondial junior", "iihf u20"],
    leadDays: 21,
  },
  {
    // Variety's 2026–27 awards calendar and CBS: Sunday, Jan. 10, 2027, 8 p.m. ET.
    id: "golden-globes-2027",
    name: { en: "Golden Globes", fr: "Golden Globes" },
    at: "2027-01-11T01:00:00Z",
    desk: "culture",
    url: "https://goldenglobes.com/",
    keywords: ["golden globe", "golden globes", "globes d'or"],
    leadDays: 10,
  },
  {
    // The site's hand-written question closes on it (bankofcanada.ca 2027 schedule).
    id: "boc-decision-2027-01-27",
    name: { en: "Bank of Canada rate decision, Jan. 27", fr: "Décision de la Banque du Canada sur les taux, 27 janvier" },
    at: "2027-01-27T14:45:00Z",
    desk: "economy",
    url: "https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/",
    keywords: ["bank of canada", "banque du canada", "taux directeur", "policy rate", "rate decision"],
    leadDays: 10,
  },
  {
    // grammy.com and USA Today: Sunday, Feb. 7, 2027, 7 p.m. ET, Los Angeles.
    id: "grammys-2027",
    name: { en: "Grammy Awards", fr: "Grammy Awards" },
    at: "2027-02-08T00:00:00Z",
    desk: "culture",
    url: "https://www.grammy.com/awards/69th-annual-grammy-awards-2027/",
    keywords: ["grammy", "grammys"],
    leadDays: 14,
  },
  {
    // Variety's awards calendar: Sunday, March 14, 2027 (daylight time starts that day, so 7 p.m. ET is 23:00 UTC).
    id: "oscars-2027",
    name: { en: "Academy Awards (Oscars)", fr: "Cérémonie des Oscars" },
    at: "2027-03-14T23:00:00Z",
    desk: "culture",
    url: "https://www.oscars.org/",
    keywords: ["oscar", "oscars", "academy award", "academy awards"],
    leadDays: 14,
  },
];

const DAY = 86_400_000;

/** Events whose writing window is open now: from `leadDays` before the start to the end (or the start). */
export function activeEvents(now: Date, events: readonly BigEvent[] = BIG_EVENTS): BigEvent[] {
  const t = now.getTime();
  return events.filter((e) => t >= Date.parse(e.at) - e.leadDays * DAY && t < Date.parse(e.endsAt ?? e.at));
}

/** The event a story is about, when its headlines name one whose window is open. */
export function eventFor(story: Pick<Story, "signals">, now: Date, events: readonly BigEvent[] = BIG_EVENTS): BigEvent | undefined {
  const text = story.signals.map((s) => s.title.toLowerCase()).join(" \n ");
  return activeEvents(now, events).find((e) => e.keywords.some((k) => text.includes(k)));
}

/**
 * One story per open event per Toronto day, so each event gets a question a day in its window (the dedup check stops
 * twins). Routed to the event's desk.
 */
export function eventStories(now: Date, desks: readonly Desk[], events: readonly BigEvent[] = BIG_EVENTS): Story[] {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(now);
  return activeEvents(now, events).flatMap((e) => {
    const desk = desks.find((d) => d.id === e.desk);
    if (!desk) return [];
    const signal: Signal = {
      id: `event-${e.id}-${day}`,
      sourceId: "events-calendar",
      kind: "calendar",
      lang: "en",
      title: `${e.name.en}: ${e.at.slice(0, 10)}`,
      summary: `${e.name.fr}. A big date Canadians follow${e.endsAt ? `, running until ${e.endsAt.slice(0, 10)}` : ""}; official page ${e.url}`,
      url: e.url,
      publishedAt: now.toISOString(),
      weight: 1,
    };
    return [
      {
        id: `event-${createHash("sha256").update(signal.id).digest("hex").slice(0, 12)}`,
        signals: [signal],
        headline: signal.title,
        langs: ["en", "fr"] as Array<"en" | "fr">,
        firstSeenAt: signal.publishedAt,
        lastSeenAt: signal.publishedAt,
        // Warm enough to be written before the plain release calendar, never ahead of breaking news.
        heat: 60,
        categoryHint: desk.categories[0] ?? null,
        event: { id: e.id, name: e.name, at: e.at },
      },
    ];
  });
}
