/**
 * Account controls (Law 25, CASL): which consents a person can turn off or on, how their current state is read from
 * the append-only consent log, and the request bodies the account routes accept. Pure, so it is unit-tested.
 */
import { z } from "zod";

/** Consents a person can change in settings. Terms can't be withdrawn on their own: that is deleting the account. */
export const optionalConsents = ["dataLicensing", "analytics", "marketing"] as const;
export type OptionalConsent = (typeof optionalConsents)[number];
export type ConsentState = Record<OptionalConsent, boolean>;

export type ConsentRow = { kind: string; given_at: string; withdrawn_at: string | null };

/** A consent is on when the log has a row for it that hasn't been withdrawn. */
export function consentState(rows: readonly ConsentRow[]): ConsentState {
  const on = (kind: OptionalConsent) => rows.some((r) => r.kind === kind && r.withdrawn_at === null);
  return { dataLicensing: on("dataLicensing"), analytics: on("analytics"), marketing: on("marketing") };
}

export const consentChangeSchema = z.object({ kind: z.enum(optionalConsents), on: z.boolean() }).strict();

/** Deleting needs an explicit yes in the body, so a stray request can't do it. */
export const deleteAccountSchema = z.object({ confirm: z.literal(true) }).strict();

/** The file name of the data download, dated so repeated downloads don't overwrite each other. */
export function exportFileName(now: Date): string {
  return `consensa-my-data-${now.toISOString().slice(0, 10)}.json`;
}
