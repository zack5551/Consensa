import { NextResponse } from "next/server";
import { noStore } from "@/lib/supabase/account-server";
import { serverSupabase } from "@/lib/supabase/server";

/**
 * Is this visitor signed in? A yes or no and nothing else: no email, no user id, no profile. The question page asks
 * this after a call is saved, so it never pulls the person's account details (that is /api/account, for the account
 * page). It reads the session cookie with the person's own client, the same way /api/account does, and needs no
 * secret key. With accounts off, nobody is signed in.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await serverSupabase();
  if (!supabase) return NextResponse.json({ signedIn: false }, { headers: noStore });
  try {
    const { data, error } = await supabase.auth.getUser();
    // supabase-js reports most failures as `error` rather than throwing. No session cookie is a plain "signed out";
    // any other error (an outage, say) is unknown, the same as a throw.
    if (error && !data.user && error.name !== "AuthSessionMissingError") throw error;
    return NextResponse.json({ signedIn: Boolean(data.user?.email) }, { headers: noStore });
  } catch {
    // Unknown, not "signed out": the page then leaves the answer open instead of guessing.
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });
  }
}
