import { NextResponse, type NextRequest } from "next/server";
import { consentChangeSchema } from "@/lib/account";
import { rateLimiter } from "@/lib/rate-limit";
import { emailHash, noStore, sameOrigin, signedIn } from "@/lib/supabase/account-server";
import { CONSENT_VERSION } from "@/lib/supabase/config";

const allowChange = rateLimiter({ limit: 20, windowMs: 60_000 });

/**
 * Turn one optional consent off or on (Privacy §9, CASL). Off sets `withdrawn_at` on the open row; on adds a new
 * row with today's wording version. The log is append-only, so the history of every change is kept.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  const me = await signedIn();
  if (!me.ok) return me.error;
  if (!allowChange(me.user.id)) return NextResponse.json({ error: "slow down" }, { status: 429, headers: noStore });
  const parsed = consentChangeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400, headers: noStore });

  const { kind, on } = parsed.data;
  const hash = emailHash(me.user.email);
  const open = await me.admin.from("consent_log").select("id").eq("email_hash", hash).eq("kind", kind).is("withdrawn_at", null);
  if (open.error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });
  const isOn = (open.data ?? []).length > 0;

  if (on && !isOn) {
    const { error } = await me.admin.from("consent_log").insert({ email_hash: hash, kind, version: CONSENT_VERSION });
    if (error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });
  } else if (!on && isOn) {
    const { error } = await me.admin.from("consent_log").update({ withdrawn_at: new Date().toISOString() }).eq("email_hash", hash).eq("kind", kind).is("withdrawn_at", null);
    if (error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });
  }
  return NextResponse.json({ ok: true, kind, on }, { headers: noStore });
}
