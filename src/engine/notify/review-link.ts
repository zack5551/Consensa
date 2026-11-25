/**
 * The editor's review page link (`/api/engine/review?t=…`), sent in the run summary email. The token is an HMAC of
 * its expiry, signed with the cron secret, so the link needs no login, can't be guessed, and stops working after
 * a week. The page itself only shows drafts; approving or rejecting is a form POST carrying the same token, so a
 * mail scanner that opens the link can't change anything.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const REVIEW_LINK_DAYS = 7;
const DAY_MS = 86_400_000;

function sign(expires: number, secret: string): string {
  return createHmac("sha256", secret).update(`pulse-review:${expires}`).digest("base64url");
}

export function reviewToken(secret: string, now: Date, days = REVIEW_LINK_DAYS): string {
  const expires = Math.floor((now.getTime() + days * DAY_MS) / 1000);
  return `${expires}.${sign(expires, secret)}`;
}

export function verifyReviewToken(token: string | null | undefined, secret: string, now: Date): boolean {
  const match = /^(\d{9,12})\.([A-Za-z0-9_-]{43})$/.exec(token ?? "");
  if (!match) return false;
  const expires = Number(match[1]);
  if (expires * 1000 < now.getTime()) return false;
  const given = Buffer.from(match[2]!);
  const expected = Buffer.from(sign(expires, secret));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The full link, or undefined when there's no site address to point at. */
export function reviewUrl(siteHost: string | undefined, secret: string, now: Date): string | undefined {
  if (!siteHost) return undefined;
  const host = siteHost.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `https://${host}/api/engine/review?t=${encodeURIComponent(reviewToken(secret, now))}`;
}
