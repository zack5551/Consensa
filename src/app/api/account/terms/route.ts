import { NextResponse, type NextRequest } from "next/server";
import { acceptTermsSchema, termsCurrent, type ConsentRow } from "@/lib/account";
import { rateLimiter } from "@/lib/rate-limit";
import { emailHash, noStore, sameOrigin, signedIn } from "@/lib/supabase/account-server";
import { TERMS_VERSION } from "@/lib/supabase/config";

const allowAccept = rateLimiter({ limit: 5, windowMs: 60_000 });

/**
 * Accept the current Terms after they changed (Terms s. 18). Adds a new `terms` row with the version shown; the old
 * row stays, so the log keeps what was agreed and when. Only the version on the page can be accepted.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  const me = await signedIn();
  if (!me.ok) return me.error;
  if (!allowAccept(me.user.id)) return NextResponse.json({ error: "slow down" }, { status: 429, headers: noStore });
  const parsed = acceptTermsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.version !== TERMS_VERSION) return NextResponse.json({ error: "invalid" }, { status: 400, headers: noStore });

  const hash = emailHash(me.user.email);
  const rows = await me.admin.from("consent_log").select("kind, version, given_at, withdrawn_at").eq("email_hash", hash).eq("kind", "terms");
  if (rows.error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });
  if (!termsCurrent((rows.data ?? []) as ConsentRow[], TERMS_VERSION)) {
    const { error } = await me.admin.from("consent_log").insert({ email_hash: hash, kind: "terms", version: TERMS_VERSION });
    if (error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });
  }
  return NextResponse.json({ ok: true, version: TERMS_VERSION }, { headers: noStore });
}
