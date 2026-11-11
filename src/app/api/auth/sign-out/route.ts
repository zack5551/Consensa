import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/supabase/config";
import { serverSupabase } from "@/lib/supabase/server";

/** POST only, so a link or an image on another site can't sign someone out. */
export async function POST(request: NextRequest) {
  const supabase = await serverSupabase();
  if (supabase) await supabase.auth.signOut();
  const form = await request.formData().catch(() => null);
  const next = safeNext(typeof form?.get("next") === "string" ? (form.get("next") as string) : null);
  return NextResponse.redirect(new URL(next, request.nextUrl.origin), { status: 303 });
}
