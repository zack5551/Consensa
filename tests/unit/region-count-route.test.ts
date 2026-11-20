import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ adminSupabase: () => ({ rpc }) }));

const slug = "boc-cut-dec-2026";
const rows = [
  { slug, region: "QC", locale: "fr", n: "5", total: "300" },
  { slug, region: "ON", locale: "en", n: "63", total: "2520" },
  { slug, region: "BC", locale: "en", n: "7", total: "350" },
];

async function get(qs: string, headers: Record<string, string> = {}) {
  const { GET } = await import("@/app/api/crowd/region/route");
  const { NextRequest } = await import("next/server");
  return GET(new NextRequest(`http://localhost/api/crowd/region?${qs}`, { headers }));
}

describe("GET /api/crowd/region", () => {
  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ data: rows, error: null });
    vi.unstubAllEnvs();
    vi.resetModules(); // a fresh per-instance rate limit for each test
  });

  it("answers with the one region asked for and nothing about the others", async () => {
    const res = await get(`slug=${slug}&region=ON`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ n: 60 });
    expect(res.headers.get("cache-control")).toContain("s-maxage=60");
  });

  it("answers null for a thin region, under 50 calls, and when counts are suppressed", async () => {
    expect(await (await get(`slug=${slug}&region=AT`)).json()).toEqual({ n: null });
    expect(await (await get(`slug=${slug}&region=QC`)).json()).toEqual({ n: null });
    rpc.mockResolvedValue({ data: [...rows, { slug, region: "AT", locale: "en", n: "1", total: "90" }], error: null });
    expect(await (await get(`slug=${slug}&region=ON`)).json()).toEqual({ n: null });
  });

  it("answers null when the database errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "down" } });
    expect(await (await get(`slug=${slug}&region=ON`)).json()).toEqual({ n: null });
  });

  it("refuses a bad slug or region without touching the database", async () => {
    for (const qs of [`slug=${slug}&region=XX`, "slug=Bad Slug&region=ON", "region=ON"]) {
      expect((await get(qs)).status).toBe(400);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses unknown or repeated params, so the CDN cache key is always just slug and region", async () => {
    for (const qs of [`slug=${slug}&region=ON&x=1`, `slug=${slug}&region=ON&utm_source=a`, `slug=${slug}&region=ON&region=QC`, `slug=${slug}&slug=${slug}&region=ON`]) {
      const res = await get(qs);
      expect(res.status, qs).toBe(400);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown question or one no longer taking calls, before touching the database", async () => {
    for (const qs of ["slug=no-such-question&region=ON", "slug=cpi-sept-2026&region=ON"]) {
      const res = await get(qs);
      expect(res.status, qs).toBe(404);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("allows about 30 lookups a minute per address, then answers 429 without touching the database", async () => {
    vi.stubEnv("VERCEL", "1");
    const a = { "x-real-ip": "203.0.113.7" };
    for (let i = 0; i < 30; i += 1) expect((await get(`slug=${slug}&region=ON`, a)).status).toBe(200);
    rpc.mockClear();
    const res = await get(`slug=${slug}&region=ON`, a);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(rpc).not.toHaveBeenCalled();
    // Another address has its own allowance.
    expect((await get(`slug=${slug}&region=ON`, { "x-real-ip": "203.0.113.8" })).status).toBe(200);
  });
});
