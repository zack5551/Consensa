import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ adminSupabase: () => ({ rpc }) }));

const slug = "boc-cut-dec-2026";
const rows = [
  { slug, region: "QC", locale: "fr", n: "5", total: "300" },
  { slug, region: "ON", locale: "en", n: "6", total: "240" },
  { slug, region: "BC", locale: "en", n: "7", total: "350" },
];

async function get(qs: string) {
  const { GET } = await import("@/app/api/crowd/region/route");
  const { NextRequest } = await import("next/server");
  return GET(new NextRequest(`http://localhost/api/crowd/region?${qs}`));
}

describe("GET /api/crowd/region", () => {
  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ data: rows, error: null });
  });

  it("answers with the one region asked for and nothing about the others", async () => {
    const res = await get(`slug=${slug}&region=ON`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ n: 6 });
    expect(res.headers.get("cache-control")).toContain("s-maxage=60");
  });

  it("answers null for a thin region and when counts are suppressed", async () => {
    expect(await (await get(`slug=${slug}&region=AT`)).json()).toEqual({ n: null });
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
});
