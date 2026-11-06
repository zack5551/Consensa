import { describe, expect, it } from "vitest";
import { adSlots, adsAllowedOn, isBlockedAdvertiser } from "@/lib/ads";

describe("ad policy", () => {
  it("never allows ads on a question, a record, the trust pages or the embed", () => {
    for (const screen of ["question", "record", "methodology", "resolutions", "embed", "onboarding"]) expect(adsAllowedOn(screen), screen).toBe(false);
  });

  it("only defines slots on screens that allow ads", () => {
    for (const [id, slot] of Object.entries(adSlots)) expect(adsAllowedOn(slot.screen), id).toBe(true);
  });

  it("blocks gambling, prediction-market and crypto-trading advertisers, case-insensitively", () => {
    expect(isBlockedAdvertiser(["Gambling"])).toBe(true);
    expect(isBlockedAdvertiser(["news", "prediction-markets"])).toBe(true);
    expect(isBlockedAdvertiser(["crypto-trading"])).toBe(true);
    expect(isBlockedAdvertiser(["groceries", "telecom"])).toBe(false);
  });
});
