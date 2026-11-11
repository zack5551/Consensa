import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/supabase/config";
import { serverSupabase } from "@/lib/supabase/server";

/** The email link lands here: swap the one-time code for a session cookie, then go to a page inside the app. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");
  const supabase = await serverSupabase();
  if (supabase && code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  const locale = next.split("/")[1] ?? "en";
  return NextResponse.redirect(new URL(`/${locale}/sign-in?link=expired`, origin));
}
