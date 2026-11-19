/**
 * The rules around linking a social account: the 30-day account age (X only), the 30-day relink cooldown, and the
 * keyed hash that stands in for a platform id wherever nothing readable may be kept. Pure, so it is unit-tested.
 */
import { createHmac } from "node:crypto";
import type { Platform } from "./types";

export const MIN_SOCIAL_ACCOUNT_AGE_DAYS = 30;
export const RELINK_COOLDOWN_DAYS = 30;
/** A link not re-checked for this long is paused by the daily cycle until the person's next call on the site. */
export const RECHECK_AFTER_DAYS = 30;
/** The date of the linking consent wording (LEX, 2026-11-19), recorded with each `socialLink` consent. */
export const SOCIAL_CONSENT_VERSION = "2026-11-19";
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The social account must be at least 30 days old when it is linked. X only (AEGIS note 4): X reports when an
 * account was created; Meta's public profile does not, so there is nothing to check there. An X account whose
 * date is missing or unreadable is refused.
 */
export function oldEnough(platform: Platform, createdAt: string | null, now: Date): boolean {
  if (platform !== "x") return true;
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  return !Number.isNaN(created) && now.getTime() - created >= MIN_SOCIAL_ACCOUNT_AGE_DAYS * DAY_MS;
}

/** HMAC-SHA256 of a platform id, in hex: what the cooldown and auto-reply tables keep instead of the id. */
export function idHmac(platform: Platform, platformUserId: string, secret: string): string {
  return createHmac("sha256", secret).update(`${platform}:${platformUserId}`).digest("hex");
}

/** The cut-off before which a link counts as stale. */
export function recheckCutoff(now: Date): Date {
  return new Date(now.getTime() - RECHECK_AFTER_DAYS * DAY_MS);
}
