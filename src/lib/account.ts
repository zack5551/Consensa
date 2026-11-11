/**
 * Account controls (Law 25, CASL): which consents a person can turn off or on, how their current state is read from
 * the append-only consent log, and the request bodies the account routes accept. Pure, so it is unit-tested.
 */
import { z } from "zod";

/** Consents a person can change in settings. Terms can't be withdrawn on their own: that is deleting the account. */
export const optionalConsents = ["dataLicensing", "analytics", "marketing"] as const;
export type OptionalConsent = (typeof optionalConsents)[number];
export type ConsentState = Record<OptionalConsent, boolean>;

export type ConsentRow = { kind: string; given_at: string; withdrawn_at: string | null; version?: string };

/** A consent is on when the log has a row for it that hasn't been withdrawn. */
export function consentState(rows: readonly ConsentRow[]): ConsentState {
  const on = (kind: OptionalConsent) => rows.some((r) => r.kind === kind && r.withdrawn_at === null);
  return { dataLicensing: on("dataLicensing"), analytics: on("analytics"), marketing: on("marketing") };
}

/** True when the log holds an open acceptance of the Terms at `termsVersion` or later (dates compare as text). */
export function termsCurrent(rows: readonly ConsentRow[], termsVersion: string): boolean {
  return rows.some((r) => r.kind === "terms" && r.withdrawn_at === null && typeof r.version === "string" && r.version >= termsVersion);
}

/** Accepting new Terms names the exact version shown, so a stale page can't accept a version it never displayed. */
export const acceptTermsSchema = z.object({ version: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict();

export const consentChangeSchema = z.object({ kind: z.enum(optionalConsents), on: z.boolean() }).strict();

/** Deleting needs an explicit yes in the body, so a stray request can't do it. */
/** How recent a sign-in must be before the account can be deleted: a stolen or left-open session can't erase it. */
export const RECENT_SIGN_IN_MS = 15 * 60_000;

/** True when the person signed in within the last 15 minutes. A missing or unreadable time counts as not recent. */
export function signedInRecently(lastSignInAt: string | null | undefined, now: Date): boolean {
  if (!lastSignInAt) return false;
  const at = Date.parse(lastSignInAt);
  if (Number.isNaN(at)) return false;
  const age = now.getTime() - at;
  return age >= -60_000 && age <= RECENT_SIGN_IN_MS;
}

export const deleteAccountSchema = z.object({ confirm: z.literal(true) }).strict();

/** The file name of the data download, dated so repeated downloads don't overwrite each other. */
export function exportFileName(now: Date): string {
  return `consensa-my-data-${now.toISOString().slice(0, 10)}.json`;
}
