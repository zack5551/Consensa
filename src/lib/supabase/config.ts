/**
 * Supabase settings for accounts (ca-central-1). Framework-free so it can be unit-tested.
 *
 * - NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: turn on real sign-in. Without them the app
 *   stays in preview mode (calls in this browser, no email sent), which is what CI and local dev use.
 * - SUPABASE_SECRET_KEY: server only. Writes calls after the server has checked the session and the question.
 */
import { z } from "zod";
import { isLocale } from "@/i18n/config";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().trim().pipe(z.url()),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});

export type PublicSupabase = { url: string; key: string };

/** Pass `process.env` values explicitly: Next only inlines NEXT_PUBLIC_* when they are read by name. */
export function publicSupabase(env: { NEXT_PUBLIC_SUPABASE_URL?: string; NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string }): PublicSupabase | null {
  const parsed = publicSchema.safeParse(env);
  // Keep only the origin: the dashboard's "RESTful endpoint" (…supabase.co/rest/v1/) is an easy value to paste by mistake.
  return parsed.success ? { url: new URL(parsed.data.NEXT_PUBLIC_SUPABASE_URL).origin, key: parsed.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.trim() } : null;
}

/** Longer than any page in the app: a longer `next` is refused rather than cut. */
export const MAX_NEXT_LENGTH = 512;

/**
 * Where to land after the email link. Only a path inside the app, in one of our two languages: never another
 * site (an open redirect would let a phishing email borrow our domain).
 */
export function safeNext(next: string | null | undefined, fallback = "/en/today"): string {
  if (!next || next.length > MAX_NEXT_LENGTH || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  // Browsers drop tabs and line breaks from a URL, so "/\t/evil.example" would become "//evil.example": refuse any control character.
  if (/\p{Cc}/u.test(next)) return fallback;
  const path = next.split(/[?#]/)[0] ?? "";
  // An encoded slash or backslash, or a "." or ".." segment (plain or encoded), could step out of the locale folder.
  if (/%(?:2f|5c)/i.test(path)) return fallback;
  for (const segment of path.split("/")) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return fallback;
    }
    if (decoded === "." || decoded === "..") return fallback;
  }
  const first = next.split(/[/?#]/)[1] ?? "";
  return isLocale(first) ? next : fallback;
}

const plainPath = /^\/[a-z]{2}(?:\/[A-Za-z0-9._~-]+)*\/?$/;

/**
 * The page to come back to after signing up or signing in, e.g. the question someone was on. It must pass `safeNext`
 * and be a plain path: no query or fragment (so nothing for tracking rides along), and only characters that need no
 * encoding inside the email link. Anything else gives null, and the caller uses its default (`/{locale}/today`).
 */
export function returnPath(next: string | null | undefined): string | null {
  if (!next) return null;
  const safe = safeNext(next, "");
  return safe && plainPath.test(safe) ? safe : null;
}

/** What onboarding sends as user metadata; the database trigger refuses a signup without adult and terms. */
/** The date of the consent wording people see in onboarding. Bump it when that wording changes (AEGIS rule 6). */
export const CONSENT_VERSION = "2026-11-19";

/**
 * The Terms version people must have accepted, written as the date that version TAKES EFFECT. Rules (LEX, item 13):
 * - Change it only for a material change to the Terms. A typo, wording or contact fix updates the page's date and
 *   changelog only. Privacy Policy changes never touch it (the policy is a notice, not a contract), and a new purpose
 *   gets its own consent box, never a bundled "accept".
 * - The in-app notice goes out at least 30 days before this date. Until the date arrives, calls under the old Terms
 *   still count (`termsGateOn`); from that day, calls wait for acceptance (Terms s. 18).
 * - Set CONSENT_VERSION to at least the same date: a unit test keeps it from falling behind.
 */
export const TERMS_VERSION = "2026-11-11";

export const signupMetadataSchema = z.object({
  consentVersion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  locale: z.enum(["en", "fr"]),
  adult: z.literal(true),
  terms: z.literal(true),
  region: z.enum(["BC", "AB", "PR", "ON", "QC", "AT", "none"]),
  topics: z.array(z.string().min(1).max(40)).max(12),
  dataLicensing: z.boolean(),
  analytics: z.boolean(),
  marketing: z.boolean(),
});
export type SignupMetadata = z.infer<typeof signupMetadataSchema>;

/** Session cookies the server sets: not readable by page scripts, HTTPS only in production, and not sent on cross-site posts. */
export const sessionCookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
