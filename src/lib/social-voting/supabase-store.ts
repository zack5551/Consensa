import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { CountOutcome, CountStore, OfficialPost, ReadPatch } from "./count";
import { idHmac, recheckCutoff } from "./link-rules";
import type { SpendStore } from "./spend";
import { releaseOutcomes, removeOutcomes, type ReleaseOutcome, type RemoveOutcome, type SweepStore } from "./sweep";
import type { Platform } from "./types";

const outcomes = ["counted", "duplicate", "website_wins", "older_reply", "closed", "before_link", "unlinked"] as const;
const PAGE = 1000;

/**
 * The counting step's store in Supabase (ca-central-1), through the server's secret-key client. Every rule that
 * matters (linked, confirmed, open, one call per person, website wins) is enforced by the database functions in
 * the sprint-11 migration; this only carries the calls. It never logs.
 */
export class SupabaseSocialStore implements CountStore, SweepStore, SpendStore {
  constructor(
    private readonly admin: SupabaseClient,
    private readonly hmacSecret: string,
  ) {}

  async reserve(platform: Platform, month: string, micros: number, capMicros: number): Promise<boolean> {
    const { data, error } = await this.admin.rpc("reserve_social_spend", { p_platform: platform, p_month: month, p_micros: micros, p_cap_micros: capMicros });
    return !error && data === true;
  }

  async spent(platform: Platform, month: string): Promise<number> {
    const { data, error } = await this.admin.from("social_spend").select("spent_micros").eq("platform", platform).eq("month", month).maybeSingle();
    if (error) throw new Error("spend unavailable");
    return z.object({ spent_micros: z.coerce.number().int().nonnegative() }).nullable().parse(data)?.spent_micros ?? 0;
  }

  async linkedIds(platform: Platform): Promise<ReadonlySet<string>> {
    const ids = new Set<string>();
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.admin.from("social_links").select("platform_user_id").eq("platform", platform).eq("paused", false).order("platform_user_id").range(from, from + PAGE - 1);
      if (error) throw new Error("links unavailable");
      const rows = z.array(z.object({ platform_user_id: z.string() })).parse(data ?? []);
      for (const r of rows) ids.add(r.platform_user_id);
      if (rows.length < PAGE) return ids;
    }
  }

  async ensureWindow(slug: string, closesAt: string): Promise<void> {
    const { error } = await this.admin.from("question_windows").upsert({ slug, closes_at: closesAt }, { onConflict: "slug" });
    if (error) throw new Error("window unavailable");
  }

  async readThrough(platform: Platform, postId: string): Promise<Date | null> {
    const { data, error } = await this.admin.from("social_post_reads").select("read_through").eq("platform", platform).eq("post_id", postId).maybeSingle();
    if (error) throw new Error("reads unavailable");
    const at = z.object({ read_through: z.string().nullable() }).nullable().parse(data)?.read_through;
    return at ? new Date(at) : null;
  }

  async saveRead(post: OfficialPost, patch: ReadPatch, now: Date): Promise<void> {
    const row = {
      platform: post.platform,
      post_id: post.postId,
      slug: post.slug,
      ...(patch.readThrough ? { read_through: patch.readThrough.toISOString() } : {}),
      // poll_source, poll_ends_at and post_url need the 20261121000000 migration (go-live runs all four first).
      ...(patch.poll ? { poll_yes: patch.poll.yes, poll_no: patch.poll.no, poll_read_at: now.toISOString(), poll_source: patch.poll.source ?? "poll" } : {}),
      ...(patch.pollEndsAt !== undefined ? { poll_ends_at: patch.pollEndsAt } : {}),
      ...(patch.postUrl ? { post_url: patch.postUrl } : {}),
    };
    const { error } = await this.admin.from("social_post_reads").upsert(row, { onConflict: "platform,post_id" });
    if (error) throw new Error("reads unavailable");
  }

  async countReply(input: { platform: Platform; replyId: string; postId: string; authorId: string; slug: string; probability: number; at: string }): Promise<CountOutcome> {
    const { data, error } = await this.admin.rpc("count_social_reply", {
      p_platform: input.platform,
      p_reply_id: input.replyId,
      p_post_id: input.postId,
      p_platform_user_id: input.authorId,
      p_slug: input.slug,
      p_probability: input.probability,
      p_replied_at: input.at,
    });
    // The 2-second rule on calls, or the question closing mid-run: nothing was kept, so it can be tried again.
    if (error) return error.hint === "closed" ? "closed" : "retry";
    const outcome = z.enum(outcomes).safeParse(data);
    return outcome.success ? outcome.data : "retry";
  }

  async ledgerReplyIds(platform: Platform, postId: string, limit: number): Promise<string[]> {
    return this.replyIds(platform, postId, limit, false);
  }

  async heldReplyIds(platform: Platform, postId: string, limit: number): Promise<string[]> {
    return this.replyIds(platform, postId, limit, true);
  }

  /** Replies the sweep still checks: never a withdrawn one. With `heldOnly`, just those a halted run is holding. */
  private async replyIds(platform: Platform, postId: string, limit: number, heldOnly: boolean): Promise<string[]> {
    const ids: string[] = [];
    for (let from = 0; ids.length < limit; from += PAGE) {
      const to = Math.min(from + PAGE, limit) - 1;
      const rows = this.admin.from("social_votes").select("reply_id").eq("platform", platform).eq("post_id", postId).is("withdrawn_at", null);
      const { data, error } = await (heldOnly ? rows.not("held_at", "is", null) : rows).order("reply_id").range(from, to);
      if (error) throw new Error("ledger unavailable");
      const page = z.array(z.object({ reply_id: z.string() })).parse(data ?? []);
      for (const r of page) ids.push(r.reply_id);
      if (page.length < to - from + 1) break;
    }
    return ids;
  }

  async removeReply(platform: Platform, replyId: string): Promise<RemoveOutcome> {
    return this.markGone("remove_social_reply", platform, replyId);
  }

  async holdReply(platform: Platform, replyId: string): Promise<RemoveOutcome> {
    return this.markGone("hold_social_reply", platform, replyId);
  }

  private async markGone(fn: "remove_social_reply" | "hold_social_reply", platform: Platform, replyId: string): Promise<RemoveOutcome> {
    const { data, error } = await this.admin.rpc(fn, { p_platform: platform, p_reply_id: replyId });
    // The 2-second rule on calls refused the change: the database kept everything as it was, so it can be tried again.
    // The question closing mid-run is the same answer the function gives itself.
    if (error) {
      if (error.hint === "rate") return "retry";
      if (error.hint === "closed") return "closed";
      throw new Error("remove unavailable");
    }
    const outcome = z.enum(removeOutcomes).safeParse(data);
    if (!outcome.success) throw new Error("remove unavailable");
    return outcome.data;
  }

  async releaseReply(platform: Platform, replyId: string): Promise<ReleaseOutcome> {
    const { data, error } = await this.admin.rpc("release_social_reply", { p_platform: platform, p_reply_id: replyId });
    if (error) {
      if (error.hint === "rate") return "retry";
      if (error.hint === "closed") return "closed";
      throw new Error("release unavailable");
    }
    const outcome = z.enum(releaseOutcomes).safeParse(data);
    if (!outcome.success) throw new Error("release unavailable");
    return outcome.data;
  }

  async purgeWithdrawn(): Promise<number> {
    const { data, error } = await this.admin.rpc("purge_withdrawn_social_replies");
    if (error) throw new Error("purge unavailable");
    return z.coerce.number().int().nonnegative().parse(data ?? 0);
  }

  async purgeAuditLogs(): Promise<number> {
    const { data, error } = await this.admin.rpc("purge_social_audit_logs");
    if (error) throw new Error("purge unavailable");
    return z.coerce.number().int().nonnegative().parse(data ?? 0);
  }

  async noteHalt(): Promise<Date | null> {
    return this.haltSince("note_social_sweep_halt");
  }

  async settleHalt(): Promise<Date | null> {
    return this.haltSince("settle_social_sweep_halt");
  }

  /** When the open halt first happened, as the database kept it. Null: no open halt. */
  private async haltSince(fn: "note_social_sweep_halt" | "settle_social_sweep_halt"): Promise<Date | null> {
    const { data, error } = await this.admin.rpc(fn);
    if (error) throw new Error("halt unavailable");
    const at = z.string().nullable().parse(data ?? null);
    const since = at ? new Date(at) : null;
    return since && !Number.isNaN(since.getTime()) ? since : null;
  }

  async consumeSweepApproval(): Promise<boolean> {
    // The database clears the approval, logs the use and says whether it was still in time, in one transaction.
    // Anything but a plain "true" (an error, no row, an approval past its time) is no approval.
    const { data, error } = await this.admin.rpc("consume_social_sweep_approval");
    return !error && data === true;
  }

  async recordApprovedRemovals(removed: number): Promise<void> {
    const { error } = await this.admin.rpc("record_social_sweep_removals", { p_removed: removed });
    if (error) throw new Error("approval log unavailable");
  }

  async pauseStaleLinks(now: Date): Promise<number> {
    const { data, error } = await this.admin.from("social_links").update({ paused: true }).eq("paused", false).lt("last_checked_at", recheckCutoff(now).toISOString()).select("platform");
    return error ? 0 : (data ?? []).length;
  }

  async claimAutoReply(platform: Platform, authorId: string, postId: string): Promise<boolean> {
    // Only a keyed hash of the id is kept, and the database deletes it after 7 days (LEX).
    const { error } = await this.admin.from("social_autoreply_seen").insert({ platform, id_hmac: idHmac(platform, authorId, this.hmacSecret), post_id: postId });
    return !error;
  }
}
