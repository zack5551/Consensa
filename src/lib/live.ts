import "server-only";
import { z } from "zod";
import { vpnSharePercent } from "@/lib/call-origin";
import type { Province, Question } from "@/lib/question";
import { applyLive, parseCrowdRows, regionCallCount, summarize } from "@/lib/live-crowd";
import { adminSupabase } from "@/lib/supabase/admin";
import { socialPollSchema, type SocialPoll } from "@/lib/social";
import { socialVotingOn } from "@/lib/social-voting/env";
import { pollFromRead, pollReadRow } from "@/lib/social-voting/poll-reads";

/** Questions with real crowd numbers where at least 5 people have called. Preview mode returns them unchanged. */
export async function withLiveCrowd<T extends Question>(qs: readonly T[]): Promise<T[]> {
  const admin = adminSupabase();
  if (!admin || qs.length === 0) return [...qs];
  const { data, error } = await admin.rpc("crowd_summary", { p_slugs: qs.map((q) => q.slug) });
  if (error || !Array.isArray(data)) return [...qs];
  const live = summarize(parseCrowdRows(data));
  return qs.map((q) => applyLive(q, live.get(q.slug)));
}

export async function withLiveQuestion<T extends Question>(q: T | undefined): Promise<T | undefined> {
  if (!q) return q;
  const [one] = await withLiveCrowd([q]);
  return one;
}

/** One region's call count for one question, or null in preview mode, on an error, or when it isn't published. */
export async function liveRegionCallCount(slug: string, region: Province): Promise<number | null> {
  const admin = adminSupabase();
  if (!admin) return null;
  const { data, error } = await admin.rpc("crowd_summary", { p_slugs: [slug] });
  if (error) return null;
  return regionCallCount(summarize(parseCrowdRows(data)).get(slug), region);
}

const count = z.coerce.number().int().nonnegative();
const originShareRow = z.object({ total: count, vpn: count, unknown: count });

/** Percent of calls in the last 30 days that came through a VPN or proxy; null when accounts are off, the counters are unavailable or there are too few calls. */
export async function vpnShareLast30Days(): Promise<number | null> {
  const admin = adminSupabase();
  if (!admin) return null;
  const { data, error } = await admin.rpc("call_origin_share", { p_days: 30 });
  const row: unknown = Array.isArray(data) ? data[0] : null;
  if (error || typeof row !== "object" || row === null) return null;
  const parsed = originShareRow.safeParse(row);
  return parsed.success ? vpnSharePercent(parsed.data) : null;
}

/**
 * X poll totals the daily run found for this question (polls zack posts on @CANsensus, `social-voting/discover.ts`).
 * Nothing is read while social voting is off, and any error just shows no totals. Shown under "On social media",
 * never in "Canada says".
 */
export async function liveSocialPolls(slug: string): Promise<SocialPoll[]> {
  const admin = socialVotingOn() ? adminSupabase() : null;
  if (!admin) return [];
  const { data, error } = await admin
    .from("social_post_reads")
    .select("platform, post_id, poll_yes, poll_no, poll_read_at, poll_ends_at")
    .eq("slug", slug)
    .eq("platform", "x")
    .not("poll_yes", "is", null)
    .limit(10);
  if (error || !Array.isArray(data)) return [];
  return data.flatMap((raw) => {
    const row = pollReadRow.safeParse(raw);
    const poll = row.success ? pollFromRead(row.data) : null;
    return poll && socialPollSchema.safeParse(poll).success ? [poll] : [];
  });
}
