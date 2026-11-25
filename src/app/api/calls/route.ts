import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { siteQuestion } from "@/lib/site-questions";
import { siteNow } from "@/lib/clock";
import { termsCurrent, termsGateOn, type ConsentRow } from "@/lib/account";
import { callsCountFrom, COUNTRY_HEADER, PROXY_CHECK_TIMEOUT_MS, withinTime } from "@/lib/call-origin";
import { callsCloseAt, isOpen, questionState } from "@/lib/question";
import { rateLimiter } from "@/lib/rate-limit";
import { verifyBotCheck } from "@/lib/server/bot-check";
import { socialVotingOn } from "@/lib/social-voting/env";
import { checkProxy } from "@/lib/server/proxy-check";
import { adminSupabase } from "@/lib/supabase/admin";
import { TERMS_VERSION } from "@/lib/supabase/config";
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

  // Only calls made from Canada count. Reads the 2-letter country header and nothing else about the origin; nothing is stored.
  // It sits after the rate limit so callers from outside Canada are rate limited too.
  if (!callsCountFrom(request.headers.get(COUNTRY_HEADER), Boolean(process.env.VERCEL))) return NextResponse.json({ error: "outside canada" }, { status: 403, headers: noStore });

  // The bot check: the browser solves a small puzzle on its own device and sends the answer in the `x-altcha` header.
  // Skipped when the server has no ALTCHA_HMAC_KEY (local dev, CI). Runs after the Canada check so that 403 stays its own.
  if ((await verifyBotCheck(request.headers.get("x-altcha"))) === "fail") return NextResponse.json({ error: "bot check" }, { status: 403, headers: noStore });

  // Calls through a VPN or proxy don't count (zack, 2026-11-18): a VPN can make a visitor abroad look Canadian. The
  // lookup reads a database file on this server; the address goes nowhere. The refused attempt is only counted, one
  // number per day, never per person. A slow or missing database (150 ms) is "unknown" and lets the call through,
  // so a lookup problem never blocks people in Canada.
  const { vpn } = await withinTime(checkProxy(request.headers), PROXY_CHECK_TIMEOUT_MS, { vpn: "unknown" as const });
  if (vpn === true) {
    after(async () => {
      await admin.rpc("count_call_origin", { p_vpn: "yes" });
    });
    return NextResponse.json({ error: "vpn" }, { status: 403, headers: noStore });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400, headers: noStore });
  const q = await siteQuestion(parsed.data.slug);
  if (!q) return NextResponse.json({ error: "unknown question" }, { status: 404, headers: noStore });
  // The site's clock: the same one every page uses to show a question as open or closed.
  if (!isOpen(questionState(q, siteNow()))) return NextResponse.json({ error: "closed" }, { status: 409, headers: noStore });

  // Calls need the current Terms (Terms s. 18) once they take effect. Sign-in and the Terms page already ask again
  // after a change, but a session that stayed open across the change would otherwise keep calling under the old
  // Terms. Before the effective date (the 30-day notice period) calls under the old Terms still count (LEX, item 13).
  // Read with the person's own session: row-level security returns only their consent rows. A failed read refuses
  // the call (fail closed) rather than counting it under Terms nobody checked.
  if (termsGateOn(TERMS_VERSION, new Date())) {
    const terms = await supabase.from("consent_log").select("kind, version, given_at, withdrawn_at").eq("kind", "terms");
    if (terms.error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });
    if (!termsCurrent((terms.data ?? []) as ConsentRow[], TERMS_VERSION)) return NextResponse.json({ error: "terms" }, { status: 403, headers: noStore });
  }

  // The database checks the close time itself (and refuses late calls whatever the app says), so it needs the
  // question's close time. Content is the source of truth, so a changed close date is copied over.
  const closeTime = await admin.from("question_windows").upsert({ slug: q.slug, closes_at: callsCloseAt(q) }, { onConflict: "slug" });
  if (closeTime.error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });

  // With social voting on, a call made here is marked as a website call, so it wins over any reply on the same question
  // (the database refuses to let a reply overwrite it). The column exists only after the sprint-11 migration, so it is
  // written only when the flag is on.
  const social = socialVotingOn();
  const userId = auth.user.id;
  const { error } = await admin.from("calls").upsert({ user_id: userId, slug: q.slug, probability: parsed.data.probability, ...(social ? { source: "web" } : {}) }, { onConflict: "user_id,slug" });
  if (error?.hint === "closed") return NextResponse.json({ error: "closed" }, { status: 409, headers: noStore });
  if (error?.hint === "rate") return NextResponse.json({ error: "slow down" }, { status: 429, headers: { ...noStore, "Retry-After": "2" } });
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });
  // Best effort, after the answer is sent: a failed or slow counter never fails or delays a saved call.
  after(async () => {
    await admin.rpc("count_call_origin", { p_vpn: vpn === "unknown" ? "unknown" : "no" });
    // The monthly re-check of a linked social account (AEGIS note 5): a call from Canada with a clear "not a VPN"
    // answer is the proof. An unknown answer proves nothing, so it neither refreshes the links nor lifts a pause.
    // Without any link it changes nothing.
    if (social && vpn === false) await admin.from("social_links").update({ last_checked_at: new Date().toISOString(), paused: false }).eq("user_id", userId);
  });
  return NextResponse.json({ ok: true }, { headers: noStore });
}
