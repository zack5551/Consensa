import { describe, expect, it } from "vitest";
import { headerLocaleHref, headerSignInHref, inLocale, isQuestionPath, landingPath, welcomeHref } from "@/lib/return-path";

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

describe("headerLocaleHref (the header language switch)", () => {
  it("keeps next on onboarding and sign-in, in the other language", () => {
    expect(headerLocaleHref("/en/welcome", "/en/q/boc-cut-dec-2026", "fr")).toBe("/fr/welcome?next=/fr/q/boc-cut-dec-2026");
    expect(headerLocaleHref("/fr/sign-in", "/fr/q/boc-cut-dec-2026", "en")).toBe("/en/sign-in?next=/en/q/boc-cut-dec-2026");
  });
  it("drops a next that isn't a safe plain path", () => {
    for (const bad of [null, undefined, "", "//evil.com", "https://evil.com", "/en/q/x?utm_source=a", "/en/../..", "/en/%2F%2Fevil.com"]) {
      expect(headerLocaleHref("/en/welcome", bad, "fr")).toBe("/fr/welcome");
    }
  });
  it("is the bare other-language page everywhere else, even with a next in the address", () => {
    expect(headerLocaleHref("/en/q/boc-cut-dec-2026", "/en/today", "fr")).toBe("/fr/q/boc-cut-dec-2026");
    expect(headerLocaleHref("/fr", null, "en")).toBe("/en");
    expect(headerLocaleHref("/en/welcomex", "/en/q/x", "fr")).toBe("/fr/welcomex");
  });
});

describe("headerSignInHref (the header sign-in button)", () => {
  it("brings people back to the question page they were on", () => {
    expect(headerSignInHref("en", "/en/q/boc-cut-dec-2026", null)).toBe("/en/sign-in?next=/en/q/boc-cut-dec-2026");
    expect(headerSignInHref("fr", "/fr/q/boc-cut-dec-2026", "/fr/today")).toBe("/fr/sign-in?next=/fr/q/boc-cut-dec-2026");
  });
  it("keeps a safe next from onboarding, and drops an unsafe one", () => {
    expect(headerSignInHref("en", "/en/welcome", "/en/q/x")).toBe("/en/sign-in?next=/en/q/x");
    expect(headerSignInHref("en", "/en/welcome", "//evil.com")).toBe("/en/sign-in");
  });
  it("is the plain sign-in page anywhere else", () => {
    for (const path of ["/en", "/en/today", "/en/board", "/en/q/x/called-it/yes", "/en/sign-in"]) {
      expect(headerSignInHref("en", path, "/en/q/x")).toBe("/en/sign-in");
    }
  });
});

describe("isQuestionPath", () => {
  it("is true only for a safe question page", () => {
    expect(isQuestionPath("/en/q/boc-cut-dec-2026")).toBe(true);
    expect(isQuestionPath("/fr/q/boc-cut-dec-2026")).toBe(true);
    for (const other of [null, "/en/today", "/en/q", "/en/q/x/called-it/yes", "//evil.com", "/en/q/x?utm_source=a"]) {
      expect(isQuestionPath(other)).toBe(false);
    }
  });
});
