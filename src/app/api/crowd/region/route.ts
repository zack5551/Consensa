import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { liveRegionCallCount } from "@/lib/live";
import { provinces } from "@/lib/question";

/**
 * How many calls one region's average is built from, for the call panel's region row. The visitor's region lives in
 * their browser, so the panel asks for that one region instead of the page shipping every region's count. Answers
 * `{ n: null }` whenever the count isn't published (preview mode, fewer than 5 calls, or complementary suppression
 * in `summarize`). Aggregates only: never a row per person.
 */
export const dynamic = "force-dynamic";

const query = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,120}$/), region: z.enum(provinces) });
const cached = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60" };

export async function GET(req: NextRequest) {
  const parsed = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const n = await liveRegionCallCount(parsed.data.slug, parsed.data.region);
  return NextResponse.json({ n }, { headers: cached });
}
