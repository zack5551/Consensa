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

const upsert = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/admin", () => ({ adminSupabase: () => ({ from: () => ({ upsert }) }) }));
vi.mock("@/lib/supabase/server", () => ({ serverSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }) }));

describe("POST /api/calls country gate", () => {
  beforeEach(() => {
    upsert.mockClear();
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
  });

  it("lets a call from Canada through to the write on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    const res = await post("CA");
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalled();
  });
});
