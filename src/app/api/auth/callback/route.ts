import { NextResponse, type NextRequest } from "next/server";
import { termsCurrent, type ConsentRow } from "@/lib/account";
import { safeNext, TERMS_VERSION } from "@/lib/supabase/config";
import { serverSupabase } from "@/lib/supabase/server";

/**
 * The email link lands here: swap the one-time code for a session cookie, then go to a page inside the app. If the
 * Terms changed since this person last accepted them, they see the Terms first and are asked again (Terms s. 18).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");
  const supabase = await serverSupabase();
  if (supabase && code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data } = await supabase.from("consent_log").select("kind, version, given_at, withdrawn_at").eq("kind", "terms");
      // On a read error, carry on to the app: the Terms page and account screen check again.
      if (data && !termsCurrent(data as ConsentRow[], TERMS_VERSION)) {
        const locale = next.split("/")[1] ?? "en";
        return NextResponse.redirect(new URL(`/${locale}/terms#accept`, origin));
      }
      return NextResponse.redirect(new URL(next, origin));
    }
  }
  const locale = next.split("/")[1] ?? "en";
  return NextResponse.redirect(new URL(`/${locale}/sign-in?link=expired`, origin));
}
