/**
 * The X adapter. X bills per post read (about US$0.005), so every request reserves its worst case against the
 * monthly cap first and hands back what it didn't use. It reads only our own posts' replies, parses each reply to
 * YES or NO inside this file, and returns ids, the vote and the time: the reply text never leaves this module.
 */
import { z } from "zod";
import { parseVote } from "../parse";
import type { SpendCap } from "../spend";
import type { DeletedCheck, FetchFn, ParsedReply, PollTotals, ReadReplies, SocialProvider } from "../types";

// Outside host (rule 7): a US service our server reads from. Data only comes in; LEX cleared it for this sprint.
const X_API = "https://api.x.com/2";
/** What one post read costs, in millionths of a US dollar (US$0.005). */
export const X_READ_COST_MICROS = 5_000;
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
/** X's recent search reaches back 7 days; stay just inside it. */
const SEARCH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000 - 5 * 60 * 1000;

const id = z.string().regex(/^[0-9]{1,30}$/);
const replySchema = z.object({
  id,
  text: z.string().max(4000),
  author_id: id,
  created_at: z.iso.datetime(),
  referenced_tweets: z.array(z.object({ type: z.string(), id: z.string() })).optional(),
});
const searchSchema = z.object({
  data: z.array(z.unknown()).optional(),
  meta: z.object({ next_token: z.string().max(200).optional() }).optional(),
});
const pollSchema = z.object({
  includes: z
    .object({ polls: z.array(z.object({ options: z.array(z.object({ label: z.string().max(100), votes: z.number().int().nonnegative() })) })).optional() })
    .optional(),
});
const lookupSchema = z.object({
  data: z.array(z.object({ id })).optional(),
  errors: z.array(z.object({ resource_id: z.string().optional(), type: z.string().optional() })).optional(),
});

export interface XConfig {
  /** App-only bearer for reading. Kept in Vercel (Sensitive). */
  bearer: string;
  spend: SpendCap;
  fetch?: FetchFn;
  /** A user-context token for the official account, only for the auto-reply. */
  replyToken?: string;
}

export class XProvider implements SocialProvider {
  readonly platform = "x" as const;
  private readonly fetch: FetchFn;

  constructor(private readonly config: XConfig) {
    this.fetch = config.fetch ?? fetch;
  }

  private async get(path: string): Promise<unknown | null> {
    try {
      const res = await this.fetch(`${X_API}${path}`, { headers: { Authorization: `Bearer ${this.config.bearer}` }, cache: "no-store" });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  }

  async readReplies(ourPostId: string, since: Date | null, now: Date): Promise<ReadReplies> {
    const replies: ParsedReply[] = [];
    if (!id.safeParse(ourPostId).success) return { replies, complete: false };
    const earliest = now.getTime() - SEARCH_WINDOW_MS;
    const start = new Date(Math.max(since?.getTime() ?? 0, earliest)).toISOString().replace(/\.\d{3}Z$/, "Z");
    let next: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const reserved = PAGE_SIZE * X_READ_COST_MICROS;
      if (!(await this.config.spend.reserve(reserved, now))) return { replies, complete: false };
      const query = new URLSearchParams({
        query: `conversation_id:${ourPostId} is:reply`,
        "tweet.fields": "author_id,created_at,referenced_tweets",
        max_results: String(PAGE_SIZE),
        start_time: start,
      });
      if (next) query.set("next_token", next);
      const parsed = searchSchema.safeParse(await this.get(`/tweets/search/recent?${query.toString()}`));
      if (!parsed.success) {
        await this.config.spend.release(reserved, now);
        return { replies, complete: false };
      }
      const rows = parsed.data.data ?? [];
      await this.config.spend.release((PAGE_SIZE - Math.min(rows.length, PAGE_SIZE)) * X_READ_COST_MICROS, now);
      for (const row of rows) {
        const reply = replySchema.safeParse(row);
        if (!reply.success) continue;
        // Only direct replies to our post count, not replies to other people's replies under it.
        if (!reply.data.referenced_tweets?.some((r) => r.type === "replied_to" && r.id === ourPostId)) continue;
        const vote = parseVote(reply.data.text);
        if (vote) replies.push({ replyId: reply.data.id, authorId: reply.data.author_id, vote, at: reply.data.created_at });
      }
      next = parsed.data.meta?.next_token;
      if (!next) return { replies, complete: true };
    }
    return { replies, complete: false };
  }

  async readPollTotals(ourPostId: string, now: Date): Promise<PollTotals | null> {
    if (!id.safeParse(ourPostId).success) return null;
    if (!(await this.config.spend.reserve(X_READ_COST_MICROS, now))) return null;
    const parsed = pollSchema.safeParse(await this.get(`/tweets/${ourPostId}?expansions=attachments.poll_ids&poll.fields=options`));
    if (!parsed.success) {
      // The read failed (X refused, or the request never got an answer), so nothing was read: hand the reservation
      // back (AEGIS). A read that worked stays counted, whether or not the post carries a poll we can use.
      await this.config.spend.release(X_READ_COST_MICROS, now);
      return null;
    }
    const options = parsed.data.includes?.polls?.[0]?.options;
    if (!options) return null;
    // Only a two-way YES/NO poll is read; any other poll is left alone.
    const yes = options.filter((o) => parseVote(o.label) === "yes");
    const no = options.filter((o) => parseVote(o.label) === "no");
    if (options.length !== 2 || yes.length !== 1 || no.length !== 1) return null;
    return { yes: yes[0]!.votes, no: no[0]!.votes };
  }

  /**
   * The daily sweep's check: X's post lookup, 100 ids a request (its limit). Each request reserves its worst case
   * first and hands back what X didn't return. It stops at the first refused reservation or failed request (a 429
   * included) and says so, keeping what it had already learned.
   */
  async findDeleted(replyIds: readonly string[], now: Date): Promise<DeletedCheck> {
    const gone: string[] = [];
    const ids = [...new Set(replyIds.filter((r) => id.safeParse(r).success))];
    let checked = 0;
    for (let i = 0; i < ids.length; i += PAGE_SIZE) {
      const batch = ids.slice(i, i + PAGE_SIZE);
      const reserved = batch.length * X_READ_COST_MICROS;
      if (!(await this.config.spend.reserve(reserved, now))) return { gone, checked, complete: false };
      const parsed = lookupSchema.safeParse(await this.get(`/tweets?ids=${batch.join(",")}`));
      if (!parsed.success) {
        await this.config.spend.release(reserved, now);
        return { gone, checked, complete: false };
      }
      const found = new Set((parsed.data.data ?? []).map((d) => d.id));
      await this.config.spend.release((batch.length - Math.min(found.size, batch.length)) * X_READ_COST_MICROS, now);
      checked += batch.length;
      // Gone means X says "not found". A reply hidden for another reason (a protected account) is left alone, and
      // so is one X returned in the same answer.
      for (const e of parsed.data.errors ?? []) {
        if (e.resource_id && batch.includes(e.resource_id) && !found.has(e.resource_id) && e.type?.endsWith("resource-not-found") && !gone.includes(e.resource_id)) gone.push(e.resource_id);
      }
    }
    return { gone, checked, complete: true };
  }

  async postReply(replyId: string, text: string): Promise<boolean> {
    if (!this.config.replyToken || !id.safeParse(replyId).success) return false;
    try {
      const res = await this.fetch(`${X_API}/tweets`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.config.replyToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text, reply: { in_reply_to_tweet_id: replyId } }),
        cache: "no-store",
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
