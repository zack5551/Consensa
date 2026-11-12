import { describe, expect, it } from "vitest";
import { publicSupabase, safeNext, signupMetadataSchema } from "@/lib/supabase/config";

describe("publicSupabase", () => {
  it("is off without both public values, so preview mode and CI need no keys", () => {
    expect(publicSupabase({})).toBeNull();
    expect(publicSupabase({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" })).toBeNull();
    expect(publicSupabase({ NEXT_PUBLIC_SUPABASE_URL: "not a url", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_0123456789abcdef" })).toBeNull();
  });
  it("turns on with a URL and a publishable key", () => {
    expect(publicSupabase({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_0123456789abcdef" })).toEqual({
      url: "https://abc.supabase.co",
      key: "sb_publishable_0123456789abcdef",
    });
  });
});

describe("publicSupabase URL", () => {
  it("keeps only the project origin, so a pasted REST endpoint or stray space still works", () => {
    const key = "sb_publishable_0123456789abcdef";
    expect(publicSupabase({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co/rest/v1/", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key })?.url).toBe("https://abc.supabase.co");
    expect(publicSupabase({ NEXT_PUBLIC_SUPABASE_URL: " https://abc.supabase.co ", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key })?.url).toBe("https://abc.supabase.co");
  });
});

describe("safeNext", () => {
  it("keeps paths inside the app in one of our languages", () => {
    expect(safeNext("/fr/today")).toBe("/fr/today");
    expect(safeNext("/en/q/boc-cut-dec-2026?x=1")).toBe("/en/q/boc-cut-dec-2026?x=1");
  });
  it("never sends people to another site", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "/de/today", "today", "", null, undefined]) {
      expect(safeNext(bad)).toBe("/en/today");
    }
  });
});

describe("signupMetadataSchema", () => {
  const ok = { consentVersion: "2026-11-11", locale: "fr", adult: true, terms: true, region: "QC", topics: ["economy"], dataLicensing: false, analytics: false, marketing: false };
  it("accepts a complete onboarding", () => {
    expect(signupMetadataSchema.safeParse(ok).success).toBe(true);
  });
  it("refuses a signup without the 18+ check or the terms", () => {
    expect(signupMetadataSchema.safeParse({ ...ok, adult: false }).success).toBe(false);
    expect(signupMetadataSchema.safeParse({ ...ok, terms: false }).success).toBe(false);
  });
});
