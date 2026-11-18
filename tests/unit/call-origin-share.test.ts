import { describe, expect, it } from "vitest";
import { MIN_VPN_SAMPLE, vpnSharePercent } from "@/lib/call-origin";

describe("vpnSharePercent", () => {
  it("shows nothing below the minimum of checked calls", () => {
    expect(vpnSharePercent({ total: MIN_VPN_SAMPLE - 1, vpn: 10, unknown: 0 })).toBeNull();
    expect(vpnSharePercent({ total: 500, vpn: 0, unknown: 450 })).toBeNull();
    expect(vpnSharePercent({ total: 0, vpn: 0, unknown: 0 })).toBeNull();
  });
  it("shows a rounded percent of the checked calls at the minimum and above", () => {
    expect(vpnSharePercent({ total: 100, vpn: 12, unknown: 0 })).toBe(12);
    expect(vpnSharePercent({ total: 300, vpn: 20, unknown: 100 })).toBe(10);
    expect(vpnSharePercent({ total: 1000, vpn: 0, unknown: 0 })).toBe(0);
  });
  it("shows nothing for impossible counts", () => {
    expect(vpnSharePercent({ total: 100, vpn: 101, unknown: 0 })).toBeNull();
    expect(vpnSharePercent({ total: Number.NaN, vpn: 1, unknown: 0 })).toBeNull();
  });
});
