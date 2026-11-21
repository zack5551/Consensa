/**
 * The Meta adapter: Facebook Page posts, Instagram media and Threads posts, read through the Graph API (free, but
 * it needs Meta's app review, which is still to come). Built and tested against fixtures only.
 *
 * AEGIS note 3: the id on a comment is not proven to match the id a person gets when they link (Facebook ids are
 * app-scoped; Instagram and Threads comments may carry only a username). So a comment with no numeric author id
 * is dropped here, and until Meta linking exists (it is a stub) no Meta reply can match a linked account anyway.
 *
 * Totals for the question page (zack, 2026-11-21), shown under "On social media" and never in "Canada says":
 * - Threads and Instagram: the post's own YES/NO poll (Meta gives each option's share and the total).
 * - Facebook has no poll Meta lets an app read, so a Page post asks for reactions: 👍 is yes, 😢 is no.
 * - Instagram without a poll: the YES/NO comments, one per account (its latest). LEX: they are read and counted in
 *   memory on our Montréal server, and only the two totals leave this file. No text, username or id is kept.
 * `findOwnPosts` lists our own account's recent posts with the links in them, so the daily run can tie a post to a
 * question the same way it does on X (`discover.ts`).
 */
import { z } from "zod";
import { OFFICIAL_HANDLE } from "@/lib/social";
import { parseVote } from "../parse";
import type { FetchFn, ParsedReply, Platform, PollTotals, ReadReplies, SocialProvider } from "../types";
import { yesNo } from "./x";

// Outside hosts (rule 7): US services our server reads from. Data only comes in; LEX cleared it for this sprint.
// No version in the path: the Graph API then uses the app's own default version, so no stale version is pinned here.
const GRAPH = "https://graph.facebook.com";
const THREADS_GRAPH = "https://graph.threads.net";
const PAGE_SIZE = 100;
const MAX_PAGES = 20;

const numericId = z.string().regex(/^[0-9]{1,30}$/);
const commentSchema = z.object({
  id: z.string().regex(/^[0-9_]{1,64}$/),
  from: z.object({ id: numericId }).optional(),
  message: z.string().max(10_000).optional(),
  text: z.string().max(10_000).optional(),
  created_time: z.string().max(40).optional(),
  timestamp: z.string().max(40).optional(),
});
const pageSchema = z.object({
  data: z.array(z.unknown()),
  paging: z.object({ cursors: z.object({ after: z.string().max(500).optional() }).optional(), next: z.string().optional() }).optional(),
});

const share = z.number().min(0).max(1);
const pollAttachment = z.object({
  option_a: z.string().max(100),
  option_b: z.string().max(100),
  option_c: z.string().max(100).nullish(),
  option_a_votes_percentage: share,
  option_b_votes_percentage: share,
  total_votes: z.number().int().nonnegative(),
  expiration_timestamp: z.string().max(40).nullish(),
});
const POLL_FIELDS = "poll_attachment{option_a,option_b,option_c,option_a_votes_percentage,option_b_votes_percentage,total_votes,expiration_timestamp}";
const ownPostSchema = z.object({
  id: z.string().regex(/^[0-9_]{1,64}$/),
  message: z.string().max(10_000).optional(),
  text: z.string().max(10_000).optional(),
  caption: z.string().max(10_000).optional(),
  permalink: z.string().max(500).optional(),
  created_time: z.string().max(40).optional(),
  timestamp: z.string().max(40).optional(),
  poll_attachment: pollAttachment.nullish(),
});
const reactionCount = z.object({ summary: z.object({ total_count: z.number().int().nonnegative() }) });
const reactionsSchema = z.object({ yes: reactionCount, no: reactionCount });
const pollOnlySchema = z.object({ poll_attachment: pollAttachment.nullish() });
const voteCommentSchema = z.object({
  text: z.string().max(10_000).optional(),
  timestamp: z.string().max(40).optional(),
  from: z.object({ id: z.string().regex(/^[0-9]{1,30}$/) }).optional(),
});

/** Facebook reactions that stand for a vote (zack, 2026-11-21). One place, so a change is one line. */
export const REACTION_VOTES = { yes: "LIKE", no: "SAD" } as const;

/** Our own posts from the last 8 days, like the X finder. */
const OWN_POSTS_WINDOW_MS = 8 * 24 * 60 * 60 * 1000;
const OWN_POSTS_LIMIT = 25;

/** One of our own recent Meta posts: the links written in it, its address on our account, and its poll if any. */
export interface FoundPost {
  postId: string;
  links: string[];
  /** The post's address with our handle in it, or null when Meta's permalink doesn't have the shape we expect. */
  url: string | null;
  poll: PollTotals | null;
  endsAt: string | null;
  /** True when the post itself asks for votes (AEGIS): a plain post with our link is never read as a vote. */
  asksVote: boolean;
}

/** The reaction emoji our Facebook vote post names (the dictionaries' reactPost, EN and FR). */
const REACTION_PROMPT = ["👍", "😢"] as const;

/**
 * Whether a post asks for votes the way our own texts do: on Facebook it names both reactions; on Instagram it asks
 * for YES or NO (OUI ou NON) in capitals. A post with a poll always counts as one. Kept in step with the
 * dictionaries' reactPost and commentPost by a test.
 */
export function asksForVotes(platform: MetaPlatform, text: string | undefined): boolean {
  const t = text ?? "";
  if (platform === "facebook") return REACTION_PROMPT.every((e) => t.includes(e));
  if (platform === "instagram") return /\b(?:YES|OUI)\b[^\n]{0,20}\b(?:NO|NON)\b/.test(t);
  return false;
}

/** Full links written in a post's text. Meta posts carry links as plain text, so they are read from it. */
export function linksIn(text: string | undefined): string[] {
  return [...(text ?? "").matchAll(/https:\/\/[^\s<>"]+/g)].map((m) => m[0].replace(/[.,;:!?)»]+$/, "")).slice(0, 10);
}

/** A two-way poll Meta reports as shares: each option's votes, rounded, and only when its options read yes and no. */
export function metaPoll(p: z.infer<typeof pollAttachment>): PollTotals | null {
  if (p.option_c) return null;
  const a = Math.round(p.option_a_votes_percentage * p.total_votes);
  return yesNo([
    { label: p.option_a, votes: a },
    { label: p.option_b, votes: p.total_votes - a },
  ]);
}

/**
 * The post's address on our own account (LEX: a logo opens only our own post). Facebook is built from the post id;
 * Instagram and Threads take the code from Meta's permalink and put our handle in front of it.
 */
export function ownPostUrl(platform: MetaPlatform, postId: string, permalink: string | undefined): string | null {
  if (platform === "facebook") {
    const post = /^[0-9]{1,30}_([0-9]{1,30})$/.exec(postId)?.[1];
    return post ? `https://www.facebook.com/${OFFICIAL_HANDLE}/posts/${post}` : null;
  }
  const code = /^https:\/\/(?:www\.)?(?:instagram\.com|threads\.(?:net|com))\/(?:[^/?#]+\/)?(?:p|reel|post)\/([A-Za-z0-9_-]{1,40})(?:[/?#]|$)/.exec(permalink ?? "")?.[1];
  if (!code) return null;
  return platform === "instagram" ? `https://www.instagram.com/${OFFICIAL_HANDLE}/p/${code}/` : `https://www.threads.com/@${OFFICIAL_HANDLE}/post/${code}`;
}

/** Meta writes times as 2026-11-19T15:04:05+0000; this gives the ISO form, or null when it isn't a time. */
export function metaTime(value: string | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

export type MetaPlatform = Exclude<Platform, "x">;

export interface MetaConfig {
  platform: MetaPlatform;
  /** The Page, Instagram or Threads access token for our own account. Kept in Vercel (Sensitive). */
  accessToken: string;
  /** Instagram only: our professional account's id (META_INSTAGRAM_ID), which `findOwnPosts` reads from. */
  accountId?: string;
  fetch?: FetchFn;
}

export class MetaProvider implements SocialProvider {
  readonly platform: MetaPlatform;
  private readonly fetch: FetchFn;

  constructor(private readonly config: MetaConfig) {
    this.platform = config.platform;
    this.fetch = config.fetch ?? fetch;
  }

  private path(ourPostId: string, after: string | undefined): string {
    const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (after) query.set("after", after);
    if (this.platform === "threads") {
      query.set("fields", "id,text,timestamp");
      return `${THREADS_GRAPH}/${ourPostId}/replies?${query.toString()}`;
    }
    query.set("fields", this.platform === "facebook" ? "id,from{id},message,created_time" : "id,from,text,timestamp");
    return `${GRAPH}/${ourPostId}/comments?${query.toString()}`;
  }

  async readReplies(ourPostId: string, since: Date | null): Promise<ReadReplies> {
    const replies: ParsedReply[] = [];
    if (!/^[0-9_]{1,64}$/.test(ourPostId)) return { replies, complete: false };
    let after: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      let body: unknown;
      try {
        // The token goes in a header, never in the address, so it can't end up in a request log.
        const res = await this.fetch(this.path(ourPostId, after), { headers: { Authorization: `Bearer ${this.config.accessToken}` }, cache: "no-store" });
        if (!res.ok) return { replies, complete: false };
        body = await res.json();
      } catch {
        return { replies, complete: false };
      }
      const parsed = pageSchema.safeParse(body);
      if (!parsed.success) return { replies, complete: false };
      for (const row of parsed.data.data) {
        const comment = commentSchema.safeParse(row);
        if (!comment.success || !comment.data.from) continue; // no numeric author id: can't be matched, so dropped
        const at = metaTime(comment.data.created_time ?? comment.data.timestamp);
        if (!at || (since && Date.parse(at) < since.getTime())) continue;
        const vote = parseVote(comment.data.message ?? comment.data.text);
        if (vote) replies.push({ replyId: comment.data.id, authorId: comment.data.from.id, vote, at });
      }
      // The next page is asked for by cursor only; a full "next" address from the response is never followed.
      after = parsed.data.paging?.next ? parsed.data.paging.cursors?.after : undefined;
      if (!after) return { replies, complete: true };
    }
    return { replies, complete: false };
  }

  private async get(url: string): Promise<unknown | null> {
    try {
      // The token goes in a header, never in the address, so it can't end up in a request log.
      const res = await this.fetch(url, { headers: { Authorization: `Bearer ${this.config.accessToken}` }, cache: "no-store" });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  }

  /** Our own account's posts from the last 8 days. A failed request finds nothing this run. */
  async findOwnPosts(now: Date): Promise<FoundPost[]> {
    const since = String(Math.floor((now.getTime() - OWN_POSTS_WINDOW_MS) / 1000));
    const query = new URLSearchParams({ limit: String(OWN_POSTS_LIMIT) });
    let url: string;
    if (this.platform === "facebook") {
      query.set("fields", "id,message,created_time");
      query.set("since", since);
      url = `${GRAPH}/me/posts?${query.toString()}`;
    } else if (this.platform === "threads") {
      query.set("fields", `id,text,permalink,timestamp,${POLL_FIELDS}`);
      query.set("since", since);
      url = `${THREADS_GRAPH}/me/threads?${query.toString()}`;
    } else {
      if (!this.config.accountId || !/^[0-9]{1,30}$/.test(this.config.accountId)) return [];
      query.set("fields", "id,caption,permalink,timestamp");
      url = `${GRAPH}/${this.config.accountId}/media?${query.toString()}`;
    }
    const page = pageSchema.safeParse(await this.get(url));
    if (!page.success) return [];
    const earliest = now.getTime() - OWN_POSTS_WINDOW_MS;
    return page.data.data.flatMap((row) => {
      const post = ownPostSchema.safeParse(row);
      if (!post.success) return [];
      const at = metaTime(post.data.created_time ?? post.data.timestamp);
      if (!at || Date.parse(at) < earliest) return [];
      const p = post.data.poll_attachment;
      const text = post.data.message ?? post.data.text ?? post.data.caption;
      return [
        {
          postId: post.data.id,
          links: linksIn(text),
          asksVote: asksForVotes(this.platform, text),
          url: ownPostUrl(this.platform, post.data.id, post.data.permalink),
          poll: p ? metaPoll(p) : null,
          endsAt: p ? metaTime(p.expiration_timestamp ?? undefined) : null,
        },
      ];
    });
  }

  /**
   * The YES/NO totals for one of our posts: reactions on Facebook, the poll on Threads, and on Instagram the poll or,
   * without one, the YES/NO comments. Null when there is nothing to show or a read failed (a partial count is never
   * shown).
   */
  async readPollTotals(ourPostId: string): Promise<PollTotals | null> {
    if (!/^[0-9_]{1,64}$/.test(ourPostId)) return null;
    if (this.platform === "facebook") {
      const r = (vote: "yes" | "no") => `reactions.type(${REACTION_VOTES[vote]}).limit(0).summary(total_count).as(${vote})`;
      const parsed = reactionsSchema.safeParse(await this.get(`${GRAPH}/${ourPostId}?fields=${r("yes")},${r("no")}`));
      return parsed.success ? { yes: parsed.data.yes.summary.total_count, no: parsed.data.no.summary.total_count, source: "reactions" } : null;
    }
    const base = this.platform === "threads" ? THREADS_GRAPH : GRAPH;
    const poll = pollOnlySchema.safeParse(await this.get(`${base}/${ourPostId}?fields=${POLL_FIELDS}`));
    if (!poll.success) return null;
    if (poll.data.poll_attachment) return metaPoll(poll.data.poll_attachment);
    return this.platform === "instagram" ? this.countVoteComments(ourPostId) : null;
  }

  /** Instagram's YES/NO comments, each account's latest one. Everything but the two totals stays in this function. */
  private async countVoteComments(ourPostId: string): Promise<PollTotals | null> {
    const latest = new Map<string, { at: number; vote: "yes" | "no" }>();
    let after: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE), fields: "text,timestamp,from" });
      if (after) query.set("after", after);
      const parsed = pageSchema.safeParse(await this.get(`${GRAPH}/${ourPostId}/comments?${query.toString()}`));
      if (!parsed.success) return null;
      for (const row of parsed.data.data) {
        const c = voteCommentSchema.safeParse(row);
        const at = c.success ? metaTime(c.data.timestamp) : null;
        const vote = c.success ? parseVote(c.data.text) : null;
        if (!c.success || !c.data.from || !at || !vote) continue;
        const seen = latest.get(c.data.from.id);
        if (!seen || Date.parse(at) >= seen.at) latest.set(c.data.from.id, { at: Date.parse(at), vote });
      }
      after = parsed.data.paging?.next ? parsed.data.paging.cursors?.after : undefined;
      if (!after) {
        const votes = [...latest.values()];
        const yes = votes.filter((v) => v.vote === "yes").length;
        return { yes, no: votes.length - yes, source: "comments" };
      }
    }
    return null;
  }
}
