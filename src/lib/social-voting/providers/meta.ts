/**
 * The Meta adapter: Facebook Page posts, Instagram media and Threads posts, read through the Graph API (free, but
 * it needs Meta's app review, which is still to come). Built and tested against fixtures only.
 *
 * AEGIS note 3: the id on a comment is not proven to match the id a person gets when they link (Facebook ids are
 * app-scoped; Instagram and Threads comments may carry only a username). So a comment with no numeric author id
 * is dropped here, and until Meta linking exists (it is a stub) no Meta reply can match a linked account anyway.
 * Native polls on Meta are entered by hand, so `readPollTotals` has nothing to read.
 */
import { z } from "zod";
import { parseVote } from "../parse";
import type { FetchFn, ParsedReply, Platform, PollTotals, ReadReplies, SocialProvider } from "../types";

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

  async readPollTotals(): Promise<PollTotals | null> {
    return null;
  }
}
