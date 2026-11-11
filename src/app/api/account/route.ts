import { NextResponse, type NextRequest } from "next/server";
import { consentState, deleteAccountSchema, signedInRecently, termsCurrent, type ConsentRow } from "@/lib/account";
import { rateLimiter } from "@/lib/rate-limit";
import { noStore, sameOrigin, signedIn } from "@/lib/supabase/account-server";
import { TERMS_VERSION } from "@/lib/supabase/config";

const allowDelete = rateLimiter({ limit: 5, windowMs: 60_000 });

/** Who is signed in, which optional consents are on, and whether they have accepted the current Terms. Read with the person's own session (row-level security). */
export async function GET() {
  const me = await signedIn();
  if (!me.ok) return me.error.status === 401 ? NextResponse.json({ signedIn: false }, { headers: noStore }) : me.error;
  const { data, error } = await me.supabase.from("consent_log").select("kind, version, given_at, withdrawn_at");
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });
  const rows = (data ?? []) as ConsentRow[];
  return NextResponse.json(
    { signedIn: true, email: me.user.email, consents: consentState(rows), termsCurrent: termsCurrent(rows, TERMS_VERSION), termsVersion: TERMS_VERSION },
    { headers: noStore },
  );
}

/**
 * Delete my account (Law 25). Removing the auth user takes the profile and every call with it at once (cascade).
 * The consent records stay, ended, for 3 years as proof of what was agreed (see the consent retention migration);
 * they hold an email hash only. Then the session cookies are cleared. It needs a sign-in from the last 15 minutes,
 * so a session left open on a shared computer can't erase the account.
 */
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  const me = await signedIn();
  if (!me.ok) return me.error;
  if (!allowDelete(me.user.id)) return NextResponse.json({ error: "slow down" }, { status: 429, headers: noStore });
  const parsed = deleteAccountSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400, headers: noStore });
  if (!signedInRecently(me.user.lastSignInAt, new Date())) return NextResponse.json({ error: "reauth" }, { status: 403, headers: noStore });

  // The database ends the open consents when the user row goes (on_auth_user_deleted), so a failed delete
  // never leaves a live account with its choices switched off.
  const { error } = await me.admin.auth.admin.deleteUser(me.user.id);
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });
  await me.supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
