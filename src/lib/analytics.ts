/**
 * Product analytics events (ATLAS's investor metrics sheet). Typed here so every screen sends the same shapes.
 *
 * Nothing leaves the browser yet. Sending starts in M5, only when all of these are true (CLAUDE.md rule 7, LEX):
 * - the self-hosted PostHog in ca-central-1 (Montreal) is configured (NEXT_PUBLIC_ANALYTICS_HOST),
 * - the person has given analytics consent at signup,
 * - session replay stays off.
 * Events never carry names, emails, free text or exact location. Province is the finest place we keep.
 *
 * What the metrics need:
 * - Day-7 retention and DAU/MAU: `app_opened` (one per day per device, with `daysSinceFirstOpen`).
 * - Free growth vs paid: `app_opened.source` ("direct", "search", "social", "share", "embed", "ad", "other").
 * - Activation funnel (open → call → return): `question_viewed` → `call_made` → `app_opened` on a later day.
 * - Ad revenue per user: `ad_viewed` / `ad_clicked` per slot (M5 ad slots), joined with active users.
 */
import { z } from "zod";

export const acquisitionSources = ["direct", "search", "social", "share", "embed", "ad", "other"] as const;
export type AcquisitionSource = (typeof acquisitionSources)[number];

const locale = z.enum(["en", "fr"]);
const screen = z.enum(["today", "question", "board", "record", "design", "methodology", "resolutions", "leaderboard", "provinces", "region", "forecaster"]);

export const eventSchemas = {
  app_opened: z.object({ locale, screen, source: z.enum(acquisitionSources), daysSinceFirstOpen: z.number().int().nonnegative() }),
  screen_viewed: z.object({ locale, screen }),
  question_viewed: z.object({ locale, slug: z.string(), state: z.string(), from: z.enum(["today", "board", "direct", "share"]) }),
  call_made: z.object({ locale, slug: z.string(), value: z.number().int().min(1).max(99), gapToCrowd: z.number().int(), scored: z.boolean(), changed: z.boolean() }),
  today_completed: z.object({ locale, calls: z.number().int().nonnegative() }),
  board_filtered: z.object({ locale, filter: z.string(), topic: z.string() }),
  leaderboard_viewed: z.object({ locale, tab: z.enum(["province", "canada", "friends"]) }),
  ad_viewed: z.object({ locale, slot: z.string(), screen }),
  ad_clicked: z.object({ locale, slot: z.string(), screen }),
} as const;

export type EventName = keyof typeof eventSchemas;
export type EventProps<E extends EventName> = z.infer<(typeof eventSchemas)[E]>;
export type TrackedEvent = { [E in EventName]: { name: E; props: EventProps<E>; at: string } }[EventName];

type Transport = (event: TrackedEvent) => void;

/** Until M5 there's no transport: events are validated and kept in a short in-memory buffer for tests and debugging. */
let transport: Transport | null = null;
const buffer: TrackedEvent[] = [];
const BUFFER_SIZE = 50;

export function setAnalyticsTransport(next: Transport | null): void {
  transport = next;
}

export function track<E extends EventName>(name: E, props: EventProps<E>): void {
  const parsed = eventSchemas[name].safeParse(props);
  if (!parsed.success) {
    if (process.env.NODE_ENV !== "production") console.warn(`analytics: bad "${name}" event`, parsed.error.issues);
    return;
  }
  const event = { name, props: parsed.data, at: new Date().toISOString() } as TrackedEvent;
  buffer.push(event);
  if (buffer.length > BUFFER_SIZE) buffer.shift();
  transport?.(event);
}

export function recentEvents(): readonly TrackedEvent[] {
  return buffer;
}

/** Buckets a referrer into a source without keeping the URL itself. */
export function sourceFromReferrer(referrer: string, utmSource: string | null): AcquisitionSource {
  const utm = utmSource?.toLowerCase() ?? "";
  if (utm === "share") return "share";
  if (utm === "embed") return "embed";
  if (utm.startsWith("ad") || utm === "cpc" || utm === "paid") return "ad";
  if (!referrer) return "direct";
  let host = "";
  try {
    host = new URL(referrer).hostname.replace(/^www\./, "");
  } catch {
    return "other";
  }
  if (/(^|\.)(google|bing|duckduckgo|yahoo|ecosia|qwant)\./.test(host)) return "search";
  if (/(^|\.)(facebook|instagram|threads|x|twitter|t|reddit|linkedin|tiktok|bsky|youtube)\.(com|net|co|app|me)$/.test(host)) return "social";
  return "other";
}
