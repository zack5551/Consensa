import { z } from "zod";
import type { Locale } from "@/i18n/config";
import type { Side } from "@/lib/call-side";
import { formatCount, formatPercent, formatShortDate } from "@/lib/format";
import { fill } from "@/lib/text";

/**
 * Social v1 (free only): share links and hand-entered native poll totals. Nothing here calls a social API, links an
 * account or sends user data anywhere. Every share link carries the plain question URL and nothing else.
 */

export const socialPlatforms = ["x", "threads", "instagram", "facebook"] as const;
export type SocialPlatform = (typeof socialPlatforms)[number];

/** Hosts a poll's post URL may point to (LEX): the four platforms, with or without "www.". */
const postHosts: Record<SocialPlatform, readonly string[]> = {
  x: ["x.com"],
  // Threads moved to threads.com; threads.net still redirects there, so both are real post addresses.
  threads: ["threads.net", "threads.com"],
  instagram: ["instagram.com"],
  facebook: ["facebook.com"],
};
const allowedPostHosts = new Set(Object.values(postHosts).flatMap((hosts) => hosts.flatMap((h) => [h, `www.${h}`])));

export function isAllowedPostUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "" && url.port === "" && allowedPostHosts.has(url.hostname);
  } catch {
    return false;
  }
}

/** True when the URL is on the given platform's own hosts (an X poll can't point to Facebook). */
export function isOnPlatform(platform: SocialPlatform, value: string): boolean {
  if (!isAllowedPostUrl(value)) return false;
  const host = new URL(value).hostname;
  return postHosts[platform].some((h) => host === h || host === `www.${h}`);
}

/** Our handle on every platform (zack, 2026-11-19). Compared without case: the platforms ignore it in addresses. */
export const OFFICIAL_HANDLE = "cansensus";

/**
 * True when the URL is a post on our own account (LEX: a logo links only to an official @CANsensus post). The handle
 * must be the first part of the path: x.com/CANsensus/status/…, threads.com/@cansensus/post/…,
 * facebook.com/CANsensus/posts/…, instagram.com/cansensus/p/… or, for a story, instagram.com/stories/cansensus/….
 */
export function isOfficialPost(platform: SocialPlatform, value: string): boolean {
  if (!isOnPlatform(platform, value)) return false;
  const parts = new URL(value).pathname.split("/").filter(Boolean).map((p) => p.toLowerCase());
  const owner = platform === "instagram" && parts[0] === "stories" ? parts[1] : parts[0];
  return (platform === "threads" ? owner === `@${OFFICIAL_HANDLE}` : owner === OFFICIAL_HANDLE) && parts.length >= 2;
}

const count = z.number().int().nonnegative();

/** One hand-entered native poll total, from a post on an official CANsensus account. Totals only: no usernames. */
export const socialPollSchema = z
  .object({
    platform: z.enum(socialPlatforms),
    yes: count,
    no: count,
    /** When the platform's poll closed. */
    closedAt: z.iso.datetime(),
    url: z.string().refine(isAllowedPostUrl, { message: "Post URL must be https on x.com, threads.net, threads.com, instagram.com or facebook.com." }),
    /** True for made-up preview numbers, so they are never mistaken for real totals. */
    sample: z.boolean().optional(),
  })
  .refine((p) => p.yes + p.no > 0, { path: ["yes"], message: "A poll needs at least one vote." })
  .refine((p) => isOnPlatform(p.platform, p.url), {
    path: ["url"],
    message: "Post URL must be on the same platform as the poll.",
  });
export type SocialPoll = z.infer<typeof socialPollSchema>;

/**
 * An editor's link to this question's official post on one platform (an Instagram story poll, a Facebook post).
 * `locale` keeps a French post off the English page; leave it out when one post serves both.
 */
export const socialLinkSchema = z
  .object({
    platform: z.enum(socialPlatforms),
    url: z.string().refine(isAllowedPostUrl, { message: "Post URL must be https on x.com, threads.net, threads.com, instagram.com or facebook.com." }),
    locale: z.enum(["en", "fr"]).optional(),
  })
  .strict()
  .refine((l) => isOfficialPost(l.platform, l.url), { path: ["url"], message: "Post URL must be a post on our own @CANsensus account on that platform." });
export type SocialLink = z.infer<typeof socialLinkSchema>;

export type PostLink = { platform: SocialPlatform; url: string };

type PostSources = {
  socialLinks?: readonly SocialLink[];
  socialPolls?: readonly SocialPoll[];
  /** The official posts read for replies. Only X ids map to a public address on their own. */
  socialPosts?: readonly { platform: string; postId: string; locale: string }[];
};

/**
 * One official post per platform for a question page, in a fixed platform order. An editor's link wins, then a real
 * poll's post, then an X post id. Sample polls have no real post, so they never make a link. Every address is checked
 * again here (https, the platform's own host, our own account), so a bad value from any source is dropped, not linked.
 */
export function questionPostLinks(q: PostSources, locale: Locale): PostLink[] {
  const found = new Map<SocialPlatform, string>();
  const add = (platform: SocialPlatform, url: string) => {
    if (!found.has(platform) && isOfficialPost(platform, url)) found.set(platform, url);
  };
  for (const l of q.socialLinks ?? []) if (!l.locale || l.locale === locale) add(l.platform, l.url);
  for (const p of q.socialPolls ?? []) if (!p.sample) add(p.platform, p.url);
  for (const p of q.socialPosts ?? []) if (p.platform === "x" && p.locale === locale && /^[0-9]{1,32}$/.test(p.postId)) add("x", `https://x.com/CANsensus/status/${p.postId}`);
  return socialPlatforms.flatMap((platform) => {
    const url = found.get(platform);
    return url ? [{ platform, url }] : [];
  });
}

export type SocialPollLabels = {
  platforms: Record<SocialPlatform, string>;
  /** "{platform} poll, {date}: {percent} yes · {votes}" */
  line: string;
  votes: string;
  votesOne: string;
};

/** "X poll, Nov. 19: 58% yes · 1,240 votes": platform and close date named, totals only. */
export function socialPollLine(poll: SocialPoll, labels: SocialPollLabels, locale: Locale): string {
  const total = poll.yes + poll.no;
  return fill(labels.line, {
    platform: labels.platforms[poll.platform],
    date: formatShortDate(poll.closedAt, locale),
    percent: formatPercent((poll.yes / total) * 100, locale),
    votes: fill(total === 1 ? labels.votesOne : labels.votes, { n: formatCount(total, locale) }),
  });
}

/** The plain question page address: no user ID, no tracking parameters. */
export function questionShareUrl(base: string, locale: Locale, slug: string): string {
  return `${base.replace(/\/+$/, "")}/${locale}/q/${slug}`;
}

/** The "Called it!" page for a resolved question: the slug and the side that happened, nothing about who called it. */
export function calledItShareUrl(base: string, locale: Locale, slug: string, side: Side): string {
  return `${questionShareUrl(base, locale, slug)}/called-it/${side}`;
}

export type ShareLinks = { x: string; threads: string; facebook: string };

/** Plain intent links: no SDKs, no scripts, no trackers. The share hosts are links only; nothing is sent from our side. */
export function shareLinks(text: string, url: string): ShareLinks {
  const t = encodeURIComponent(text);
  const u = encodeURIComponent(url);
  return {
    x: `https://twitter.com/intent/tweet?text=${t}&url=${u}`,
    // Threads takes one text field, so the address goes at the end of it.
    threads: `https://www.threads.net/intent/post?text=${encodeURIComponent(`${text} ${url}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
  };
}

export type ShareTextLabels = {
  /** "{question} Make your call on CANsensus. Free. No prizes." */
  text: string;
  /** The same, plus LEX's fan-forecast line for sports questions. */
  textSports: string;
  /** Once calls close: "{question} See where Canada landed on CANsensus. Free. No prizes." */
  textClosed: string;
  /** The closed post, plus the fan-forecast line. */
  textClosedSports: string;
};

/**
 * The share post text. Sports posts add "Fan forecasts only." (LEX, sports rules). A guest or brand question leads with
 * its "Asked by" / "Sponsored by" label, because LEX wants the label everywhere the question goes, social posts included.
 */
export function questionShareText(labels: ShareTextLabels, question: string, options: { sports: boolean; askedBy?: string; closed?: boolean }): string {
  // Once calls close, a post can't invite a call: it points to where Canada landed instead.
  const template = options.closed ? (options.sports ? labels.textClosedSports : labels.textClosed) : options.sports ? labels.textSports : labels.text;
  return withAskedBy(fill(template, { question }), options.askedBy);
}

/** Any share post about a guest or brand question (the question post, the "Called it!" post) leads with its label. */
export function withAskedBy(text: string, askedBy: string | undefined): string {
  return askedBy ? `${askedBy} · ${text}` : text;
}
