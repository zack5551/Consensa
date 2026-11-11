import { NextResponse, type NextRequest } from "next/server";
import { noStore, sameOrigin } from "@/lib/supabase/account-server";
import { safeNext } from "@/lib/supabase/config";
import { serverSupabase } from "@/lib/supabase/server";

/** POST only, and from this site only, so a link, an image or a form on another site can't sign someone out. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  const supabase = await serverSupabase();
  if (supabase) await supabase.auth.signOut();
  const form = await request.formData().catch(() => null);
  const next = safeNext(typeof form?.get("next") === "string" ? (form.get("next") as string) : null);
  return NextResponse.redirect(new URL(next, request.nextUrl.origin), { status: 303 });
}
