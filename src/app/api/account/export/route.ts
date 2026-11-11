import { NextResponse } from "next/server";
import { exportFileName } from "@/lib/account";
import { rateLimiter } from "@/lib/rate-limit";
import { noStore, signedIn } from "@/lib/supabase/account-server";

const allowExport = rateLimiter({ limit: 10, windowMs: 60_000 });

/**
 * Download my data (Law 25 portability): everything we hold about you, as JSON. Read with your own session, so
 * row-level security guarantees it is only your rows.
 */
export async function GET() {
  const me = await signedIn();
  if (!me.ok) return me.error;
  if (!allowExport(me.user.id)) return NextResponse.json({ error: "slow down" }, { status: 429, headers: noStore });
  const [profile, calls, consents] = await Promise.all([
    me.supabase.from("profiles").select("locale, region, topics, adult_confirmed_at, created_at, updated_at").maybeSingle(),
    me.supabase.from("calls").select("slug, probability, created_at, updated_at").order("created_at"),
    me.supabase.from("consent_log").select("kind, version, given_at, withdrawn_at").order("given_at"),
  ]);
  if (profile.error || calls.error || consents.error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });

  const now = new Date();
  const body = {
    exportedAt: now.toISOString(),
    account: { email: me.user.email, createdAt: me.user.createdAt },
    profile: profile.data,
    calls: calls.data ?? [],
    consents: consents.data ?? [],
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: { ...noStore, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${exportFileName(now)}"` },
  });
}
