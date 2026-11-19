/**
 * The daily sweep of deleted replies (LEX: daily, not weekly). A reply from a linked account counts as a call in
 * "Canada says"; once its author deletes it on the platform it must stop counting. Each day the sweep asks the
 * platform about every counted reply on our open questions' official posts and hands each one that is gone to the
 * database (remove_social_reply), which decides what follows:
 *
 * - the person also made a call on the site for that question: the site call stands, only the ledger row goes;
 * - an earlier reply of theirs is still up: the call goes back to that reply;
 * - otherwise the call is removed, and the person no longer counts on that question.
 *
 * After a question closes a call is part of the record, the same as on the website, so closed questions are not
 * swept and the database refuses the change itself.
 *
 * Two guards from AEGIS. A run may take at most half of what is left under the monthly cap, so the count of new
 * replies always has room. And if one run reports more than max(10, 20% of the replies checked) as deleted, it
 * removes nothing, sets `halted` in the report and leaves it for a person: that pattern looks like the platform
 * answering wrongly, and a wrongly removed call can't always be counted again.
 *
 * Cost and limits: on X each reply checked is a paid read, taken from the same monthly spend cap as every other
 * read (the provider reserves before each request and stops when the cap refuses). X's lookup takes 100 ids a
 * request, and a run checks at most SWEEP_MAX_REPLIES_PER_RUN replies. When a run can't finish, the starting post
 * moves on by one each day, so every post still gets its turn.
 *
 * Framework-free: the providers and the store are injected. The report is counts only.
 */
import type { OfficialPost } from "./count";
import type { Platform, SocialProvider } from "./types";

/** What remove_social_reply() answers, plus "retry" for the database's 2-second rule on calls. */
export const removeOutcomes = ["unknown", "closed", "removed", "restored", "call_removed"] as const;
export type RemoveOutcome = (typeof removeOutcomes)[number] | "retry";

export interface SweepStore {
  /** Ids of the counted replies on one official post, in a stable order, at most `limit`. */
  ledgerReplyIds(platform: Platform, postId: string, limit: number): Promise<string[]>;
  /** Takes a deleted reply out. The database keeps a site call, falls back to an earlier reply, or removes the call. */
  removeReply(platform: Platform, replyId: string): Promise<RemoveOutcome>;
}

export interface SweepOptions {
  posts: readonly OfficialPost[];
  providers: Partial<Record<Platform, SocialProvider>>;
  store: SweepStore;
  now: Date;
  /** Defaults to SWEEP_MAX_REPLIES_PER_RUN. */
  maxReplies?: number;
  /**
   * The most each platform's checks may take from its spend cap this run, in millionths of a US dollar. The cycle
   * passes SWEEP_BUDGET_SHARE of what is left under the monthly cap, so the sweep can't starve the count.
   */
  allowanceMicros?: Partial<Record<Platform, number>>;
  /** Waits out the database's 2-second rule before one retry. Injected so tests don't sleep. */
  wait?: (ms: number) => Promise<void>;
}

export interface SweepReport {
  /** Posts on a platform that can be checked. */
  posts: number;
  /** Counted replies the platform answered for. */
  checked: number;
  /** Replies the platform reports as deleted. */
  gone: number;
  /** What the database did with each: "removed" (ledger only: a site call or a newer reply stands), "restored", "call_removed"… */
  outcomes: Partial<Record<RemoveOutcome, number>>;
  /** Posts not fully swept this run (spend cap, the per-run ceiling or a failure); they are swept on a later day. */
  incomplete: number;
  /** True when the removal ceiling stopped the run: nothing was removed, and a person must look (AEGIS). */
  halted: boolean;
}

/**
 * The most replies one run checks: 50 lookup requests on X, far inside its 15-minute request limit, and a bound on
 * what one day can take from the spend cap (5,000 × US$0.005 = US$25 at most).
 */
export const SWEEP_MAX_REPLIES_PER_RUN = 5_000;

/** The sweep may take at most this share of what is left under a platform's monthly cap, per run (AEGIS). */
export const SWEEP_BUDGET_SHARE = 0.5;

/** The removal ceiling: a run removes nothing when more than max(10, 20% of the replies checked) are reported gone. */
export const SWEEP_HALT_MIN = 10;
/** One in five, kept as a whole number so the limit is exact. */
export const SWEEP_HALT_ONE_IN = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The removal ceiling (AEGIS): more deleted replies than this in one run is not believed without a person looking. */
export function removalCeiling(checked: number): number {
  return Math.max(SWEEP_HALT_MIN, checked / SWEEP_HALT_ONE_IN);
}

export async function sweepDeletedReplies(opts: SweepOptions): Promise<SweepReport> {
  const { store, now } = opts;
  const wait = opts.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const report: SweepReport = { posts: 0, checked: 0, gone: 0, outcomes: {}, incomplete: 0, halted: false };
  const posts = opts.posts.filter((p) => opts.providers[p.platform]?.findDeleted);
  report.posts = posts.length;
  if (posts.length === 0) return report;

  let left = Math.max(0, Math.floor(opts.maxReplies ?? SWEEP_MAX_REPLIES_PER_RUN));
  // What each platform's checks may still take from its spend cap this run (absent: no limit of the sweep's own).
  const allowance = new Map<Platform, number>();
  for (const [platform, micros] of Object.entries(opts.allowanceMicros ?? {})) allowance.set(platform as Platform, Math.max(0, Math.floor(micros)));
  // A platform whose check stopped early (cap, share or a failed request) isn't asked again this run.
  const stopped = new Set<Platform>();
  const first = Math.floor(now.getTime() / DAY_MS) % posts.length;

  // 1. Ask the platforms. Nothing is removed yet.
  const found: Array<{ post: OfficialPost; replyIds: string[] }> = [];
  for (const post of [...posts.slice(first), ...posts.slice(0, first)]) {
    if (left <= 0 || stopped.has(post.platform)) {
      report.incomplete += 1;
      continue;
    }
    try {
      // One more than the room left, to tell "all of them" from "there are more".
      const ids = await store.ledgerReplyIds(post.platform, post.postId, left + 1);
      if (ids.length === 0) continue;
      const batch = ids.slice(0, left);
      const check = await opts.providers[post.platform]!.findDeleted!(batch, now, allowance.get(post.platform));
      left -= batch.length;
      report.checked += check.checked;
      const room = allowance.get(post.platform);
      if (room !== undefined) allowance.set(post.platform, Math.max(0, room - Math.max(0, check.spentMicros)));
      // Only ids we asked about are ever removed, whatever the provider hands back.
      const replyIds = [...new Set(check.gone.filter((g) => batch.includes(g)))];
      report.gone += replyIds.length;
      if (replyIds.length > 0) found.push({ post, replyIds });
      if (!check.complete) stopped.add(post.platform);
      if (!check.complete || ids.length > batch.length) report.incomplete += 1;
    } catch {
      report.incomplete += 1; // one post failing never stops the others
    }
  }

  // 2. The removal ceiling: too many at once looks like the platform answering wrongly, not like people deleting.
  // Nothing is removed this run; the cycle report says so, and a person decides.
  if (report.gone > removalCeiling(report.checked)) {
    report.halted = true;
    return report;
  }

  // 3. Hand each deleted reply to the database.
  for (const { post, replyIds } of found) {
    let failed = false;
    for (const replyId of replyIds) {
      try {
        let outcome = await store.removeReply(post.platform, replyId);
        if (outcome === "retry") {
          await wait(2_100);
          outcome = await store.removeReply(post.platform, replyId);
        }
        if (outcome === "retry") failed = true;
        report.outcomes[outcome] = (report.outcomes[outcome] ?? 0) + 1;
      } catch {
        failed = true; // one reply failing never stops the others; it is found again tomorrow
      }
    }
    if (failed) report.incomplete += 1;
  }
  return report;
}
