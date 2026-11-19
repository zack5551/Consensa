/**
 * OAuth 2.0 PKCE for linking, server-side (AEGIS note 2). The verifier and the state ride in one signed, httpOnly,
 * SameSite=Lax cookie that lives 10 minutes. The callback accepts a request only when the cookie's signature holds,
 * it hasn't expired, the `state` matches, it came back to the same site, and the same person is still signed in.
 * Pure (node:crypto only), so it is unit-tested.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { platformSchema, type Platform } from "./types";

export const LINK_COOKIE = "cn_social_link";
export const LINK_TTL_SECONDS = 600;

/** Only the linking routes ever receive the cookie. */
export const linkCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/account/social",
  maxAge: LINK_TTL_SECONDS,
};

const b64 = (buf: Buffer) => buf.toString("base64url");

export function newPkce(): { verifier: string; challenge: string; state: string } {
  const verifier = b64(randomBytes(48));
  return { verifier, challenge: b64(createHash("sha256").update(verifier).digest()), state: b64(randomBytes(24)) };
}

const payloadSchema = z
  .object({
    platform: platformSchema,
    state: z.string().min(16).max(128),
    verifier: z.string().min(43).max(128),
    userId: z.uuid(),
    origin: z.url(),
    locale: z.enum(["en", "fr"]),
    /** The person ticked the consent box before starting. */
    consent: z.literal(true),
    /** Expiry, in seconds since the epoch. */
    exp: z.number().int().positive(),
  })
  .strict();
export type LinkPayload = z.infer<typeof payloadSchema>;

function sign(body: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(body).digest();
}

export function sealLink(payload: Omit<LinkPayload, "exp">, secret: string, now: Date): string {
  const body = b64(Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(now.getTime() / 1000) + LINK_TTL_SECONDS })));
  return `${body}.${b64(sign(body, secret))}`;
}

/** The payload, or null when the cookie is missing, altered, signed with another key or expired. */
export function openLink(cookie: string | null | undefined, secret: string, now: Date): LinkPayload | null {
  if (!cookie || cookie.length > 2048) return null;
  const [body, mac, extra] = cookie.split(".");
  if (!body || !mac || extra !== undefined) return null;
  const given = Buffer.from(mac, "base64url");
  const expected = sign(body, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const parsed = payloadSchema.safeParse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
    if (!parsed.success || parsed.data.exp * 1000 <= now.getTime()) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type CallbackCheck = { ok: true; payload: LinkPayload } | { ok: false; reason: "expired" | "state" | "origin" | "user" };

/** Everything the callback must hold true before it talks to the platform. */
export function checkCallback(input: { cookie: string | null | undefined; state: string | null | undefined; origin: string; userId: string; secret: string; now: Date }): CallbackCheck {
  const payload = openLink(input.cookie, input.secret, input.now);
  if (!payload) return { ok: false, reason: "expired" };
  if (!input.state || !sameText(input.state, payload.state)) return { ok: false, reason: "state" };
  if (payload.origin !== input.origin) return { ok: false, reason: "origin" };
  if (payload.userId !== input.userId) return { ok: false, reason: "user" };
  return { ok: true, payload };
}

export type { Platform };
