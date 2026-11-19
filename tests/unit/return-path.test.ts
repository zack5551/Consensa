import { describe, expect, it } from "vitest";
import { inLocale, landingPath, welcomeHref } from "@/lib/return-path";

describe("welcomeHref (the sign-up nudge on a question page)", () => {
  it("carries the question path as next, a plain path only", () => {
    expect(welcomeHref("en", "/en/q/boc-cut-dec-2026")).toBe("/en/welcome?next=/en/q/boc-cut-dec-2026");
    expect(welcomeHref("fr", "/fr/q/boc-cut-dec-2026")).toBe("/fr/welcome?next=/fr/q/boc-cut-dec-2026");
  });
  it("falls back to the plain onboarding link when there's nothing safe to carry", () => {
    for (const bad of [null, undefined, "", "//evil.com", "https://evil.com", "/en/q/x?utm_source=a", "/en/../..", "/en/%2F%2Fevil.com"]) {
      expect(welcomeHref("en", bad)).toBe("/en/welcome");
    }
  });
  it("keeps the language-switch step alongside next", () => {
    expect(welcomeHref("fr", "/fr/q/x", "step=age")).toBe("/fr/welcome?step=age&next=/fr/q/x");
    expect(welcomeHref("fr", null, "step=age")).toBe("/fr/welcome?step=age");
  });
});

describe("inLocale", () => {
  it("moves the return page to the other language", () => {
    expect(inLocale("/en/q/x", "fr")).toBe("/fr/q/x");
    expect(inLocale("/fr", "en")).toBe("/en");
  });
  it("gives null for anything unsafe", () => {
    expect(inLocale("//evil.com", "fr")).toBeNull();
    expect(inLocale(null, "fr")).toBeNull();
  });
});

describe("landingPath", () => {
  it("lands on next when it is safe, else today in the person's language", () => {
    expect(landingPath("en", "/en/q/x")).toBe("/en/q/x");
    expect(landingPath("fr", null)).toBe("/fr/today");
    expect(landingPath("fr", "https://evil.com")).toBe("/fr/today");
  });
});
