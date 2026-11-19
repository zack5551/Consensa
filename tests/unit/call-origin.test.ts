import { beforeEach, describe, expect, it, vi } from "vitest";
import { callsCountFrom, COUNTRY_HEADER } from "@/lib/call-origin";
import { TERMS_VERSION } from "@/lib/supabase/config";

describe("callsCountFrom", () => {
  it("allows Canada on Vercel", () => expect(callsCountFrom("CA", true)).toBe(true));
  it("blocks other countries, a missing header and lowercase on Vercel", () => {
    for (const c of ["US", "FR", "ca", "", "XX", null, undefined]) expect(callsCountFrom(c, true)).toBe(false);
  });
  it("allows anything off Vercel", () => {
    for (const c of ["CA", "US", "", null, undefined]) expect(callsCountFrom(c, false)).toBe(true);
  });
});

const { allow, botCheck } = vi.hoisted(() => ({ allow: vi.fn<(key: string) => boolean>(() => true), botCheck: vi.fn<(payload: string | null) => Promise<"pass" | "fail" | "skipped">>(async () => "skipped") }));
vi.mock("@/lib/rate-limit", () => ({ rateLimiter: () => (key: string) => allow(key) }));
vi.mock("@/lib/server/bot-check", () => ({ verifyBotCheck: (payload: string | null) => botCheck(payload) }));

const upsert = vi.fn(async (): Promise<{ error: { hint?: string } | null }> => ({ error: null }));
const rpc = vi.fn(async () => ({ error: null }));
const checkProxy = vi.fn(async (): Promise<{ vpn: boolean | "unknown" }> => ({ vpn: false }));
vi.mock("next/server", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  after: (fn: () => unknown) => { void fn(); },
}));
vi.mock("@/lib/supabase/admin", () => ({ adminSupabase: () => ({ from: () => ({ upsert }), rpc }) }));
vi.mock("@/lib/server/proxy-check", () => ({ checkProxy: () => checkProxy() }));
// The person's own Terms rows, read with their session (row-level security). Current Terms by default.
const terms = vi.hoisted(() => ({ result: null as null | { data: unknown[] | null; error: { message: string } | null } }));
const currentTerms = () => ({ data: [{ kind: "terms", version: TERMS_VERSION, given_at: "2026-11-11T12:00:00Z", withdrawn_at: null }], error: null });
vi.mock("@/lib/supabase/server", () => ({
  serverSupabase: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({ select: () => ({ eq: async () => terms.result ?? currentTerms() }) }),
  }),
}));

describe("POST /api/calls country gate", () => {
  beforeEach(() => {
    upsert.mockClear();
    rpc.mockClear();
    checkProxy.mockReset().mockResolvedValue({ vpn: false });
    allow.mockReset().mockReturnValue(true);
    botCheck.mockReset().mockResolvedValue("skipped");
    vi.unstubAllEnvs();
    terms.result = null;
  });

  async function post(country?: string, altcha?: string) {
    const { POST } = await import("@/app/api/calls/route");
    const { NextRequest } = await import("next/server");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (country !== undefined) headers[COUNTRY_HEADER] = country;
    if (altcha !== undefined) headers["x-altcha"] = altcha;
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

  it("reads the country only from the Vercel header, never from the body, the query or another header (AEGIS)", async () => {
    vi.stubEnv("VERCEL", "1");
    const { POST } = await import("@/app/api/calls/route");
    const { NextRequest } = await import("next/server");
    const res = await POST(new NextRequest("http://localhost/api/calls?country=CA&x-vercel-ip-country=CA", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-country": "CA", "cf-ipcountry": "CA", "x-geo-country": "CA" },
      body: JSON.stringify({ slug: "boc-cut-dec-2026", probability: 60, country: "CA", [COUNTRY_HEADER]: "CA" }),
    }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "outside canada" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rate limits callers from outside canada too: the limit comes before the country check", async () => {
    vi.stubEnv("VERCEL", "1");
    allow.mockReturnValue(false);
    const res = await post("US");
    expect(res.status).toBe(429);
    expect(allow).toHaveBeenCalledWith("u1");
    expect(botCheck).not.toHaveBeenCalled();
  });

  it("answers 403 bot check on a failed check and writes nothing", async () => {
    botCheck.mockResolvedValue("fail");
    const res = await post("CA", "bad");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "bot check" });
    expect(botCheck).toHaveBeenCalledWith("bad");
    expect(upsert).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("answers the country 403 before the bot check runs", async () => {
    vi.stubEnv("VERCEL", "1");
    botCheck.mockResolvedValue("fail");
    expect(await (await post("US", "bad")).json()).toEqual({ error: "outside canada" });
    expect(botCheck).not.toHaveBeenCalled();
  });

  it("lets a call with a passing or skipped check through", async () => {
    botCheck.mockResolvedValueOnce("pass");
    expect((await post("CA", "good")).status).toBe(200);
    expect((await post()).status).toBe(200);
    expect(botCheck).toHaveBeenLastCalledWith(null);
  });

  it("lets a call from Canada through to the write on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    const res = await post("CA");
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalled();
  });

  it("counts each accepted call once with the right flag", async () => {
    for (const [vpn, p_vpn] of [[false, "no"], ["unknown", "unknown"]] as const) {
      rpc.mockClear();
      checkProxy.mockResolvedValueOnce({ vpn });
      expect((await post()).status).toBe(200);
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith("count_call_origin", { p_vpn });
    }
  });

  it("refuses a VPN call with 403, writes nothing and counts the attempt once (zack, 2026-11-18)", async () => {
    vi.stubEnv("VERCEL", "1");
    checkProxy.mockResolvedValueOnce({ vpn: true });
    const res = await post("CA");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "vpn" });
    expect(upsert).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("count_call_origin", { p_vpn: "yes" });
  });

  it("lets a call through when the connection check is slow (150 ms) and counts it as unknown", async () => {
    checkProxy.mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve({ vpn: true }), 400)));
    expect((await post()).status).toBe(200);
    expect(upsert).toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("count_call_origin", { p_vpn: "unknown" });
  });

  it("runs the bot check before the connection check", async () => {
    botCheck.mockResolvedValue("fail");
    checkProxy.mockResolvedValueOnce({ vpn: true });
    expect(await (await post("CA", "bad")).json()).toEqual({ error: "bot check" });
    expect(checkProxy).not.toHaveBeenCalled();
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

describe("POST /api/calls needs the current Terms (Terms s. 18)", () => {
  beforeEach(() => {
    upsert.mockClear();
    rpc.mockClear();
    checkProxy.mockReset().mockResolvedValue({ vpn: false });
    allow.mockReset().mockReturnValue(true);
    botCheck.mockReset().mockResolvedValue("skipped");
    vi.unstubAllEnvs();
    terms.result = null;
  });

  async function post() {
    const { POST } = await import("@/app/api/calls/route");
    const { NextRequest } = await import("next/server");
    return POST(new NextRequest("http://localhost/api/calls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: "boc-cut-dec-2026", probability: 60 }) }));
  }

  it("saves the call when the person accepted the current Terms", async () => {
    expect((await post()).status).toBe(200);
    expect(upsert).toHaveBeenCalled();
  });

  it("answers 403 terms and writes nothing when only older Terms were accepted, or they were withdrawn, or there are none", async () => {
    for (const data of [
      [{ kind: "terms", version: "2026-10-01", given_at: "2026-10-01T12:00:00Z", withdrawn_at: null }],
      [{ kind: "terms", version: "2026-11-11", given_at: "2026-11-11T12:00:00Z", withdrawn_at: "2026-11-12T12:00:00Z" }],
      [],
      null,
    ]) {
      terms.result = { data, error: null };
      const res = await post();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "terms" });
    }
    expect(upsert).not.toHaveBeenCalled();
  });

  it("still counts calls under the old Terms before the new ones take effect (30-day notice period, LEX)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const dayBefore = new Date(`${TERMS_VERSION}T00:00:00Z`);
      dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
      vi.setSystemTime(dayBefore);
      terms.result = { data: [], error: { message: "not even read" } };
      expect((await post()).status).toBe(200);
      expect(upsert).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses with 503 when the Terms can't be read: fail closed, nothing written", async () => {
    terms.result = { data: null, error: { message: "down" } };
    const res = await post();
    expect(res.status).toBe(503);
    expect(upsert).not.toHaveBeenCalled();
  });
});
