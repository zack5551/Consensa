/**
 * RSS 2.0 and Atom → signals. Feeds are untrusted input: every item is validated, HTML is stripped, and an item
 * that doesn't parse is dropped rather than guessed at.
 */
import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { signalSchema, type Signal, type Source } from "@/engine/types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  processEntities: true,
  htmlEntities: true,
  // Never expand external entities or DOCTYPE tricks.
  allowBooleanAttributes: false,
});

/** Feeds can be huge or hostile. Anything past this is ignored. */
export const MAX_FEED_BYTES = 2_000_000;
export const MAX_ITEMS_PER_FEED = 100;

function text(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    if ("#text" in o) return text(o["#text"]);
    if ("@href" in o) return text(o["@href"]);
  }
  return "";
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asArray<T>(v: T | T[] | undefined): T[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

function atomLink(links: unknown): string {
  const all = asArray(links as Record<string, unknown> | Array<Record<string, unknown>>);
  const alternate = all.find((l) => typeof l === "object" && l !== null && (l["@rel"] === undefined || l["@rel"] === "alternate"));
  return text(alternate ?? all[0]);
}

function toIso(date: string): string | null {
  const ms = Date.parse(date);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

export function signalId(sourceId: string, url: string, title: string): string {
  return createHash("sha256").update(`${sourceId}\n${url}\n${title}`).digest("hex").slice(0, 16);
}

interface RawItem {
  title: string;
  summary: string;
  url: string;
  publishedAt: string | null;
}

function rawItems(xml: string): RawItem[] {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const rss = doc.rss as { channel?: { item?: unknown } } | undefined;
  if (rss?.channel) {
    return asArray(rss.channel.item as Record<string, unknown> | Array<Record<string, unknown>>).map((i) => ({
      title: stripHtml(text(i.title)),
      summary: stripHtml(text(i.description)),
      url: text(i.link) || text(i.guid),
      publishedAt: toIso(text(i.pubDate) || text(i["dc:date"])),
    }));
  }
  const feed = doc.feed as { entry?: unknown } | undefined;
  if (feed) {
    return asArray(feed.entry as Record<string, unknown> | Array<Record<string, unknown>>).map((e) => ({
      title: stripHtml(text(e.title)),
      summary: stripHtml(text(e.summary) || text(e.content)),
      url: atomLink(e.link),
      publishedAt: toIso(text(e.published) || text(e.updated)),
    }));
  }
  return [];
}

/** Parses one feed body. Returns valid signals and a count of the items it had to drop. */
export function parseFeed(xml: string, source: Source): { signals: Signal[]; dropped: number } {
  if (xml.length > MAX_FEED_BYTES) xml = xml.slice(0, MAX_FEED_BYTES);
  let items: RawItem[];
  try {
    items = rawItems(xml).slice(0, MAX_ITEMS_PER_FEED);
  } catch {
    return { signals: [], dropped: 1 };
  }
  const signals: Signal[] = [];
  let dropped = 0;
  for (const item of items) {
    const parsed = signalSchema.safeParse({
      id: signalId(source.id, item.url, item.title),
      sourceId: source.id,
      kind: source.kind,
      lang: source.lang,
      title: item.title.slice(0, 300),
      summary: item.summary.slice(0, 1000),
      url: item.url,
      publishedAt: item.publishedAt,
      weight: source.weight,
    });
    if (parsed.success && /^https?:/.test(parsed.data.url)) signals.push(parsed.data);
    else dropped++;
  }
  return { signals, dropped };
}

export type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}>;

export interface FeedResult {
  sourceId: string;
  signals: Signal[];
  dropped: number;
  error?: string;
}

/** Fetches and parses every source in parallel. One failing feed never fails the cycle. */
export async function fetchFeeds(list: readonly Source[], fetcher: FetchLike, timeoutMs = 10_000): Promise<FeedResult[]> {
  return Promise.all(
    list.map(async (source): Promise<FeedResult> => {
      try {
        const res = await fetcher(source.url, {
          headers: { "user-agent": "ConsensaPulse/0.1", accept: "application/rss+xml, application/atom+xml, application/xml" },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return { sourceId: source.id, signals: [], dropped: 0, error: `HTTP ${res.status}` };
        return { sourceId: source.id, ...parseFeed(await res.text(), source) };
      } catch (err) {
        return { sourceId: source.id, signals: [], dropped: 0, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );
}
