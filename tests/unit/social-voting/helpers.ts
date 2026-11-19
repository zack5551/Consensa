import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CountOutcome, CountStore, OfficialPost } from "@/lib/social-voting/count";
import type { SpendStore } from "@/lib/social-voting/spend";
import type { RemoveOutcome, SweepStore } from "@/lib/social-voting/sweep";
import type { FetchFn, Platform, PollTotals } from "@/lib/social-voting/types";

export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, "..", "..", "fixtures", "social", name), "utf8"));
}

export type Call = { url: string; init?: RequestInit };

/** A fetch that answers from a list of [address pattern, body] pairs and records every request it gets. */
export function fakeFetch(routes: Array<[RegExp, unknown, number?]>): { fetch: FetchFn; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchFn = async (url, init) => {
    calls.push({ url, init });
    const hit = routes.find(([re]) => re.test(url));
    return new Response(JSON.stringify(hit ? hit[1] : { error: "no route" }), { status: hit ? (hit[2] ?? 200) : 404 });
  };
  return { fetch, calls };
}

/** The spend counter as the database keeps it: one running total per platform and month, checked in one step. */
export class MemorySpend implements SpendStore {
  totals = new Map<string, number>();
  asked = 0;
  async reserve(platform: Platform, month: string, micros: number, capMicros: number): Promise<boolean> {
    this.asked += 1;
    const key = `${platform}:${month}`;
    const spent = this.totals.get(key) ?? 0;
    if (micros <= 0) {
      this.totals.set(key, Math.max(0, spent + micros));
      return true;
    }
    if (spent + micros > capMicros) return false;
    this.totals.set(key, spent + micros);
    return true;
  }
}

type Ledger = { platform: Platform; replyId: string; postId: string; userId: string; slug: string; probability: number; at: string };

/**
 * An in-memory stand-in for the database side, following count_social_reply() in the sprint-11 migration: linked
 * accounts only, idempotent on the reply id, a website call wins, the latest reply wins. `written` records every
 * value any method was given, so a test can prove what could ever have been stored. `removeReply` follows
 * remove_social_reply() in the same migration, branch for branch.
 */
export class MemoryStore implements CountStore, SweepStore {
  links = new Map<string, string>(); // "platform:platformUserId" -> user id
  ledger: Ledger[] = [];
  calls = new Map<string, { probability: number; source: string }>(); // "user:slug"
  reads = new Map<string, { readThrough?: Date; poll?: PollTotals }>();
  windows = new Map<string, string>();
  autoReplied = new Set<string>();
  written: unknown[] = [];
  retryOnce = new Set<string>();
  /** The database's clock, for "is the question still open". */
  clock = NOW;
  removeRetryOnce = new Set<string>();
  removeFails = new Set<string>();
  paused = 0;

  link(platform: Platform, platformUserId: string, userId: string): this {
    this.links.set(`${platform}:${platformUserId}`, userId);
    return this;
  }

  async linkedIds(platform: Platform): Promise<ReadonlySet<string>> {
    return new Set([...this.links.keys()].filter((k) => k.startsWith(`${platform}:`)).map((k) => k.slice(platform.length + 1)));
  }
  async ensureWindow(slug: string, closesAt: string): Promise<void> {
    this.written.push({ slug, closesAt });
    this.windows.set(slug, closesAt);
  }
  async readThrough(platform: Platform, postId: string): Promise<Date | null> {
    return this.reads.get(`${platform}:${postId}`)?.readThrough ?? null;
  }
  async saveRead(post: OfficialPost, patch: { readThrough?: Date; poll?: PollTotals }): Promise<void> {
    this.written.push({ post, patch });
    const key = `${post.platform}:${post.postId}`;
    this.reads.set(key, { ...this.reads.get(key), ...patch });
  }
  async countReply(input: { platform: Platform; replyId: string; postId: string; authorId: string; slug: string; probability: number; at: string }): Promise<CountOutcome> {
    this.written.push(input);
    if (this.retryOnce.delete(input.replyId)) return "retry";
    const userId = this.links.get(`${input.platform}:${input.authorId}`);
    if (!userId) return "unlinked";
    if (this.ledger.some((l) => l.platform === input.platform && l.replyId === input.replyId)) return "duplicate";
    this.ledger.push({ platform: input.platform, replyId: input.replyId, postId: input.postId, userId, slug: input.slug, probability: input.probability, at: input.at });
    const key = `${userId}:${input.slug}`;
    if (this.calls.get(key)?.source === "web") return "website_wins";
    if (this.ledger.some((l) => l.userId === userId && l.slug === input.slug && Date.parse(l.at) > Date.parse(input.at))) return "older_reply";
    this.calls.set(key, { probability: input.probability, source: input.platform });
    return "counted";
  }
  async ledgerReplyIds(platform: Platform, postId: string, limit: number): Promise<string[]> {
    return this.ledger
      .filter((l) => l.platform === platform && l.postId === postId)
      .map((l) => l.replyId)
      .sort()
      .slice(0, limit);
  }
  private latestReply(userId: string, slug: string): Ledger | undefined {
    return this.ledger.filter((l) => l.userId === userId && l.slug === slug).sort((x, y) => Date.parse(y.at) - Date.parse(x.at))[0];
  }
  async removeReply(platform: Platform, replyId: string): Promise<RemoveOutcome> {
    this.written.push({ platform, replyId });
    if (this.removeFails.has(replyId)) throw new Error("remove unavailable");
    if (this.removeRetryOnce.delete(replyId)) return "retry";
    const gone = this.ledger.find((l) => l.platform === platform && l.replyId === replyId);
    if (!gone) return "unknown";
    const closes = this.windows.get(gone.slug);
    if (!closes || this.clock.getTime() >= Date.parse(closes)) return "closed";
    const key = `${gone.userId}:${gone.slug}`;
    const source = this.calls.get(key)?.source;
    const wasLatest = this.latestReply(gone.userId, gone.slug) === gone;
    this.ledger = this.ledger.filter((l) => l !== gone);
    // A website call, or a newer reply, set the current call: nothing else changes.
    if (!source || source === "web" || !wasLatest) return "removed";
    const latest = this.latestReply(gone.userId, gone.slug);
    if (latest) {
      this.calls.set(key, { probability: latest.probability, source: latest.platform });
      return "restored";
    }
    this.calls.delete(key);
    return "call_removed";
  }
  async pauseStaleLinks(): Promise<number> {
    return this.paused;
  }
  async claimAutoReply(platform: Platform, authorId: string, postId: string): Promise<boolean> {
    // The real store keeps a keyed hash; the id itself is deliberately not recorded in `written`.
    const key = `${platform}:${authorId}:${postId}`;
    if (this.autoReplied.has(key)) return false;
    this.autoReplied.add(key);
    return true;
  }
}

export const OUR_POST = "1980000000000000000";
export const NOW = new Date("2026-11-19T15:00:00Z");
export const post: OfficialPost = { platform: "x", postId: OUR_POST, slug: "boc-cut-dec-2026", locale: "en", closesAt: "2026-12-09T14:45:00Z" };
