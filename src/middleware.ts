import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isLocale, negotiateLocale } from "@/i18n/config";
import { supabasePublic } from "@/lib/supabase/env";

/**
 * Sends locale-less paths to /en or /fr, based on a saved choice or the browser's language. When accounts are on,
 * it also refreshes the Supabase session cookie so server pages see who is signed in.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1] ?? "";
  if (!isLocale(first)) {
    const saved = request.cookies.get("locale")?.value;
    const locale = saved && isLocale(saved) ? saved : negotiateLocale(request.headers.get("accept-language"));
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(url);
  }
  if (!supabasePublic) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabasePublic.url, supabasePublic.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

/** Skips Next internals, files, the API (it reads its own cookies) and the /embed widget (its URL carries the locale). */
export const config = { matcher: ["/((?!_next|api|embed|favicon.ico|.*\\..*).*)"] };
