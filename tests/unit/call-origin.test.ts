import { beforeEach, describe, expect, it, vi } from "vitest";
import { callsCountFrom, COUNTRY_HEADER } from "@/lib/call-origin";

describe("callsCountFrom", () => {
  it("allows Canada on Vercel", () => expect(callsCountFrom("CA", true)).toBe(true));
  it("blocks other countries, a missing header and lowercase on Vercel", () => {
    for (const c of ["US", "FR", "ca", "", "XX", null, undefined]) expect(callsCountFrom(c, true)).toBe(false);
  });
  it("allows anything off Vercel", () => {
    for (const c of ["CA", "US", "", null, undefined]) expect(callsCountFrom(c, false)).toBe(true);
  });
});

const upsert = vi.fn(async (): Promise<{ error: { hint?: string } | null }> => ({ error: null }));
const rpc = vi.fn(async () => ({ error: null }));
const checkProxy = vi.fn(async (): Promise<{ vpn: boolean | "unknown" }> => ({ vpn: false }));
vi.mock("next/server", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  after: (fn: () => unknown) => { void fn(); },
}));
vi.mock("@/lib/supabase/admin", () => ({ adminSupabase: () => ({ from: () => ({ upsert }), rpc }) }));
vi.mock("@/lib/server/proxy-check", () => ({ checkProxy: () => checkProxy() }));
vi.mock("@/lib/supabase/server", () => ({ serverSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }) }));

describe("POST /api/calls country gate", () => {
  beforeEach(() => {
    upsert.mockClear();
    rpc.mockClear();
    checkProxy.mockClear();
    vi.unstubAllEnvs();
  });

  async function post(country?: string) {
    const { POST } = await import("@/app/api/calls/route");
    const { NextRequest } = await import("next/server");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (country !== undefined) headers[COUNTRY_HEADER] = country;
    return POST(new NextRequest("http://localhost/api/calls", { method: "POST", headers, body: JSON.stringify({ slug: "boc-cut-dec-2026", probability: 60 }) }));
  }

  it("answers 403 outside canada on Vercel and writes nothing", async () => {
    vi.stubEnv("VERCEL", "1");
    for (const c of ["US", undefined]) {
      const res = await post(c);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "outside canada" });
    }
    expect(upsert).not.toHaveBeenCalled();
    expect(checkProxy).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("lets a call from Canada through to the write on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    const res = await post("CA");
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalled();
  });

  it("counts each accepted call once with the right flag, and still accepts a VPN call", async () => {
    for (const [vpn, p_vpn] of [[true, "yes"], [false, "no"], ["unknown", "unknown"]] as const) {
      rpc.mockClear();
      checkProxy.mockResolvedValueOnce({ vpn });
      expect((await post()).status).toBe(200);
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith("count_call_origin", { p_vpn });
    }
  });

  it("never counts an invalid, unknown-question or failed-write call", async () => {
    const { POST } = await import("@/app/api/calls/route");
    const { NextRequest } = await import("next/server");
    const send = (body: unknown) => POST(new NextRequest("http://localhost/api/calls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    expect((await send({ slug: "boc-cut-dec-2026", probability: 0 })).status).toBe(400);
    expect((await send({ slug: "no-such-question", probability: 50 })).status).toBe(404);
    upsert.mockResolvedValueOnce({ error: null }); // the close time
    upsert.mockResolvedValueOnce({ error: { hint: "closed" } }); // the call itself
    expect((await send({ slug: "boc-cut-dec-2026", probability: 50 })).status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });
});
