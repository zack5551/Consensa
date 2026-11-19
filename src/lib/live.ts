import "server-only";
import { z } from "zod";
import { vpnSharePercent } from "@/lib/call-origin";
import type { Question } from "@/lib/question";
import { applyLive, parseCrowdRows, summarize } from "@/lib/live-crowd";
import { adminSupabase } from "@/lib/supabase/admin";

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
