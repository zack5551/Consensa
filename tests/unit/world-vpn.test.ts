import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { originFromVpn, withinTime } from "@/lib/call-origin";
import { MIN_CROWD, summarize, summarizeWorld } from "@/lib/live-crowd";

const root = join(__dirname, "..", "..");
const migration = readFileSync(join(root, "supabase", "migrations", "20261118000200_call_origin_column.sql"), "utf8");
const sql = migration.replace(/--[^\n]*/g, "");

const { upsert, rpc, checkProxy, select } = vi.hoisted(() => ({
  upsert: vi.fn<(row: unknown) => Promise<{ error: { hint?: string } | null }>>(async () => ({ error: null })),
  rpc: vi.fn(async () => ({ error: null })),
  checkProxy: vi.fn(async (): Promise<{ vpn: boolean | "unknown" }> => ({ vpn: false })),
  select: vi.fn<(cols: string) => unknown>(() => ({
    order: async () => ({ data: [{ slug: "a", probability: 50, origin: "vpn" }], error: null }),
    maybeSingle: async () => ({ data: {}, error: null }),
  })),
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimiter: () => () => true }));
vi.mock("@/lib/server/bot-check", () => ({ verifyBotCheck: async () => "skipped" }));
vi.mock("next/server", async (orig) => ({ ...(await orig<Record<string, unknown>>()), after: (fn: () => unknown) => { void fn(); } }));
vi.mock("@/lib/supabase/admin", () => ({ adminSupabase: () => ({ from: () => ({ upsert }), rpc }) }));
vi.mock("@/lib/server/proxy-check", () => ({ checkProxy: () => checkProxy() }));
vi.mock("@/lib/supabase/server", () => ({ serverSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }) }));
vi.mock("@/lib/supabase/account-server", () => ({
  noStore: {},
  signedIn: async () => ({ ok: true, user: { id: "u1", email: "a@b.ca", createdAt: "x" }, supabase: { from: () => ({ select }) } }),
}));

describe("the origin migration", () => {
  it("adds a checked origin column that defaults to canada", () => {
    expect(sql).toMatch(/add column if not exists origin text not null default 'canada'/);
    expect(sql).toMatch(/check \(origin in \('canada', 'vpn'\)\)/);
  });

  it("the Canada crowd reads only canada rows, and the World/VPN function only vpn rows", () => {
    const fn = (name: string) => sql.split(/create or replace function/).find((s) => s.includes(`public.${name}(`)) ?? "";
    expect(fn("crowd_summary")).toMatch(/c\.origin = 'canada'/);
    expect(fn("crowd_summary")).not.toMatch(/vpn/);
    expect(fn("crowd_world_vpn")).toMatch(/c\.origin = 'vpn'/);
    expect(fn("crowd_world_vpn")).not.toMatch(/canada/);
  });

  it("changes no policy and opens no write rights", () => {
    expect(sql).not.toMatch(/policy|grant (insert|update|all)/i);
  });

  it("is safe to run again and is in the README list", () => {
    expect(sql).toMatch(/drop constraint if exists calls_origin_check/);
    expect(readFileSync(join(root, "docs", "accounts", "README.md"), "utf8")).toContain("20261118000200_call_origin_column.sql");
  });

  it("deleting an account removes calls (and so their origin) by cascade", () => {
    const accounts = readFileSync(join(root, "supabase", "migrations", "20261111000000_accounts.sql"), "utf8");
    expect(accounts).toMatch(/create table if not exists public\.calls \(\s*user_id uuid not null references auth\.users \(id\) on delete cascade/);
  });
});

describe("the World/VPN group", () => {
  it("shows an average only from 5 calls, and keeps its own count", () => {
    expect(MIN_CROWD).toBe(5);
    expect(summarizeWorld([{ slug: "a", n: 4, total: 240 }]).has("a")).toBe(false);
    expect(summarizeWorld([{ slug: "a", n: 12, total: 696 }]).get("a")).toEqual({ n: 12, mean: 58 });
  });

  it("is separate from the Canada summary", () => {
    const canada = summarize([{ slug: "a", region: null, locale: null, n: 10, total: 400 }]);
    expect(canada.get("a")?.mean).toBe(40);
    expect(summarizeWorld([{ slug: "a", n: 12, total: 696 }]).get("a")?.mean).toBe(58);
  });
});

describe("origin helpers", () => {
  it("maps the check to an origin", () => {
    expect(originFromVpn(true)).toBe("vpn");
    expect(originFromVpn(false)).toBe("canada");
    expect(originFromVpn("unknown")).toBe("canada");
  });

  it("withinTime gives the fallback on a timeout or a failure, and the answer when it is quick", async () => {
    expect(await withinTime(new Promise<string>(() => {}), 20, "late")).toBe("late");
    expect(await withinTime(Promise.reject(new Error("x")), 20, "failed"), "failed").toBe("failed");
    expect(await withinTime(Promise.resolve("ok"), 20, "late")).toBe("ok");
  });
});

describe("POST /api/calls origin", () => {
  beforeEach(() => {
    upsert.mockClear();
    rpc.mockClear();
    checkProxy.mockReset().mockResolvedValue({ vpn: false });
  });

  async function send(body: unknown) {
    const { POST } = await import("@/app/api/calls/route");
    const { NextRequest } = await import("next/server");
    return POST(new NextRequest("http://localhost/api/calls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  }
  const saved = () => upsert.mock.calls.map((c) => c[0] as Record<string, unknown>).find((row) => "probability" in row);

  it("saves 'vpn' only for a VPN call; direct and unchecked calls are 'canada'", async () => {
    for (const [vpn, origin] of [[true, "vpn"], [false, "canada"], ["unknown", "canada"]] as const) {
      upsert.mockClear();
      checkProxy.mockResolvedValueOnce({ vpn });
      expect((await send({ slug: "boc-cut-dec-2026", probability: 60 })).status).toBe(200);
      expect(saved()?.origin).toBe(origin);
    }
  });

  it("a check that times out saves 'canada' and counts as unchecked, without waiting for it", async () => {
    checkProxy.mockReturnValueOnce(new Promise(() => {}));
    const started = Date.now();
    expect((await send({ slug: "boc-cut-dec-2026", probability: 60 })).status).toBe(200);
    expect(Date.now() - started).toBeLessThan(1500);
    expect(saved()?.origin).toBe("canada");
    expect(rpc).toHaveBeenCalledWith("count_call_origin", { p_vpn: "unknown" });
  });

  it("a check that throws saves 'canada'", async () => {
    checkProxy.mockRejectedValueOnce(new Error("boom"));
    expect((await send({ slug: "boc-cut-dec-2026", probability: 60 })).status).toBe(200);
    expect(saved()?.origin).toBe("canada");
  });

  it("never takes the origin from the body: a body with origin is refused and nothing is written", async () => {
    for (const origin of ["vpn", "canada"]) expect((await send({ slug: "boc-cut-dec-2026", probability: 60, origin })).status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("stores no address or proxy type, only the label", async () => {
    checkProxy.mockResolvedValueOnce({ vpn: true });
    await send({ slug: "boc-cut-dec-2026", probability: 60 });
    expect(Object.keys(saved() ?? {}).sort()).toEqual(["origin", "probability", "slug", "user_id"]);
  });
});

describe("account export", () => {
  it("includes the origin of each call", async () => {
    const { GET } = await import("@/app/api/account/export/route");
    const body = JSON.parse(await (await GET()).text()) as { calls: { origin: string }[] };
    expect(select.mock.calls.some(([cols]) => /\borigin\b/.test(cols) && /slug/.test(cols))).toBe(true);
    expect(body.calls[0]?.origin).toBe("vpn");
  });
});
