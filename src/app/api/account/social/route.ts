import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { rateLimiter } from "@/lib/rate-limit";
import { socialEnv } from "@/lib/social-voting/env";
import { idHmac } from "@/lib/social-voting/link-rules";
import { linkProvider } from "@/lib/social-voting/link-providers";
import { platforms, platformSchema } from "@/lib/social-voting/types";
import { emailHash, noStore, sameOrigin, signedIn } from "@/lib/supabase/account-server";

const allowUnlink = rateLimiter({ limit: 10, windowMs: 60_000 });
const off = () => NextResponse.json({ error: "not found" }, { status: 404, headers: noStore });
const linkRow = z.object({ platform: platformSchema, linked_at: z.string(), paused: z.boolean() });
const unlinkSchema = z.object({ platform: platformSchema }).strict();

/**
 * My linked social accounts: the platform, since when, and whether counting is paused. Read with the person's own
 * session (row-level security). The platform id itself is never sent to the browser. 404 while SOCIAL_VOTING is off.
 */
export async function GET() {
  const env = socialEnv();
  if (env.SOCIAL_VOTING !== "1") return off();
  const me = await signedIn();
  if (!me.ok) return me.error.status === 401 ? NextResponse.json({ signedIn: false }, { headers: noStore }) : me.error;
  const { data, error } = await me.supabase.from("social_links").select("platform, linked_at, paused");
  const rows = z.array(linkRow).safeParse(data ?? []);
  if (error || !rows.success) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });
  const available = env.SOCIAL_LINK_SECRET ? platforms.filter((p) => linkProvider(p, env).available()) : [];
  return NextResponse.json(
    { signedIn: true, confirmed: me.user.confirmed, available, links: rows.data.map((r) => ({ platform: r.platform, linkedAt: r.linked_at, paused: r.paused })) },
    { headers: noStore },
  );
}

/**
 * Unlink, in one click (LEX). The database deletes the id at once and starts the 30-day relink cooldown in the same
 * transaction; calls already made stay the person's own. When no link is left, the linking consent is ended too.
 */
export async function DELETE(request: NextRequest) {
  const env = socialEnv();
  if (env.SOCIAL_VOTING !== "1") return off();
  if (!sameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  const me = await signedIn();
  if (!me.ok) return me.error;
  if (!allowUnlink(me.user.id)) return NextResponse.json({ error: "slow down" }, { status: 429, headers: noStore });
  const parsed = unlinkSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400, headers: noStore });
  if (!env.SOCIAL_LINK_SECRET) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });

  const { platform } = parsed.data;
  const own = await me.admin.from("social_links").select("platform_user_id").eq("user_id", me.user.id).eq("platform", platform).maybeSingle();
  const row = z.object({ platform_user_id: z.string() }).nullable().safeParse(own.data ?? null);
  if (own.error || !row.success) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });
  if (row.data) {
    const { error } = await me.admin.rpc("unlink_social_account", { p_user: me.user.id, p_platform: platform, p_id_hmac: idHmac(platform, row.data.platform_user_id, env.SOCIAL_LINK_SECRET) });
    if (error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });
  }
  const left = await me.admin.from("social_links").select("platform", { count: "exact", head: true }).eq("user_id", me.user.id);
  if (!left.error && (left.count ?? 0) === 0) {
    await me.admin.from("consent_log").update({ withdrawn_at: new Date().toISOString() }).eq("email_hash", emailHash(me.user.email)).eq("kind", "socialLink").is("withdrawn_at", null);
  }
  return NextResponse.json({ ok: true }, { headers: noStore });
}
