import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { rateLimiter } from "@/lib/rate-limit";
import { verifyBotCheck } from "@/lib/server/bot-check";
import { noStore, sameOrigin } from "@/lib/supabase/account-server";
import { signupMetadataSchema } from "@/lib/supabase/config";
import { serverSupabase } from "@/lib/supabase/server";

const bodySchema = z.object({ email: z.string().trim().email().max(254), data: signupMetadataSchema, altcha: z.string().max(4096).nullable().optional() }).strict();

/** At most 10 sign-up attempts a minute per caller on this server instance. The address is only a key in memory: never logged or stored. */
const allowSignUp = rateLimiter({ limit: 10, windowMs: 60_000 });

/**
 * Sign-up goes through here so the bot check is verified on the server before Supabase creates the account (the
 * browser can't skip it). The server sends the sign-in link with the same options the browser used to; the code
 * verifier cookie is set on this response, so the link still completes at /api/auth/callback.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  if (!allowSignUp((request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim())) return NextResponse.json({ error: "slow down" }, { status: 429, headers: { ...noStore, "Retry-After": "60" } });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400, headers: noStore });
  const supabase = await serverSupabase();
  if (!supabase) return NextResponse.json({ error: "accounts off" }, { status: 404, headers: noStore });
  if ((await verifyBotCheck(parsed.data.altcha ?? null)) === "fail") return NextResponse.json({ error: "bot check" }, { status: 403, headers: noStore });

  const { email, data } = parsed.data;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, data, emailRedirectTo: `${request.nextUrl.origin}/api/auth/callback?next=/${data.locale}/today` },
  });
  if (error) return NextResponse.json({ error: error.code ?? `http_${error.status ?? 500}` }, { status: error.status && error.status >= 400 ? error.status : 500, headers: noStore });
  return NextResponse.json({ ok: true }, { headers: noStore });
}
