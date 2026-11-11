import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getQuestion, SAMPLE_NOW } from "@/content/sample-questions";
import { isOpen, questionState } from "@/lib/question";
import { rateLimiter } from "@/lib/rate-limit";
import { adminSupabase } from "@/lib/supabase/admin";
import { serverSupabase } from "@/lib/supabase/server";

const bodySchema = z.object({ slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,79}$/), probability: z.number().int().min(1).max(99) }).strict();

const noStore = { "Cache-Control": "no-store" };

/** At most 30 call writes a minute per person on this server instance. The database adds 2 seconds per call. */
const allowWrite = rateLimiter({ limit: 30, windowMs: 60_000 });

/** Your own calls, read with your session (row-level security returns only your rows). */
export async function GET() {
  const supabase = await serverSupabase();
  if (!supabase) return NextResponse.json({ signedIn: false, calls: {} }, { headers: noStore });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ signedIn: false, calls: {} }, { headers: noStore });
  const { data, error } = await supabase.from("calls").select("slug, probability");
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });
  const calls = Object.fromEntries((data ?? []).map((r: { slug: string; probability: number }) => [r.slug, r.probability]));
  return NextResponse.json({ signedIn: true, calls }, { headers: noStore });
}

/**
 * Save or change your call. The server checks the session, the question and that it is still taking calls, then
 * writes with the secret key: the browser has no write rights on `calls` at all. One row per person per question.
 */
export async function POST(request: NextRequest) {
  // Same-origin only: a form on another site can't make calls for a signed-in visitor.
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== request.nextUrl.origin) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });

  const supabase = await serverSupabase();
  const admin = adminSupabase();
  if (!supabase || !admin) return NextResponse.json({ error: "accounts off" }, { status: 404, headers: noStore });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "sign in" }, { status: 401, headers: noStore });

  if (!allowWrite(auth.user.id)) return NextResponse.json({ error: "slow down" }, { status: 429, headers: { ...noStore, "Retry-After": "60" } });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400, headers: noStore });
  const q = getQuestion(parsed.data.slug);
  if (!q) return NextResponse.json({ error: "unknown question" }, { status: 404, headers: noStore });
  // The site's clock: the same one every page uses to show a question as open or closed.
  if (!isOpen(questionState(q, SAMPLE_NOW))) return NextResponse.json({ error: "closed" }, { status: 409, headers: noStore });

  // The database checks the close time itself (and refuses late calls whatever the app says), so it needs the
  // question's close time. Content is the source of truth, so a changed close date is copied over.
  const closeTime = await admin.from("question_windows").upsert({ slug: q.slug, closes_at: q.closesAt }, { onConflict: "slug" });
  if (closeTime.error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });

  const { error } = await admin.from("calls").upsert({ user_id: auth.user.id, slug: q.slug, probability: parsed.data.probability }, { onConflict: "user_id,slug" });
  if (error?.hint === "closed") return NextResponse.json({ error: "closed" }, { status: 409, headers: noStore });
  if (error?.hint === "rate") return NextResponse.json({ error: "slow down" }, { status: 429, headers: { ...noStore, "Retry-After": "2" } });
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });
  return NextResponse.json({ ok: true }, { headers: noStore });
}
