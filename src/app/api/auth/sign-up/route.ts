import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { rateLimiter } from "@/lib/rate-limit";
import { logErrorCode } from "@/lib/server/error-code-log";
import { verifyBotCheck } from "@/lib/server/bot-check";
import { noStore, sameOrigin } from "@/lib/supabase/account-server";
import { MAX_NEXT_LENGTH, signupMetadataSchema } from "@/lib/supabase/config";
import { landingPath } from "@/lib/return-path";
import { serverSupabase } from "@/lib/supabase/server";
import { adminSupabase } from "@/lib/supabase/admin";
import { callerIp } from "@/lib/server/proxy-check";

const bodySchema = z.object({ email: z.string().trim().email().max(254), data: signupMetadataSchema, altcha: z.string().max(4096).nullable().optional(), next: z.string().max(MAX_NEXT_LENGTH).optional() }).strict();

/** At most 10 sign-up attempts a minute per caller on this server instance. The address is only a key in memory: never logged or stored. */
const allowSignUp = rateLimiter({ limit: 10, windowMs: 60_000 });

/**
 * Sign-up goes through here so the bot check is verified on the server before Supabase creates the account (the
 * browser can't skip it). The server sends the sign-in link with the same options the browser used to; the code
 * verifier cookie is set on this response, so the link still completes at /api/auth/callback.
 */
/** The site the email link points at: the fixed site address when set, else the domain that served this request. Never localhost on Vercel. */
function linkOrigin(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  if (!allowSignUp(callerIp(request.headers, Boolean(process.env.VERCEL)) ?? "unknown")) return NextResponse.json({ error: "slow down" }, { status: 429, headers: { ...noStore, "Retry-After": "60" } });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400, headers: noStore });
  const supabase = await serverSupabase();
  if (!supabase) return NextResponse.json({ error: "accounts off" }, { status: 404, headers: noStore });
  if ((await verifyBotCheck(parsed.data.altcha ?? null)) === "fail") return NextResponse.json({ error: "bot check" }, { status: 403, headers: noStore });

  const admin = adminSupabase();
  if (!admin) return NextResponse.json({ error: "accounts off" }, { status: 404, headers: noStore });

  const { email, data } = parsed.data;
  // Where the link lands: the page the person came from when it passes returnPath, else today. Never the raw client value.
  const next = landingPath(data.locale, parsed.data.next);
  // Accounts are created only here, after the bot check, with the server key. Public sign-up is turned off in Supabase,
  // so the publishable key can only send links to accounts that already exist. The sign-up trigger still checks
  // adult and terms in the metadata, so it stays the gate.
  const created = await admin.auth.admin.createUser({ email, email_confirm: false, user_metadata: data });
  if (created.error && !isExisting(created.error)) {
    logErrorCode("sign-up create failed", created.error.code ?? created.error.status);
    if (isRateLimit(created.error)) return slowDown();
    return NextResponse.json({ ok: true }, { headers: noStore });
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${linkOrigin(request)}/api/auth/callback?next=${next}` },
  });
  if (error) {
    // Only the code is logged, never the address. A rate limit gets a generic answer; every other error looks like success,
    // so nobody can use this route to find out which addresses have accounts.
    logErrorCode("sign-up link failed", error.code ?? error.status);
    if (isRateLimit(error)) return slowDown();
  }
  return NextResponse.json({ ok: true }, { headers: noStore });
}

type AuthError = { code?: string; status?: number };
const isRateLimit = (e: AuthError) => e.status === 429 || Boolean(e.code?.includes("rate_limit"));
/** An address that already has an account: carry on and send the link, so the answer is the same either way. */
const isExisting = (e: AuthError) => e.code === "email_exists" || e.code === "user_already_exists" || e.status === 422;
const slowDown = () => NextResponse.json({ error: "slow down" }, { status: 429, headers: { ...noStore, "Retry-After": "60" } });
