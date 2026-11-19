/**
 * The daily sweep of deleted replies (LEX: daily, not weekly). A reply from a linked account counts as a call in
 * "Canada says"; once its author deletes it on the platform it must stop counting. Each day the sweep asks the
 * platform about every reply still in the count on our open questions' official posts and hands each one that is
 * gone to the database, which decides what follows:
 *
 * - the person also made a call on the site for that question: the site call stands, only the reply is marked;
 * - an earlier reply of theirs is still up: the call goes back to that reply;
 * - otherwise the call is removed, and the person no longer counts on that question.
 *
 * After a question closes a call is part of the record, the same as on the website, so closed questions are not
 * swept and the database refuses the change itself.
 *
 * A reply is never deleted on the spot (LEX). It carries one of two markers, and only a reply with neither is live
 * and can set a call:
 *
 * - withdrawn: a run that went ahead found it gone (remove_social_reply). It stops counting at once and is not
 *   checked again. For 7 days zack can put it back by hand (restore_social_reply() in the database); the first run
 *   after those 7 days deletes it for real (purge_withdrawn_social_replies).
 * - held: a HALTED run found it gone (hold_social_reply). It is hidden from "Canada says" at once, so a withdrawal
 *   never waits on a person, and it is not removed. The sweep keeps checking held replies: a later run that goes
 *   ahead withdraws the ones still gone, and any run counts again the ones the platform reports back
 *   (release_social_reply), but only after a complete answer for that post. A held reply is never put back
 *   automatically once its question has closed.
 *
 * A restore by hand also works after the close, for a reply written before it (LEX): the call that comes back was
 * made in time, and is scored like any other. The database logs every restore, by hand or by the sweep, with the
 * name the person gave. Both logs are kept 12 months, then purged by this run (purge_social_audit_logs).
 *
 * Two guards from AEGIS. A run may take at most half of what is left under the monthly cap, so the count of new
 * replies always has room. And if one run reports more than max(10, 20% of the replies checked) as deleted, it
 * withdraws nothing, holds what it found, sets `halted` in the report and leaves it for a person: that pattern looks
 * like the platform answering wrongly.
 *
 * The way past a halt (AEGIS): once a person has looked, zack runs approve_social_sweep(name, reason) by hand in the
 * database; both are required and kept in the approval log (LEX).
 * That approval lasts 36 hours and is used up by the next run whose ceiling trips, which then withdraws what it found
 * and says `approvedOverride` in its report. A run under the ceiling never asks for the approval, so it can't use
 * one up. There is no env var and no route for this. The database logs each use, and the run adds how many replies
 * it took out once it is done (LEX).
 *
 * A halt stays open until a run that was not halted leaves nothing held on an open question. The database keeps
 * when it first happened; a run that finds it still open 72 hours later says `haltUnresolved72h`, and the cycle
 * logs that code so zack hears about it again (LEX).
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

/**
 * What remove_social_reply() and hold_social_reply() answer, plus "retry" for the database's 2-second rule on calls.
 * "held" is hold_social_reply() finding the reply held already.
 */
export const removeOutcomes = ["unknown", "closed", "held", "removed", "restored", "call_removed"] as const;
export type RemoveOutcome = (typeof removeOutcomes)[number] | "retry";

/** What release_social_reply() answers (the same words restore_social_reply() uses), plus "retry". */
export const releaseOutcomes = ["unknown", "live", "expired", "closed", "after_close", "website_wins", "older_reply", "counted"] as const;
export type ReleaseOutcome = (typeof releaseOutcomes)[number] | "retry";

export interface SweepStore {
  /** Ids of the replies on one official post that the sweep still checks (live or held, never withdrawn), in a stable order, at most `limit`. */
  ledgerReplyIds(platform: Platform, postId: string, limit: number): Promise<string[]>;
  /** Ids of the replies on one official post that a halted run is holding, at most `limit`. */
  heldReplyIds(platform: Platform, postId: string, limit: number): Promise<string[]>;
  /**
   * Withdraws a deleted reply: it stops counting at once and is kept, marked, for 7 days. The database keeps a site
   * call, falls back to an earlier reply, or removes the call.
   */
  removeReply(platform: Platform, replyId: string): Promise<RemoveOutcome>;
  /** Holds a reply a halted run found gone: hidden from the count in the same way, and not withdrawn. */
  holdReply(platform: Platform, replyId: string): Promise<RemoveOutcome>;
  /** Counts a held reply again, once the platform reports it still up. Never touches a withdrawn reply. */
  releaseReply(platform: Platform, replyId: string): Promise<ReleaseOutcome>;
  /** Deletes for real the replies withdrawn more than 7 days ago (the database's clock). Returns how many. */
  purgeWithdrawn(): Promise<number>;
  /** Deletes rows older than 12 months from the approval log and the restore log (LEX). Returns how many. */
  purgeAuditLogs(): Promise<number>;
  /** A halted run says so. Answers when the open halt first happened, or null when the database can't say. */
  noteHalt(): Promise<Date | null>;
  /** A run that was not halted asks whether a halt is still open: when it first happened, or null once nothing is held. */
  settleHalt(): Promise<Date | null>;
  /**
   * Uses up the hand-given approval for a run over the removal ceiling (consume_social_sweep_approval() in the
   * database, which also logs the use). True only when there was one and it was still in time. Single-use: asking
   * clears it either way.
   */
  consumeSweepApproval(): Promise<boolean>;
  /** Adds to the approval log how many replies the approved run took out, once its removals are done. */
  recordApprovedRemovals(removed: number): Promise<void>;
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
  /** True when the removal ceiling stopped the run: nothing was withdrawn, and a person must look (AEGIS). */
  halted: boolean;
  /** Halted runs only: how many of the replies found gone are now hidden from the count while a person decides (LEX). */
  held?: number;
  /** Present only when above zero: held replies the platform reports back, counted again this run. */
  released?: number;
  /** Present only when above zero: replies withdrawn more than 7 days ago that this run deleted for real. */
  purged?: number;
  /** Present, and true, only when a halt is still open 72 hours or more after it first happened (LEX). */
  haltUnresolved72h?: true;
  /**
   * Present, and true, only when the removal ceiling tripped and a hand-given approval let the run go ahead
   * (AEGIS). `halted` is then false. Absent on every other run.
   */
  approvedOverride?: true;
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

/** A halt still open this long after it first happened is reported again, every run, until it is settled (LEX). */
export const SWEEP_HALT_ALERT_HOURS = 72;

/** How long a withdrawn reply is kept before it is deleted for real. The database enforces it; this is for readers and tests. */
export const SWEEP_WITHDRAWN_KEEP_DAYS = 7;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** The removal ceiling (AEGIS): more deleted replies than this in one run is not believed without a person looking. */
export function removalCeiling(checked: number): number {
  return Math.max(SWEEP_HALT_MIN, checked / SWEEP_HALT_ONE_IN);
}

export async function sweepDeletedReplies(opts: SweepOptions): Promise<SweepReport> {
  const { store, now } = opts;
  const wait = opts.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const report: SweepReport = { posts: 0, checked: 0, gone: 0, outcomes: {}, incomplete: 0, halted: false };

  // 0. Replies withdrawn more than 7 days ago are deleted for real. A failure here waits for tomorrow's run.
  const purged = await store.purgeWithdrawn().catch(() => 0);
  if (purged > 0) report.purged = purged;
  // The approval log and the restore log are kept 12 months (LEX). Nothing to report: they aren't replies.
  await store.purgeAuditLogs().catch(() => 0);

  /** A halt that is still open 72 hours after it first happened is said again, on every run, until it is settled. */
  const checkHaltAge = async (halted: boolean): Promise<void> => {
    const since = await (halted ? store.noteHalt() : store.settleHalt()).catch(() => null);
    if (since && now.getTime() - since.getTime() >= SWEEP_HALT_ALERT_HOURS * HOUR_MS) report.haltUnresolved72h = true;
  };

  const posts = opts.posts.filter((p) => opts.providers[p.platform]?.findDeleted);
  report.posts = posts.length;
  if (posts.length === 0) {
    await checkHaltAge(false);
    return report;
  }

  let left = Math.max(0, Math.floor(opts.maxReplies ?? SWEEP_MAX_REPLIES_PER_RUN));
  // What each platform's checks may still take from its spend cap this run (absent: no limit of the sweep's own).
  const allowance = new Map<Platform, number>();
  for (const [platform, micros] of Object.entries(opts.allowanceMicros ?? {})) allowance.set(platform as Platform, Math.max(0, Math.floor(micros)));
  // A platform whose check stopped early (cap, share or a failed request) isn't asked again this run.
  const stopped = new Set<Platform>();
  const first = Math.floor(now.getTime() / DAY_MS) % posts.length;

  // 1. Ask the platforms. Nothing is changed yet.
  const found: Array<{ post: OfficialPost; replyIds: string[] }> = [];
  const back: Array<{ post: OfficialPost; replyIds: string[] }> = [];
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
      const held = await store.heldReplyIds(post.platform, post.postId, batch.length);
      const check = await opts.providers[post.platform]!.findDeleted!(batch, now, allowance.get(post.platform));
      left -= batch.length;
      report.checked += check.checked;
      const room = allowance.get(post.platform);
      if (room !== undefined) allowance.set(post.platform, Math.max(0, room - Math.max(0, check.spentMicros)));
      // Only ids we asked about are ever marked, whatever the provider hands back.
      const replyIds = [...new Set(check.gone.filter((g) => batch.includes(g)))];
      report.gone += replyIds.length;
      if (replyIds.length > 0) found.push({ post, replyIds });
      // A held reply counts again only when the platform answered for every id we asked about and didn't list it.
      if (check.complete && check.checked >= batch.length) {
        const stillUp = [...new Set(held)].filter((h) => batch.includes(h) && !replyIds.includes(h));
        if (stillUp.length > 0) back.push({ post, replyIds: stillUp });
      }
      if (!check.complete) stopped.add(post.platform);
      if (!check.complete || ids.length > batch.length) report.incomplete += 1;
    } catch {
      report.incomplete += 1; // one post failing never stops the others
    }
  }

  // 2. The removal ceiling: too many at once looks like the platform answering wrongly, not like people deleting.
  // Nothing is withdrawn unless a person has approved it by hand (approve_social_sweep() in the database). The
  // approval is asked for here and nowhere else, so a run under the ceiling can't use it up. If the database can't
  // answer, that is no approval. Without one the run is halted; the cycle report says so, and a person decides.
  if (report.gone > removalCeiling(report.checked)) {
    const approved = await store.consumeSweepApproval().catch(() => false);
    if (approved === true) report.approvedOverride = true;
    else report.halted = true;
  }

  /** One database change for one reply, with one retry after the database's 2-second rule. Null when it failed. */
  async function attempt<T extends string>(change: () => Promise<T | "retry">): Promise<T | "retry" | null> {
    try {
      let outcome = await change();
      if (outcome === "retry") {
        await wait(2_100);
        outcome = await change();
      }
      return outcome;
    } catch {
      return null; // one reply failing never stops the others; it is found again tomorrow
    }
  }

  // 3. Hand each deleted reply to the database. A halted run holds them: hidden from "Canada says" at once, so a
  // withdrawal never waits on a person (LEX), and nothing is removed. Any other run withdraws them.
  let tookOut = 0;
  if (report.halted) report.held = 0;
  for (const { post, replyIds } of found) {
    let failed = false;
    for (const replyId of replyIds) {
      const outcome = await attempt(() => (report.halted ? store.holdReply(post.platform, replyId) : store.removeReply(post.platform, replyId)));
      if (outcome === null || outcome === "retry") failed = true;
      if (outcome === null) continue;
      const out = outcome === "held" || outcome === "removed" || outcome === "restored" || outcome === "call_removed";
      if (report.halted) {
        if (out) report.held = (report.held ?? 0) + 1;
      } else {
        report.outcomes[outcome] = (report.outcomes[outcome] ?? 0) + 1;
        if (out) tookOut += 1;
      }
    }
    if (failed) report.incomplete += 1;
  }

  // 4. Held replies the platform reports back count again, halted run or not.
  for (const { post, replyIds } of back) {
    let failed = false;
    for (const replyId of replyIds) {
      const outcome = await attempt(() => store.releaseReply(post.platform, replyId));
      if (outcome === null || outcome === "retry") failed = true;
      if (outcome === "counted" || outcome === "website_wins" || outcome === "older_reply") report.released = (report.released ?? 0) + 1;
    }
    if (failed) report.incomplete += 1;
  }

  // 5. The approval log gets the number this approved run took out (LEX). The use itself was logged when it was asked for.
  if (report.approvedOverride) await store.recordApprovedRemovals(tookOut).catch(() => undefined);

  // 6. The halt: opened or kept by a halted run, closed by any other run once nothing is held.
  await checkHaltAge(report.halted);
  return report;
}
