import "server-only";
import type { Question } from "@/lib/question";
import { applyLive, summarize, type CrowdRow } from "@/lib/live-crowd";
import { adminSupabase } from "@/lib/supabase/admin";

/** Questions with real crowd numbers where at least 5 people have called. Preview mode returns them unchanged. */
export async function withLiveCrowd<T extends Question>(qs: readonly T[]): Promise<T[]> {
  const admin = adminSupabase();
  if (!admin || qs.length === 0) return [...qs];
  const { data, error } = await admin.rpc("crowd_summary", { p_slugs: qs.map((q) => q.slug) });
  if (error || !Array.isArray(data)) return [...qs];
  const live = summarize((data as CrowdRow[]).map((r) => ({ ...r, n: Number(r.n), total: Number(r.total) })));
  return qs.map((q) => applyLive(q, live.get(q.slug)));
}

export async function withLiveQuestion<T extends Question>(q: T | undefined): Promise<T | undefined> {
  if (!q) return q;
  const [one] = await withLiveCrowd([q]);
  return one;
}
