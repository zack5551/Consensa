import { z } from "zod";
import type { Locale } from "@/i18n/config";
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
    return url.protocol === "https:" && url.username === "" && url.password === "" && allowedPostHosts.has(url.hostname);
  } catch {
    return false;
  }
}

const count = z.number().int().nonnegative();

/** One hand-entered native poll total, from a post on an official Cansensa account. Totals only: no usernames. */
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
  .refine((p) => postHosts[p.platform].some((h) => [h, `www.${h}`].includes(new URL(p.url).hostname)), {
    path: ["url"],
    message: "Post URL must be on the same platform as the poll.",
  });
export type SocialPoll = z.infer<typeof socialPollSchema>;

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
