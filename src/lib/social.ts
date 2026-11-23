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

/** Our handle on every platform, as written (zack, 2026-11-19). */
export const OFFICIAL_HANDLE_DISPLAY = "CANsensus";
/** The same handle for comparing: the platforms ignore case in addresses. */
export const OFFICIAL_HANDLE = OFFICIAL_HANDLE_DISPLAY.toLowerCase();

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
    /** When the totals were taken: when the platform's poll closed, or the last read of a poll still running. */
    closedAt: z.iso.datetime(),
    /** When the platform's poll ends, when known. Sports show only a poll that ends before the game starts (LEX). */
    endsAt: z.iso.datetime().optional(),
    url: z.string().refine(isAllowedPostUrl, { message: "Post URL must be https on x.com, threads.net, threads.com, instagram.com or facebook.com." }),
    /** Where the totals come from when it isn't the platform's own poll: reactions (Facebook) or YES/NO comments. */
    source: z.enum(["reactions", "comments"]).optional(),
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

/** One platform row on a question page: its poll result, and our official post there if we have one. */
export type SocialRow = { platform: SocialPlatform; poll: SocialPoll; url?: string };

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
  for (const p of q.socialPosts ?? []) if (p.platform === "x" && p.locale === locale && /^[0-9]{1,32}$/.test(p.postId)) add("x", `https://x.com/${OFFICIAL_HANDLE_DISPLAY}/status/${p.postId}`);
  return socialPlatforms.flatMap((platform) => {
    const url = found.get(platform);
    return url ? [{ platform, url }] : [];
  });
}

export type SocialPollLabels = {
  platforms: Record<SocialPlatform, string>;
  /** "{platform} poll, {date}: {percent} yes · {votes}" */
  line: string;
  /** "{platform} reactions, {date}: {percent} 👍 yes · {votes}" */
  lineReactions: string;
  /** "{platform} comments, {date}: {percent} YES · {votes}" */
  lineComments: string;
  votes: string;
  votesOne: string;
  reactions: string;
  reactionsOne: string;
  comments: string;
  commentsOne: string;
};

/** "X poll, Nov. 19: 58% yes · 1,240 votes": platform, source and close date named, totals only. */
export function socialPollLine(poll: SocialPoll, labels: SocialPollLabels, locale: Locale): string {
  const total = poll.yes + poll.no;
  const [line, many, one] =
    poll.source === "reactions"
      ? [labels.lineReactions, labels.reactions, labels.reactionsOne]
      : poll.source === "comments"
        ? [labels.lineComments, labels.comments, labels.commentsOne]
        : [labels.line, labels.votes, labels.votesOne];
  return fill(line, {
    platform: labels.platforms[poll.platform],
    date: formatShortDate(poll.closedAt, locale),
    percent: formatPercent((poll.yes / total) * 100, locale),
    votes: fill(total === 1 ? one : many, { n: formatCount(total, locale) }),
  });
}

/**
 * The question page's social rows, in the fixed platform order: each poll's result next to its own post (a real poll
 * that isn't on our account falls back to the platform's official link). A platform shows only once it has a result
 * (zack, 2026-11-20). A sample poll never links anywhere. For a sports question, pass the start as `pollsCloseBy`.
 */
export function questionSocialRows(q: PostSources, locale: Locale, options: { pollsCloseBy?: string } = {}): SocialRow[] {
  const links = new Map(questionPostLinks(q, locale).map((l) => [l.platform, l.url]));
  // Sports are pre-game only (LEX): a platform poll that ran past the start isn't shown.
  const by = options.pollsCloseBy ? Date.parse(options.pollsCloseBy) : Infinity;
  return socialPlatforms.flatMap((platform) => {
    const polls = (q.socialPolls ?? []).filter((p) => p.platform === platform && Date.parse(p.endsAt ?? p.closedAt) <= by);
    return polls.map((poll) => ({ platform, poll, url: poll.sample ? undefined : isOfficialPost(platform, poll.url) ? poll.url : links.get(platform) }));
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

export type PollPostLabels = {
  /** The full text: vote for fun, how to count in "Canada says", the link, "Free. No prizes." */
  pollPost: string;
  /** The same without the reply route: the only one to post until social voting is on (LEX). */
  pollPostShort: string;
  /** The last resort for a long question: only the link and "Free. No prizes." */
  pollPostMin: string;
  /** Facebook, which has no poll an app can read: 👍 for yes, 😢 for no. */
  reactPost: string;
  /** Instagram without a poll: YES or NO in the comments. */
  commentPost: string;
  /** LEX's fan-forecast and non-affiliation lines, added for sports. */
  pollPostSports: string;
};

/** X counts every link as 23 characters, whatever its length. */
const X_LINK_LENGTH = 23;
export const X_POST_LIMIT = 280;
/** Threads allows 500 characters. */
const THREADS_POST_LIMIT = 500;

/**
 * The text zack posts with a hand-made poll (zack, 2026-11-21): the question, "vote for fun", the plain question
 * link the daily run uses to find the post, and "Free. No prizes." Sports add LEX's lines. On X and Threads, the
 * reply route ("reply YES or NO from a linked account") is added only with `replyRoute`, once social voting is on
 * (LEX), and only when it fits; a question too long for even the short text gets only the link. Facebook asks for
 * reactions and Instagram for comments.
 */
export function pollPostText(
  labels: PollPostLabels,
  question: string,
  link: string,
  options: { sports: boolean; platform?: SocialPlatform; replyRoute?: boolean },
): string {
  const text = (template: string) => `${fill(template, { question, link })}${options.sports ? ` ${labels.pollPostSports}` : ""}`;
  const platform = options.platform ?? "x";
  if (platform === "facebook") return text(labels.reactPost);
  if (platform === "instagram") return text(labels.commentPost);
  const fits = (t: string) => (platform === "x" ? xPostLength(t) <= X_POST_LIMIT : [...t].length <= THREADS_POST_LIMIT);
  const choices = [...(options.replyRoute ? [labels.pollPost] : []), labels.pollPostShort].map(text);
  return choices.find(fits) ?? text(labels.pollPostMin);
}

/** The length X counts for a post: characters, with every link as 23. */
export function xPostLength(text: string): number {
  return [...text.replace(/https?:\/\/\S+/g, "x".repeat(X_LINK_LENGTH))].length;
}
