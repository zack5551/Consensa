import { beforeEach, describe, expect, it, vi } from "vitest";

const admin = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ adminSupabase: () => admin.client }));

const { GET } = await import("@/app/api/health/route");

function db(error: unknown) {
  const chain = { select: () => chain, limit: async () => ({ error }) };
  return { from: () => chain };
}

describe("/api/health (uptime monitor)", () => {
  beforeEach(() => {
    admin.client = null;
  });

  it("is up with accounts off", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", database: "off" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("checks the database when accounts are on", async () => {
    admin.client = db(null);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", database: "up" });
  });

  it("answers 503 with no error detail when the database is down", async () => {
    admin.client = db({ message: "connection refused at 10.0.0.1", code: "PGRST000" });
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.text();
    expect(body).toBe(JSON.stringify({ status: "degraded", database: "down" }));
    expect(body).not.toMatch(/10\.0\.0\.1|PGRST/);
  });
});
