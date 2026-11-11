import "server-only";
import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { adminSupabase } from "./admin";
import { serverSupabase } from "./server";

export const noStore = { "Cache-Control": "no-store" };

/** Same as `public.email_hash()` in the database: SHA-256 of the trimmed, lower-cased address, in hex. */
export function emailHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/** A form on another site can't act for a signed-in visitor. */
export function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return origin === null || origin === request.nextUrl.origin;
}

/**
 * The signed-in person, their session client and the secret-key client, or the response to send instead.
 * Account routes only ever act on the user the session names.
 */
export async function signedIn() {
  const supabase = await serverSupabase();
  const admin = adminSupabase();
  if (!supabase || !admin) return { ok: false, error: NextResponse.json({ error: "accounts off" }, { status: 404, headers: noStore }) } as const;
  const { data } = await supabase.auth.getUser();
  if (!data.user?.email) return { ok: false, error: NextResponse.json({ error: "sign in" }, { status: 401, headers: noStore }) } as const;
  return { ok: true, user: { id: data.user.id, email: data.user.email, createdAt: data.user.created_at, lastSignInAt: data.user.last_sign_in_at ?? null }, supabase, admin } as const;
}
