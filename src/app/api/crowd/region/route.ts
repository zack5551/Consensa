import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getQuestion, SAMPLE_NOW } from "@/content/sample-questions";
import { liveRegionCallCount } from "@/lib/live";
import { isOpen, provinces, questionState } from "@/lib/question";
import { rateLimiter } from "@/lib/rate-limit";
import { callerIp } from "@/lib/server/proxy-check";

/**
 * How many calls one region's average is built from, for the call panel's region row. The visitor's region lives in
 * their browser, so the panel asks for that one region instead of the page shipping every region's count. Answers
 * `{ n: null }` whenever the count isn't published (preview mode, fewer than 50 calls, or complementary
 * suppression in `summarize`). A published count is rounded down to 10s (`publishedRegionCount`). Aggregates only: never a row per person.
 *
 * Hardened (AEGIS): rate limited per address, only known questions still taking calls (404 otherwise, before any
 * database read), and exactly two query params (400 for anything else), so extra params can't bust the CDN cache.
 */
export const dynamic = "force-dynamic";

const query = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,120}$/), region: z.enum(provinces) }).strict();
const noStore = { "Cache-Control": "no-store" };
const cached = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60" };

/** About 30 lookups a minute per address on this server instance. Cached answers never reach it. */
const allowLookup = rateLimiter({ limit: 30, windowMs: 60_000 });

export async function GET(req: NextRequest) {
  if (!allowLookup(callerIp(req.headers, Boolean(process.env.VERCEL)) ?? "unknown")) {
    return NextResponse.json({ error: "slow down" }, { status: 429, headers: { ...noStore, "Retry-After": "60" } });
  }
  const params = [...req.nextUrl.searchParams.keys()];
  // A repeated param would otherwise collapse into one entry and pass; the cache key must be exactly slug + region.
  if (new Set(params).size !== params.length) return NextResponse.json({ error: "bad request" }, { status: 400, headers: noStore });
  const parsed = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400, headers: noStore });
  const q = getQuestion(parsed.data.slug);
  if (!q || !isOpen(questionState(q, SAMPLE_NOW))) return NextResponse.json({ error: "not found" }, { status: 404, headers: noStore });
  const n = await liveRegionCallCount(q.slug, parsed.data.region);
  return NextResponse.json({ n }, { headers: cached });
}
