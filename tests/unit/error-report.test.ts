import { describe, expect, it } from "vitest";
import { browserErrorSchema, scrubRoute, scrubText, toErrorEvent } from "@/lib/error-report";

describe("error reports keep nothing personal (AEGIS, LEX)", () => {
  it("keeps only the path", () => {
    expect(scrubRoute("https://consensa.ca/fr/q/boc-hold?ref=email&token=abc#top")).toBe("/fr/q/boc-hold");
    expect(scrubRoute("/en/forecasters/someone@example.com")).toBe("/en/forecasters/:id");
    expect(scrubRoute("/en/x/9f8e7d6c-5b4a-3210-fedc-ba9876543210")).toBe("/en/x/:id");
  });

  it("masks emails, IPs, tokens, quoted text and long numbers", () => {
    const raw =
      'Failed for jane.doe@example.com from 203.0.113.7 and 2001:db8:85a3::8a2e:370:7334 with Bearer abc.def eyJhbGciOi.eyJzdWIi.sig sb_secret_123456789 value "my private note" id 4165551234 at https://x.ca/a?b=c';
    const out = scrubText(raw, 500);
    for (const leak of ["jane.doe", "203.0.113.7", "8a2e", "abc.def", "eyJhbGciOi", "sb_secret_123", "my private note", "4165551234", "b=c"]) {
      expect(out).not.toContain(leak);
    }
    expect(out).toContain("https://x.ca/a");
  });

  it("caps lengths", () => {
    expect(scrubText("a".repeat(900), 500)).toHaveLength(500);
  });

  it("drops fields the browser isn't allowed to send", () => {
    const parsed = browserErrorSchema.parse({ route: "/en", message: "x", formValue: "secret", email: "a@b.ca" });
    expect(parsed).not.toHaveProperty("formValue");
    expect(parsed).not.toHaveProperty("email");
  });

  it("never keeps a browser stack, and checks the digest", () => {
    const e = toErrorEvent("browser", { route: "/en", message: "x", stack: "at page text", digest: "bad digest!" });
    expect(e.stack).toBeNull();
    expect(e.digest).toBeNull();
    expect(toErrorEvent("server", { route: "/en", stack: "at f (a.ts:1)", digest: "123abc" })).toMatchObject({ stack: "at f (a.ts:1)", digest: "123abc" });
  });
});
