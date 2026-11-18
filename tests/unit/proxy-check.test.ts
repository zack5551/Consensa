import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("node:fs", () => ({ existsSync: () => false }));

import { callerIp, checkProxy, flagFromProxyType } from "@/lib/server/proxy-check";

describe("flagFromProxyType", () => {
  it("is true for the proxy types", () => {
    for (const t of ["VPN", "TOR", "PUB", "WEB", "DCH", "RES", "CPN", "EPN"]) expect(flagFromProxyType(t)).toBe(true);
  });
  it("is false for '-' (not a proxy)", () => expect(flagFromProxyType("-")).toBe(false));
  it("is unknown for a missing record, an error message or a search robot", () => {
    for (const t of [null, undefined, "", "SES", "MISSING FILE", "INVALID IP ADDRESS", "NOT SUPPORTED"]) expect(flagFromProxyType(t)).toBe("unknown");
  });
});

describe("callerIp", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("prefers x-real-ip, then the first x-forwarded-for entry, on Vercel only", () => {
    expect(callerIp(h({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }), true)).toBe("203.0.113.7");
    expect(callerIp(h({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }), true)).toBe("198.51.100.1");
    expect(callerIp(h({ "x-real-ip": "203.0.113.7" }), false)).toBeNull();
  });
  it("ignores anything that isn't an address", () => {
    expect(callerIp(h({ "x-real-ip": "nope" }), true)).toBeNull();
    expect(callerIp(h({}), true)).toBeNull();
  });
});

describe("checkProxy without the database", () => {
  beforeEach(() => vi.unstubAllEnvs());
  it("reports unknown, on Vercel or not, and never throws", async () => {
    expect(await checkProxy(new Headers({ "x-real-ip": "203.0.113.7" }))).toEqual({ vpn: "unknown" });
    vi.stubEnv("VERCEL", "1");
    expect(await checkProxy(new Headers({ "x-real-ip": "203.0.113.7" }))).toEqual({ vpn: "unknown" });
  });
});
