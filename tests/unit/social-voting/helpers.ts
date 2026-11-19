import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CountOutcome, CountStore, OfficialPost } from "@/lib/social-voting/count";
import type { SpendStore } from "@/lib/social-voting/spend";
import type { ReleaseOutcome, RemoveOutcome, SweepStore } from "@/lib/social-voting/sweep";
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
  async spent(platform: Platform, month: string): Promise<number> {
    return this.totals.get(`${platform}:${month}`) ?? 0;
  }
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

/** One ledger row. A reply is live when it has neither marker; `withdrawnAt` and `heldAt` are never both set. */
type Ledger = { platform: Platform; replyId: string; postId: string; userId: string; slug: string; probability: number; at: string; withdrawnAt?: Date; heldAt?: Date };

/** One row of the approval log, as the database appends them. */
type Approval = { approvedAt: Date; approvedBy: string; approvedName: string; approvedReason: string; approvedUntil: Date };
export type ApprovalLogRow =
  | ({ event: "given" } & Approval)
  | ({ event: "used"; usedAt: Date; inTime: boolean } & Approval)
  | ({ event: "removed"; usedAt: Date; removed: number } & Approval);

/** One row of the restore log: every restore, by hand or by the sweep, whatever it answered. */
export type RestoreLogRow = {
  restoredAt: Date;
  restoredBy: string;
  /** The name the person gave; "system" for the sweep. */
  restoredName: string;
  origin: "hand" | "sweep";
  platform: Platform;
  /** Personal information: set to null when the person deletes their account. */
  replyId: string | null;
  /** Only there to find the row on account deletion; null when no such reply was found. */
  userId: string | null;
  result: Exclude<ReleaseOutcome, "retry">;
  afterClose: boolean;
};

const LOG_KEEP_MONTHS = 12;
const monthsBefore = (d: Date, months: number): number => {
  const cut = new Date(d);
  cut.setUTCMonth(cut.getUTCMonth() - months);
  return cut.getTime();
};

const isLive = (l: Ledger): boolean => !l.withdrawnAt && !l.heldAt;
const HOUR_MS = 60 * 60 * 1000;
const KEEP_MS = 7 * 24 * HOUR_MS;

/**
 * An in-memory stand-in for the database side, following count_social_reply() in the sprint-11 migration: linked
 * accounts only, idempotent on the reply id, a website call wins, the latest reply wins. `written` records every
 * value any method was given, so a test can prove what could ever have been stored. The sweep's side follows
 * 20261120001000_social_sweep_withdrawals.sql, branch for branch: `removeReply` and `holdReply` are
 * mark_social_reply_gone(), `restoreReply` and `releaseReply` are restore_social_reply() and
 * release_social_reply() (both put_back_social_reply()), and the rest carry the names of their functions in a comment.
 */
export class MemoryStore implements CountStore, SweepStore {
  links = new Map<string, string>(); // "platform:platformUserId" -> user id
  ledger: Ledger[] = [];
  /** "user:slug". `madeAt` is set only on a call restored after the close: it carries the reply's own time. */
  calls = new Map<string, { probability: number; source: string; madeAt?: string }>();
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
  /** The hand-given sweep approval as the database keeps it: the time it ends, or null when there is none. */
  sweepApprovedUntil: Date | null = null;
  /** How many times the sweep asked for the approval. */
  approvalAsked = 0;
  approvalFails = false;
  /** When and by which database role the approval in `sweepApprovedUntil` was given (null for one set directly). */
  sweepApproval: { approvedAt: Date; approvedBy: string; approvedName: string; approvedReason: string } | null = null;
  /** The append-only restore log. */
  restoreLog: RestoreLogRow[] = [];
  /** The append-only approval log: rows are only ever added. */
  approvalLog: ApprovalLogRow[] = [];
  recordFails = false;
  purgeFails = false;
  /** The open halt as the database keeps it: when the first halted run happened, or null. */
  firstHaltedAt: Date | null = null;

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
    if (this.ledger.some((l) => isLive(l) && l.userId === userId && l.slug === input.slug && Date.parse(l.at) > Date.parse(input.at))) return "older_reply";
    this.calls.set(key, { probability: input.probability, source: input.platform });
    return "counted";
  }
  /** The replies that can set a call: neither held nor withdrawn. */
  live(): Ledger[] {
    return this.ledger.filter(isLive);
  }
  row(replyId: string): Ledger | undefined {
    return this.ledger.find((l) => l.replyId === replyId);
  }
  async ledgerReplyIds(platform: Platform, postId: string, limit: number): Promise<string[]> {
    return this.ledger
      .filter((l) => l.platform === platform && l.postId === postId && !l.withdrawnAt)
      .map((l) => l.replyId)
      .sort()
      .slice(0, limit);
  }
  async heldReplyIds(platform: Platform, postId: string, limit: number): Promise<string[]> {
    return this.ledger
      .filter((l) => l.platform === platform && l.postId === postId && !l.withdrawnAt && l.heldAt)
      .map((l) => l.replyId)
      .sort()
      .slice(0, limit);
  }
  private latestReply(userId: string, slug: string): Ledger | undefined {
    return this.live().filter((l) => l.userId === userId && l.slug === slug).sort((x, y) => Date.parse(y.at) - Date.parse(x.at))[0];
  }
  private open(slug: string): boolean {
    const closes = this.windows.get(slug);
    return Boolean(closes) && this.clock.getTime() < Date.parse(closes!);
  }
  /** mark_social_reply_gone(): the reply is marked, never deleted, and the call follows the latest live reply. */
  private markGone(platform: Platform, replyId: string, hold: boolean): RemoveOutcome {
    this.written.push({ platform, replyId });
    if (this.removeFails.has(replyId)) throw new Error("remove unavailable");
    if (this.removeRetryOnce.delete(replyId)) return "retry";
    const gone = this.ledger.find((l) => l.platform === platform && l.replyId === replyId);
    if (!gone || gone.withdrawnAt) return "unknown";
    if (hold && gone.heldAt) return "held";
    if (!this.open(gone.slug)) return "closed";
    const key = `${gone.userId}:${gone.slug}`;
    const source = this.calls.get(key)?.source;
    const wasLatest = this.latestReply(gone.userId, gone.slug) === gone;
    if (hold) gone.heldAt = this.clock;
    else {
      gone.withdrawnAt = this.clock;
      delete gone.heldAt;
    }
    // A website call, a newer reply, or an earlier hold already settled the call: nothing else changes.
    if (!source || source === "web" || !wasLatest) return "removed";
    const latest = this.latestReply(gone.userId, gone.slug);
    if (latest) {
      this.calls.set(key, { probability: latest.probability, source: latest.platform });
      return "restored";
    }
    this.calls.delete(key);
    return "call_removed";
  }
  async removeReply(platform: Platform, replyId: string): Promise<RemoveOutcome> {
    return this.markGone(platform, replyId, false);
  }
  async holdReply(platform: Platform, replyId: string): Promise<RemoveOutcome> {
    return this.markGone(platform, replyId, true);
  }
  /**
   * put_back_social_reply(): a held reply, or one withdrawn in the last 7 days, is live again and the call is
   * re-derived. After the close: by hand only, only for a reply written before the close, and the one call write goes
   * through on a pass (the calls trigger refuses every other write after the close). Every run is logged.
   */
  private putBack(platform: Platform, replyId: string, origin: "hand" | "sweep", name: string, by: string): Exclude<ReleaseOutcome, "retry"> {
    let closed = false;
    const userId = this.ledger.find((l) => l.platform === platform && l.replyId === replyId)?.userId ?? null;
    const work = (): Exclude<ReleaseOutcome, "retry"> => {
      const back = this.ledger.find((l) => l.platform === platform && l.replyId === replyId);
      if (!back) return "unknown";
      if (isLive(back)) return "live";
      if (back.withdrawnAt && back.withdrawnAt.getTime() <= this.clock.getTime() - KEEP_MS) return "expired";
      const closes = this.windows.get(back.slug);
      closed = !this.open(back.slug);
      if (closed) {
        if (!closes || origin !== "hand") return "closed";
        if (Date.parse(back.at) >= Date.parse(closes)) return "after_close";
        if (back.heldAt && Date.parse(closes) <= this.clock.getTime() - KEEP_MS) return "expired";
      }
      delete back.withdrawnAt;
      delete back.heldAt;
      const key = `${back.userId}:${back.slug}`;
      if (this.calls.get(key)?.source === "web") return "website_wins";
      if (this.latestReply(back.userId, back.slug) !== back) return "older_reply";
      // enforce_call_rules(): after the close the write carries the time the call was made, not the time of the restore.
      this.calls.set(key, { probability: back.probability, source: back.platform, ...(closed ? { madeAt: back.at } : {}) });
      return "counted";
    };
    const result = work();
    this.restoreLog.push({ restoredAt: this.clock, restoredBy: by, restoredName: name, origin, platform, replyId, userId, result, afterClose: closed });
    return result;
  }
  /** restore_social_reply(platform, reply, name): zack's way back, by hand, before or after the close. The name is required. */
  restoreReply(platform: Platform, replyId: string, name: string | null = "zack", by = "postgres"): Exclude<ReleaseOutcome, "retry"> {
    const who = (name ?? "").trim();
    if (who === "") throw new Error("restore_social_reply needs a name");
    if (who.length > 80) throw new Error("name too long (80)");
    return this.putBack(platform, replyId, "hand", who, by);
  }
  /**
   * Account deletion: the person's calls and ledger rows go by cascade, and forget_social_restores_on_delete()
   * blanks the reply id and the person's id in their restore-log rows. Everything else in those rows stays.
   */
  deleteAccount(userId: string): void {
    this.ledger = this.ledger.filter((l) => l.userId !== userId);
    for (const key of [...this.calls.keys()]) if (key.startsWith(`${userId}:`)) this.calls.delete(key);
    for (const [key, owner] of [...this.links]) if (owner === userId) this.links.delete(key);
    this.restoreLog.forEach((r, i) => {
      if (r.userId === userId) this.updateRestoreLog(i, { replyId: null, userId: null });
    });
  }
  /**
   * social_reply_restore_log_guard() on UPDATE: the two personal columns may end up null, and every other column
   * must be the same as before. Anything else is refused.
   */
  updateRestoreLog(index: number, patch: Partial<RestoreLogRow>): void {
    const old = this.restoreLog[index];
    if (!old) return;
    const next = { ...old, ...patch };
    const same = (["restoredAt", "restoredBy", "restoredName", "origin", "platform", "result", "afterClose"] as const).every((k) =>
      next[k] instanceof Date && old[k] instanceof Date ? (next[k] as Date).getTime() === (old[k] as Date).getTime() : next[k] === old[k],
    );
    if (next.replyId !== null || next.userId !== null || !same) throw new Error("social_reply_restore_log is append-only: only reply_id and user_id may be set to null");
    this.restoreLog[index] = next;
  }
  /** Both guards on DELETE: only a row whose own time is more than 12 months back. */
  deleteLogRow(log: "approval" | "restore", index: number): void {
    const stamp = log === "approval" ? this.approvalStamp(this.approvalLog[index]) : this.restoreLog[index]?.restoredAt;
    if (!stamp) return;
    if (!(stamp.getTime() < monthsBefore(this.clock, LOG_KEEP_MONTHS))) throw new Error(`social_${log === "approval" ? "sweep_approval" : "reply_restore"}_log is append-only until a row is 12 months old`);
    if (log === "approval") this.approvalLog.splice(index, 1);
    else this.restoreLog.splice(index, 1);
  }
  /** social_log_append_only() on TRUNCATE: always refused. */
  truncateLog(log: "approval" | "restore"): void {
    throw new Error(`social_${log === "approval" ? "sweep_approval" : "reply_restore"}_log is append-only`);
  }
  /** logged_at of an approval-log row: when that row was written. */
  private approvalStamp(r: ApprovalLogRow | undefined): Date | undefined {
    if (!r) return undefined;
    return r.event === "given" ? r.approvedAt : r.usedAt;
  }
  /** purge_social_audit_logs(): rows of either log older than 12 months go. */
  async purgeAuditLogs(): Promise<number> {
    if (this.purgeFails) throw new Error("purge unavailable");
    const cut = monthsBefore(this.clock, LOG_KEEP_MONTHS);
    const before = this.approvalLog.length + this.restoreLog.length;
    // One guarded delete per row past the 12 months, as the database does it.
    for (let i = this.approvalLog.length - 1; i >= 0; i--) if (this.approvalStamp(this.approvalLog[i])!.getTime() < cut) this.deleteLogRow("approval", i);
    for (let i = this.restoreLog.length - 1; i >= 0; i--) if (this.restoreLog[i]!.restoredAt.getTime() < cut) this.deleteLogRow("restore", i);
    return before - this.approvalLog.length - this.restoreLog.length;
  }
  /** release_social_reply(): the sweep's narrower way back, for a held reply on an open question only. */
  async releaseReply(platform: Platform, replyId: string): Promise<ReleaseOutcome> {
    this.written.push({ platform, replyId });
    if (!this.ledger.some((l) => l.platform === platform && l.replyId === replyId && l.heldAt)) return "unknown";
    return this.putBack(platform, replyId, "sweep", "system", "authenticator");
  }
  /** purge_withdrawn_social_replies(): the real deletion, 7 days after a withdrawal. */
  async purgeWithdrawn(): Promise<number> {
    if (this.purgeFails) throw new Error("purge unavailable");
    const before = this.ledger.length;
    this.ledger = this.ledger.filter((l) => !(l.withdrawnAt && l.withdrawnAt.getTime() < this.clock.getTime() - KEEP_MS));
    return before - this.ledger.length;
  }
  /** note_social_sweep_halt(): the first halt's time is kept; later halts don't move it. */
  async noteHalt(): Promise<Date | null> {
    this.firstHaltedAt ??= this.clock;
    return this.firstHaltedAt;
  }
  /** settle_social_sweep_halt(): the halt is over only when nothing is held on an open question. */
  async settleHalt(): Promise<Date | null> {
    if (this.ledger.some((l) => l.heldAt && this.open(l.slug))) return this.noteHalt();
    this.firstHaltedAt = null;
    return null;
  }
  /**
   * approve_social_sweep(name, reason): what zack runs by hand. Both are required; a blank one is refused and
   * nothing is approved. 36 hours, and the log notes when, the name, the reason and the database role.
   */
  approveSweep(name: string | null = "zack", reason: string | null = "Checked by hand: really deleted.", by = "postgres"): Date {
    const who = (name ?? "").trim();
    const why = (reason ?? "").trim();
    if (who === "" || why === "") throw new Error("approve_social_sweep needs a name and a reason");
    if (who.length > 80 || why.length > 500) throw new Error("name (80) or reason (500) too long");
    const until = new Date(this.clock.getTime() + 36 * HOUR_MS);
    this.sweepApprovedUntil = until;
    this.sweepApproval = { approvedAt: this.clock, approvedBy: by, approvedName: who, approvedReason: why };
    this.approvalLog.push({ event: "given", ...this.sweepApproval, approvedUntil: until });
    return until;
  }
  /** Follows consume_social_sweep_approval(): the approval always goes, counts only while still in time, and its use is logged. */
  async consumeSweepApproval(): Promise<boolean> {
    this.approvalAsked += 1;
    if (this.approvalFails) throw new Error("approval unavailable");
    const until = this.sweepApprovedUntil;
    const given = this.sweepApproval;
    this.sweepApprovedUntil = null;
    this.sweepApproval = null;
    if (until === null) return false;
    const inTime = until.getTime() > this.clock.getTime();
    // An approval from before the log existed has no time or role of its own: the time is worked out from its end.
    this.approvalLog.push({
      event: "used",
      approvedAt: given?.approvedAt ?? new Date(until.getTime() - 36 * HOUR_MS),
      approvedBy: given?.approvedBy ?? "unknown",
      approvedName: given?.approvedName ?? "unknown",
      approvedReason: given?.approvedReason ?? "unknown",
      approvedUntil: until,
      usedAt: new Date(this.clock),
      inTime,
    });
    return inTime;
  }
  /** record_social_sweep_removals(): once per use, and only for a use that was in time. */
  async recordApprovedRemovals(removed: number): Promise<void> {
    if (this.recordFails) throw new Error("approval log unavailable");
    const last = this.approvalLog.filter((r) => r.event === "used").at(-1);
    if (!last || last.event !== "used" || !last.inTime || removed < 0) return;
    if (this.approvalLog.some((r) => r.event === "removed" && r.usedAt === last.usedAt)) return;
    const { approvedAt, approvedBy, approvedName, approvedReason, approvedUntil, usedAt } = last;
    this.approvalLog.push({ event: "removed", approvedAt, approvedBy, approvedName, approvedReason, approvedUntil, usedAt, removed });
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
