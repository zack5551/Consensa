import { describe, expect, it } from "vitest";
import { acceptTermsSchema, consentChangeSchema, consentState, deleteAccountSchema, exportFileName, signedInRecently, termsCurrent } from "@/lib/account";
import { CONSENT_VERSION, TERMS_VERSION } from "@/lib/supabase/config";

describe("consentState", () => {
  it("is on only while a row for that consent is not withdrawn", () => {
    const rows = [
      { kind: "terms", given_at: "2026-11-11T00:00:00Z", withdrawn_at: null },
      { kind: "analytics", given_at: "2026-11-11T00:00:00Z", withdrawn_at: "2026-11-12T00:00:00Z" },
      { kind: "marketing", given_at: "2026-11-11T00:00:00Z", withdrawn_at: "2026-11-12T00:00:00Z" },
      { kind: "marketing", given_at: "2026-11-13T00:00:00Z", withdrawn_at: null },
    ];
    expect(consentState(rows)).toEqual({ dataLicensing: false, analytics: false, marketing: true });
  });
});

describe("account request bodies", () => {
  it("accepts only the optional consents, never terms", () => {
    expect(consentChangeSchema.safeParse({ kind: "marketing", on: false }).success).toBe(true);
    expect(consentChangeSchema.safeParse({ kind: "terms", on: false }).success).toBe(false);
    expect(consentChangeSchema.safeParse({ kind: "marketing", on: false, extra: 1 }).success).toBe(false);
  });

  it("needs an explicit yes to delete", () => {
    expect(deleteAccountSchema.safeParse({ confirm: true }).success).toBe(true);
    expect(deleteAccountSchema.safeParse({ confirm: "true" }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({}).success).toBe(false);
  });

  it("deletes only after a recent sign-in", () => {
    const now = new Date("2026-11-11T12:00:00Z");
    expect(signedInRecently("2026-11-11T11:50:00Z", now)).toBe(true);
    expect(signedInRecently("2026-11-11T11:44:59Z", now)).toBe(false);
    expect(signedInRecently("2026-11-11T12:30:00Z", now)).toBe(false);
    expect(signedInRecently(null, now)).toBe(false);
    expect(signedInRecently("not a date", now)).toBe(false);
  });

  it("asks again only when the accepted Terms are older than the current version", () => {
    const row = (version: string, withdrawn_at: string | null = null) => ({ kind: "terms", version, given_at: "2026-11-11T00:00:00Z", withdrawn_at });
    expect(termsCurrent([row("2026-11-11")], "2026-11-11")).toBe(true);
    expect(termsCurrent([row("2026-11-11")], "2027-01-15")).toBe(false);
    expect(termsCurrent([row("2026-11-11"), row("2027-01-15")], "2027-01-15")).toBe(true);
    expect(termsCurrent([row("2027-01-15", "2027-02-01T00:00:00Z")], "2027-01-15")).toBe(false);
    expect(termsCurrent([{ kind: "marketing", version: "2027-01-15", given_at: "x", withdrawn_at: null }], "2027-01-15")).toBe(false);
    expect(acceptTermsSchema.safeParse({ version: "2026-11-11" }).success).toBe(true);
    expect(acceptTermsSchema.safeParse({ version: "latest" }).success).toBe(false);
  });

  it("never signs new people up under Terms older than the current version", () => {
    expect(CONSENT_VERSION >= TERMS_VERSION).toBe(true);
  });

  it("dates the download", () => {
    expect(exportFileName(new Date("2026-11-11T12:00:00Z"))).toBe("consensa-my-data-2026-11-11.json");
  });
});
