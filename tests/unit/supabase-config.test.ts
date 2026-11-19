import { describe, expect, it } from "vitest";
import { MAX_NEXT_LENGTH, publicSupabase, returnPath, safeNext, signupMetadataSchema } from "@/lib/supabase/config";

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

/** Each one tries to leave the site, or the locale folder, once a browser or `new URL` reads it. */
const hostile = [
  "//evil.com",
  "///evil.com",
  "/\\evil.com",
  "/\\/evil.com",
  "https://evil.com",
  "javascript:alert(1)",
  "/en/../..",
  "/en/../../evil.com",
  "/en/./q",
  "/en/%2e%2e/%2e%2e",
  "/en/%2E%2E",
  "/en/%2F%2Fevil.com",
  "/%2F%2Fevil.com",
  "/en/q/%5cevil.com",
  "/en/%",
  "/\t/evil.com",
  "/en\r\nSet-Cookie: x=1",
  "/en/q/x\nLocation: https://evil.com",
  "/en/\u0000",
  `/en/q/${"a".repeat(MAX_NEXT_LENGTH)}`,
];

describe("safeNext against hostile values", () => {
  it.each(hostile)("refuses %j", (bad) => {
    expect(safeNext(bad)).toBe("/en/today");
    expect(returnPath(bad)).toBeNull();
  });
  it("never resolves to another origin, even read the way a browser would", () => {
    for (const bad of hostile) expect(new URL(safeNext(bad), "https://cansensus.ca").origin).toBe("https://cansensus.ca");
  });
  it("still keeps a long but reasonable path", () => {
    const path = `/en/q/${"a".repeat(MAX_NEXT_LENGTH - 10)}`;
    expect(safeNext(path)).toBe(path);
  });
});

describe("returnPath", () => {
  it("keeps a plain path in one of our languages", () => {
    expect(returnPath("/en/q/boc-cut-dec-2026")).toBe("/en/q/boc-cut-dec-2026");
    expect(returnPath("/fr/today")).toBe("/fr/today");
    expect(returnPath("/fr")).toBe("/fr");
  });
  it("drops anything that isn't a plain path: queries, fragments, other languages, spaces, nothing", () => {
    for (const bad of ["/en/q/x?utm_source=mail", "/en/q/x#top", "/en/q/x?next=//evil.com", "/de/q/x", "/en/q/a b", "/en/q/é", "", null, undefined]) {
      expect(returnPath(bad)).toBeNull();
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
