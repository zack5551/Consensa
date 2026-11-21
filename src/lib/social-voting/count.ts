/**
 * The counting step of the daily cycle: read the replies on our official posts, keep only those from linked
 * accounts, and hand each to the database, which decides whether it counts (count_social_reply). Framework-free:
 * the providers and the store are injected, so tests run it with fixtures and no network.
 *
 * Privacy: a reply from an account that isn't linked is dropped here, in memory, before anything is stored. The
 * report holds counts only: no ids, no text, nothing to log about a person.
 *
 * Deleted replies are handled by the daily sweep in `sweep.ts`, which the cycle runs before this step.
 */
import { callsCloseAt, isOpen, questionState, type Question } from "@/lib/question";
import { REPLY_PROBABILITY, socialPostSchema, type ParsedReply, type Platform, type PollTotals, type SocialProvider } from "./types";

export interface OfficialPost {
  platform: Platform;
  postId: string;
  slug: string;
  locale: "en" | "fr";
  closesAt: string;
  /** Set for a poll the finder already read this run (`discover.ts`): its totals are saved, so they aren't read twice. */
  pollKnown?: boolean;
}

type SocialQuestion = Pick<Question, "slug" | "closesAt" | "startsAt" | "category" | "resolution"> & { socialPosts?: unknown };

/** The official posts of questions still taking calls. A post entry that doesn't validate is skipped, never read. */
export function officialPosts(questions: readonly SocialQuestion[], now: Date): OfficialPost[] {
  return questions
    .filter((q) => isOpen(questionState(q as Question, now)))
    .flatMap((q) =>
      (Array.isArray(q.socialPosts) ? q.socialPosts : []).flatMap((raw) => {
        const post = socialPostSchema.safeParse(raw);
        return post.success ? [{ ...post.data, slug: q.slug, closesAt: callsCloseAt(q) }] : [];
      }),
    );
}

/**
 * What a read saves for a post. `pollEndsAt` and `postUrl` need the 20261121000000 migration; only the finders send
 * them. `postUrl` is our own post's address (Instagram and Threads ids don't make one on their own).
 */
export interface ReadPatch {
  readThrough?: Date;
  poll?: PollTotals;
  pollEndsAt?: string | null;
  postUrl?: string | null;
}

export type CountOutcome = "counted" | "duplicate" | "website_wins" | "older_reply" | "closed" | "before_link" | "unlinked" | "retry";

export interface CountStore {
  /** Platform ids of linked, unpaused accounts. Held in memory for the run only. */
  linkedIds(platform: Platform): Promise<ReadonlySet<string>>;
  /** Copies the question's close time to the database, which refuses late replies itself. */
  ensureWindow(slug: string, closesAt: string): Promise<void>;
  readThrough(platform: Platform, postId: string): Promise<Date | null>;
  saveRead(post: OfficialPost, patch: ReadPatch, now: Date): Promise<void>;
  /** "retry" when the database's 2-second rule refused it for now. */
  countReply(input: { platform: Platform; replyId: string; postId: string; authorId: string; slug: string; probability: number; at: string }): Promise<CountOutcome>;
  /** Pauses links not re-checked since the cut-off. Returns how many. Never deletes a link (AEGIS note 5). */
  pauseStaleLinks(now: Date): Promise<number>;
  /** Records "we replied to this account on this post" by keyed hash. False when it was already there. */
  claimAutoReply(platform: Platform, authorId: string, postId: string): Promise<boolean>;
}

export interface AutoReplyConfig {
  /** The neutral text per language, with the plain link already in it. */
  text: Record<"en" | "fr", string>;
  maxPerCycle: number;
}

export interface CountOptions {
  posts: readonly OfficialPost[];
  providers: Partial<Record<Platform, SocialProvider>>;
  store: CountStore;
  now: Date;
  /** Present only when SOCIAL_AUTO_REPLY is on. */
  autoReply?: AutoReplyConfig;
  /** Waits out the database's 2-second rule before one retry. Injected so tests don't sleep. */
  wait?: (ms: number) => Promise<void>;
}

export interface CountReport {
  posts: number;
  repliesRead: number;
  unlinkedDropped: number;
  outcomes: Partial<Record<CountOutcome, number>>;
  pollsRead: number;
  paused: number;
  autoReplies: number;
  /** Posts whose read stopped early (spend cap or a failed request); they are read again next cycle. */
  incomplete: number;
}

/** LEX's limit on the public auto-reply: a modest ceiling per daily cycle, on top of one per account per post. */
export const AUTO_REPLY_MAX_PER_CYCLE = 50;

/** One reply per author per post: the newest. Oldest first, so the database sees them in the order they were written. */
function latestPerAuthor(replies: readonly ParsedReply[]): ParsedReply[] {
  const latest = new Map<string, ParsedReply>();
  for (const r of replies) {
    const seen = latest.get(r.authorId);
    if (!seen || Date.parse(r.at) > Date.parse(seen.at)) latest.set(r.authorId, r);
  }
  return [...latest.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export async function countSocialReplies(opts: CountOptions): Promise<CountReport> {
  const { store, now } = opts;
  const wait = opts.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const report: CountReport = { posts: 0, repliesRead: 0, unlinkedDropped: 0, outcomes: {}, pollsRead: 0, paused: 0, autoReplies: 0, incomplete: 0 };
  const linkedCache = new Map<Platform, ReadonlySet<string>>();
  const tally = (o: CountOutcome) => (report.outcomes[o] = (report.outcomes[o] ?? 0) + 1);

  // The monthly re-check first, so a link that just went stale doesn't count today.
  report.paused = await store.pauseStaleLinks(now).catch(() => 0);

  for (const post of opts.posts) {
    const provider = opts.providers[post.platform];
    if (!provider) continue;
    report.posts += 1;
    try {
      const poll = post.pollKnown ? null : await provider.readPollTotals(post.postId, now);
      if (poll) {
        await store.saveRead(post, { poll }, now);
        report.pollsRead += 1;
      }

      let linked = linkedCache.get(post.platform);
      if (!linked) {
        linked = await store.linkedIds(post.platform);
        linkedCache.set(post.platform, linked);
      }
      const autoReply = opts.autoReply && provider.postReply ? opts.autoReply : undefined;
      // Nobody linked on this platform and no auto-reply: no reply could matter, so nothing is read (or paid for).
      if (linked.size === 0 && !autoReply) continue;

      await store.ensureWindow(post.slug, post.closesAt);
      const since = await store.readThrough(post.platform, post.postId);
      const read = await provider.readReplies(post.postId, since, now);
      report.repliesRead += read.replies.length;

      const mine = read.replies.filter((r) => linked.has(r.authorId));
      const others = read.replies.filter((r) => !linked.has(r.authorId));
      report.unlinkedDropped += others.length;

      let failed = false;
      for (const reply of latestPerAuthor(mine)) {
        const input = { platform: post.platform, replyId: reply.replyId, postId: post.postId, authorId: reply.authorId, slug: post.slug, probability: REPLY_PROBABILITY[reply.vote], at: reply.at };
        let outcome = await store.countReply(input);
        if (outcome === "retry") {
          await wait(2_100);
          outcome = await store.countReply(input);
        }
        if (outcome === "retry") failed = true;
        tally(outcome);
      }

      if (autoReply) {
        for (const reply of latestPerAuthor(others)) {
          if (report.autoReplies >= autoReply.maxPerCycle) break;
          // Claim first: if the post then fails, the person simply gets no reply, never two.
          if (!(await store.claimAutoReply(post.platform, reply.authorId, post.postId))) continue;
          if (await provider.postReply!(reply.replyId, autoReply.text[post.locale])) report.autoReplies += 1;
        }
      }

      // Move the reader's place only after a full, clean read; otherwise the same replies are read again next cycle
      // (the ledger makes that harmless).
      const newest = read.replies.reduce((max, r) => Math.max(max, Date.parse(r.at)), 0);
      if (!read.complete || failed) report.incomplete += 1;
      else if (newest > 0) await store.saveRead(post, { readThrough: new Date(newest) }, now);
    } catch {
      report.incomplete += 1; // one post failing never stops the others
    }
  }
  return report;
}
