import { describe, expect, it } from "vitest";
import { consentChangeSchema, consentState, deleteAccountSchema, exportFileName } from "@/lib/account";

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

  it("dates the download", () => {
    expect(exportFileName(new Date("2026-11-11T12:00:00Z"))).toBe("consensa-my-data-2026-11-11.json");
  });
});
