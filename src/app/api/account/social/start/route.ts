import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { rateLimiter } from "@/lib/rate-limit";
import { verifyBotCheck } from "@/lib/server/bot-check";
import { socialEnv } from "@/lib/social-voting/env";
import { addressKey, connectionAllowed } from "@/lib/social-voting/link-checks";
import { linkProvider } from "@/lib/social-voting/link-providers";
import { LINK_COOKIE, linkCookieOptions, newPkce, sealLink } from "@/lib/social-voting/pkce";
import { platformSchema } from "@/lib/social-voting/types";
import { noStore, sameOrigin, signedIn } from "@/lib/supabase/account-server";

export const runtime = "nodejs";

/** Linking is rare: a few tries per person and per address every 10 minutes is plenty. */
const allowStart = rateLimiter({ limit: 5, windowMs: 10 * 60_000 });
const allowAddress = rateLimiter({ limit: 20, windowMs: 10 * 60_000 });

/** `consent` must be a literal yes: the box on the page is separate, unticked by default, and required (LEX, Law 25). */
const bodySchema = z.object({ platform: platformSchema, consent: z.literal(true), locale: z.enum(["en", "fr"]) }).strict();

/**
 * Start linking a social account. Only for a signed-in, confirmed account, from a Canadian connection that isn't a
 * VPN or proxy, after the bot check (AEGIS rule 1). It sets the signed 10-minute cookie holding the PKCE verifier
 * and the state, and answers with the platform's sign-in address for the browser to open. 404 while the flag is off.
 */
export async function POST(request: NextRequest) {
  const env = socialEnv();
  if (env.SOCIAL_VOTING !== "1") return NextResponse.json({ error: "not found" }, { status: 404, headers: noStore });
  if (!sameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  const me = await signedIn();
  if (!me.ok) return me.error;
  if (!allowStart(me.user.id) || !allowAddress(addressKey(request.headers))) return NextResponse.json({ error: "slow down" }, { status: 429, headers: { ...noStore, "Retry-After": "600" } });
  if (!(await connectionAllowed(request.headers))) return NextResponse.json({ error: "outside canada" }, { status: 403, headers: noStore });
  if ((await verifyBotCheck(request.headers.get("x-altcha"))) === "fail") return NextResponse.json({ error: "bot check" }, { status: 403, headers: noStore });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400, headers: noStore });
  if (!me.user.confirmed) return NextResponse.json({ error: "unconfirmed" }, { status: 403, headers: noStore });

  const { platform, locale } = parsed.data;
  const provider = linkProvider(platform, env);
  if (!env.SOCIAL_LINK_SECRET || !provider.available()) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });

  const origin = request.nextUrl.origin;
  const pkce = newPkce();
  const url = provider.authorizeUrl({ state: pkce.state, challenge: pkce.challenge, redirectUri: `${origin}/api/account/social/callback` });
  if (!url) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });

  const response = NextResponse.json({ url }, { headers: noStore });
  response.cookies.set(LINK_COOKIE, sealLink({ platform, state: pkce.state, verifier: pkce.verifier, userId: me.user.id, origin, locale, consent: true }, env.SOCIAL_LINK_SECRET, new Date()), linkCookieOptions);
  return response;
}
