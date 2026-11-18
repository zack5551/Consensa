import "server-only";
import { z } from "zod";
import { vpnSharePercent } from "@/lib/call-origin";
import type { Question } from "@/lib/question";
import { applyLive, summarize, summarizeWorld, type CrowdRow } from "@/lib/live-crowd";
import { adminSupabase } from "@/lib/supabase/admin";

/** Questions with real crowd numbers where at least 5 people have called. Preview mode returns them unchanged. */
export async function withLiveCrowd<T extends Question>(qs: readonly T[]): Promise<T[]> {
  const admin = adminSupabase();
  if (!admin || qs.length === 0) return [...qs];
  const slugs = qs.map((q) => q.slug);
  const [canada, vpn] = await Promise.all([admin.rpc("crowd_summary", { p_slugs: slugs }), admin.rpc("crowd_world_vpn", { p_slugs: slugs })]);
  if (canada.error || !Array.isArray(canada.data)) return [...qs];
  const live = summarize((canada.data as CrowdRow[]).map((r) => ({ ...r, n: Number(r.n), total: Number(r.total) })));
  // The World/VPN group is optional: if it can't be read (for example the migration hasn't run), the line stays hidden.
  const parsed = vpn.error ? null : worldRows.safeParse(vpn.data);
  const world = parsed?.success ? summarizeWorld(parsed.data) : null;
  return qs.map((q) => {
    const withCanada = applyLive(q, live.get(q.slug));
    // Only where live data exists for this question: no live data, no World/VPN line.
    return world && live.has(q.slug) ? { ...withCanada, world: world.get(q.slug) ?? null } : withCanada;
  });
}

export async function withLiveQuestion<T extends Question>(q: T | undefined): Promise<T | undefined> {
  if (!q) return q;
  const [one] = await withLiveCrowd([q]);
  return one;
}

const count = z.coerce.number().int().nonnegative();
const worldRows = z.array(z.object({ slug: z.string(), n: count, total: count }));
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
