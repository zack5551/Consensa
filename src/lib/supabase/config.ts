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
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});

export type PublicSupabase = { url: string; key: string };

/** Pass `process.env` values explicitly: Next only inlines NEXT_PUBLIC_* when they are read by name. */
export function publicSupabase(env: { NEXT_PUBLIC_SUPABASE_URL?: string; NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string }): PublicSupabase | null {
  const parsed = publicSchema.safeParse(env);
  return parsed.success ? { url: parsed.data.NEXT_PUBLIC_SUPABASE_URL, key: parsed.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } : null;
}

/**
 * Where to land after the email link. Only a path inside the app, in one of our two languages: never another
 * site (an open redirect would let a phishing email borrow our domain).
 */
export function safeNext(next: string | null | undefined, fallback = "/en/today"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  const first = next.split(/[/?#]/)[1] ?? "";
  return isLocale(first) ? next : fallback;
}

/** What onboarding sends as user metadata; the database trigger refuses a signup without adult and terms. */
/** The date of the consent wording people see in onboarding. Bump it when that wording changes (AEGIS rule 6). */
export const CONSENT_VERSION = "2026-11-11";

/**
 * The date of the Terms people must have accepted. When the Terms change materially, set this to the new date (and
 * CONSENT_VERSION to at least the same date): everyone who accepted an older version is asked again at their next
 * sign-in (Terms s. 18). A unit test keeps CONSENT_VERSION from falling behind.
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
