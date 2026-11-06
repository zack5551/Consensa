import { describe, expect, it } from "vitest";
import { ageOn, consentSchema, isAdult, nextStep, previousStep, profileSchema, stepNumber, todayInToronto } from "@/lib/onboarding";

describe("age gate", () => {
  it("counts whole years and flips on the birthday, not before", () => {
    expect(ageOn("2008-11-06", "2026-11-05")).toBe(17);
    expect(ageOn("2008-11-06", "2026-11-06")).toBe(18);
    expect(isAdult("2008-11-07", "2026-11-06")).toBe(false);
    expect(isAdult("2008-11-06", "2026-11-06")).toBe(true);
  });
  it("handles a Feb. 29 birthday on a non-leap year", () => {
    expect(ageOn("2008-02-29", "2026-02-28")).toBe(17);
    expect(ageOn("2008-02-29", "2026-03-01")).toBe(18);
  });
  it("rejects impossible or malformed dates instead of letting them through", () => {
    expect(isAdult("2001-02-30", "2026-11-06")).toBe(false);
    expect(isAdult("06/11/2001", "2026-11-06")).toBe(false);
    expect(isAdult("", "2026-11-06")).toBe(false);
  });
  it("uses Toronto's calendar date", () => {
    // 03:00 UTC on Nov 6 is still Nov 5 in Toronto.
    expect(todayInToronto(new Date("2026-11-06T03:00:00Z"))).toBe("2026-11-05");
  });
});

describe("consents", () => {
  it("requires the terms and nothing else", () => {
    expect(consentSchema.safeParse({ terms: true, dataLicensing: false, marketing: false }).success).toBe(true);
    expect(consentSchema.safeParse({ terms: false, dataLicensing: true, marketing: true }).success).toBe(false);
  });
  it("validates a full profile", () => {
    const ok = profileSchema.safeParse({
      locale: "fr",
      birthDate: "1990-05-01",
      region: "QC",
      topics: ["economy"],
      email: "lea@example.ca",
      consents: { terms: true, dataLicensing: false, marketing: false },
    });
    expect(ok.success).toBe(true);
    expect(profileSchema.safeParse({ ...ok.data, email: "not-an-email" }).success).toBe(false);
  });
});

describe("steps", () => {
  it("moves forward and back and stops at the ends", () => {
    expect(nextStep("language")).toBe("age");
    expect(nextStep("done")).toBe("done");
    expect(previousStep("language")).toBe("language");
    expect(previousStep("account")).toBe("topics");
  });
  it("numbers steps without counting the final screen", () => {
    expect(stepNumber("language")).toEqual({ current: 1, total: 5 });
    expect(stepNumber("account")).toEqual({ current: 5, total: 5 });
    expect(stepNumber("done")).toEqual({ current: 5, total: 5 });
  });
});
