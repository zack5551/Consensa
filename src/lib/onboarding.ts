import { z } from "zod";
import { provinces } from "@/lib/question";

/**
 * Onboarding rules (LEX guardrails §6): an 18+ gate, and four separate express consents with
 * nothing pre-ticked. Terms are required to continue; data licensing, usage analytics and marketing email are
 * optional and never bundled with the terms. Kept framework-free so the same rules can run in the
 * browser now and in the Supabase signup function later.
 */

export const MINIMUM_AGE = 18;

/** Whole years between a birth date and today, both as YYYY-MM-DD, compared as calendar dates (no timezone drift). */
export function ageOn(birthDate: string, today: string): number {
  const b = parseIsoDate(birthDate);
  const t = parseIsoDate(today);
  if (!b || !t) return Number.NaN;
  let age = t.y - b.y;
  if (t.m < b.m || (t.m === b.m && t.d < b.d)) age -= 1;
  return age;
}

export function isAdult(birthDate: string, today: string): boolean {
  const age = ageOn(birthDate, today);
  return Number.isFinite(age) && age >= MINIMUM_AGE;
}

function parseIsoDate(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  // Round-trip through UTC to reject impossible dates like 2026-02-30.
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return { y, m, d };
}

/** Today's date as YYYY-MM-DD in Canada's most populous time zone, so the gate flips at local midnight, not UTC. */
export function todayInToronto(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export const regionChoices = [...provinces, "none"] as const;
export type RegionChoice = (typeof regionChoices)[number];

export const consentSchema = z.object({
  /** Required. Terms of use and privacy policy. */
  terms: z.literal(true),
  /** Optional. Answers may be used in anonymous, combined results (aggregates only, minimum cell size). */
  dataLicensing: z.boolean(),
  /** Optional, off by default (Law 25). Anonymous product analytics on the self-hosted PostHog in Montreal. */
  analytics: z.boolean(),
  /** Optional. CASL express consent for product email. */
  marketing: z.boolean(),
});

export const emailSchema = z.email().max(254);

export const profileSchema = z.object({
  locale: z.enum(["en", "fr"]),
  birthDate: z.iso.date(),
  region: z.enum(regionChoices),
  topics: z.array(z.string().min(1)).max(12),
  email: emailSchema,
  consents: consentSchema,
});

export type Profile = z.infer<typeof profileSchema>;

export const steps = ["language", "age", "region", "topics", "account", "done"] as const;
export type Step = (typeof steps)[number];

export function nextStep(step: Step): Step {
  const i = steps.indexOf(step);
  return steps[Math.min(steps.length - 1, i + 1)] ?? "done";
}

export function previousStep(step: Step): Step {
  const i = steps.indexOf(step);
  return steps[Math.max(0, i - 1)] ?? "language";
}

/** 1-based position for "Step 2 of 5". The final "done" screen isn't counted as a step. */
export function stepNumber(step: Step): { current: number; total: number } {
  const total = steps.length - 1;
  return { current: Math.min(total, steps.indexOf(step) + 1), total };
}

/** The key the preview uses to remember onboarding on this device until accounts exist. */
export const PROFILE_STORAGE_KEY = "consensa:profile";
