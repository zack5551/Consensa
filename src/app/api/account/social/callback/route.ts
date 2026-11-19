import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { rateLimiter } from "@/lib/rate-limit";
import { socialEnv } from "@/lib/social-voting/env";
import { addressKey, connectionAllowed } from "@/lib/social-voting/link-checks";
import { linkProvider } from "@/lib/social-voting/link-providers";
import { idHmac, oldEnough, SOCIAL_CONSENT_VERSION } from "@/lib/social-voting/link-rules";
import { checkCallback, LINK_COOKIE, linkCookieOptions } from "@/lib/social-voting/pkce";
import { emailHash, noStore, sameOrigin, signedIn } from "@/lib/supabase/account-server";

export const runtime = "nodejs";

const allowCallback = rateLimiter({ limit: 10, windowMs: 10 * 60_000 });
const allowAddress = rateLimiter({ limit: 30, windowMs: 10 * 60_000 });

const querySchema = z.object({
  state: z.string().min(16).max(128),
  code: z.string().min(1).max(2048).optional(),
  error: z.string().max(100).optional(),
  locale: z.enum(["en", "fr"]).catch("en"),
});
const linkOutcome = z.enum(["linked", "already", "taken", "cooldown"]);

/**
 * The platform sends the person back here. Before anything else: the rate limit (through callerIp() only), then the
 * signed cookie, the `state`, the origin and that the same person is still signed in (AEGIS note 2). Then the same
 * account and connection checks as the start. Only then is the code swapped, the numeric id read once, and the
 * token dropped: no token is ever stored. Every answer is a redirect back to the linking page with a short result
 * code, and the cookie is cleared whatever happens. 404 while the flag is off.
 */
export async function GET(request: NextRequest) {
  const env = socialEnv();
  if (env.SOCIAL_VOTING !== "1") return NextResponse.json({ error: "not found" }, { status: 404, headers: noStore });
  const { searchParams, origin } = request.nextUrl;
  const query = querySchema.safeParse({ state: searchParams.get("state") ?? undefined, code: searchParams.get("code") ?? undefined, error: searchParams.get("error") ?? undefined, locale: request.cookies.get("locale")?.value });
  let locale: "en" | "fr" = query.success ? query.data.locale : "en";

  const done = (result: string) => {
    const response = NextResponse.redirect(new URL(`/${locale}/account/social?result=${result}`, origin), { status: 303, headers: noStore });
    response.cookies.set(LINK_COOKIE, "", { ...linkCookieOptions, maxAge: 0 });
    return response;
  };

  if (!allowAddress(addressKey(request.headers))) return done("slow");
  if (!sameOrigin(request)) return done("expired");
  if (!query.success || !env.SOCIAL_LINK_SECRET) return done("expired");
  const me = await signedIn();
  if (!me.ok) return done("signedOut");
  if (!allowCallback(me.user.id)) return done("slow");

  const check = checkCallback({ cookie: request.cookies.get(LINK_COOKIE)?.value, state: query.data.state, origin, userId: me.user.id, secret: env.SOCIAL_LINK_SECRET, now: new Date() });
  if (!check.ok) return done("expired");
  const { payload } = check;
  locale = payload.locale;
  if (query.data.error || !query.data.code) return done("cancelled");
  if (!me.user.confirmed) return done("unconfirmed");
  if (!(await connectionAllowed(request.headers))) return done("outside");

  const provider = linkProvider(payload.platform, env);
  const identity = await provider.identify({ code: query.data.code, verifier: payload.verifier, redirectUri: `${origin}/api/account/social/callback` });
  if (!identity) return done("failed");
  if (!oldEnough(payload.platform, identity.createdAt, new Date())) return done("tooNew");

  const linked = await me.admin.rpc("link_social_account", {
    p_user: me.user.id,
    p_platform: payload.platform,
    p_platform_user_id: identity.platformUserId,
    p_id_hmac: idHmac(payload.platform, identity.platformUserId, env.SOCIAL_LINK_SECRET),
  });
  const outcome = linkOutcome.safeParse(linked.data);
  if (linked.error || !outcome.success) return done("failed");
  if (outcome.data !== "linked") return done(outcome.data);

  // The consent the person ticked before starting, recorded now that the link exists (kind `socialLink`).
  const hash = emailHash(me.user.email);
  const open = await me.admin.from("consent_log").select("id").eq("email_hash", hash).eq("kind", "socialLink").is("withdrawn_at", null);
  const recorded = open.error ? open : (open.data ?? []).length > 0 ? open : await me.admin.from("consent_log").insert({ email_hash: hash, kind: "socialLink", version: SOCIAL_CONSENT_VERSION });
  if (recorded.error) {
    // No consent on record means no link: take it back out rather than keep an id without proof of the yes.
    await me.admin.from("social_links").delete().eq("user_id", me.user.id).eq("platform", payload.platform);
    return done("failed");
  }
  return done("linked");
}
