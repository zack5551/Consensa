import { beforeEach, describe, expect, it, vi } from "vitest";

const { exchangeCodeForSession, consentRows } = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(async (): Promise<{ error: null | { message: string } }> => ({ error: null })),
  consentRows: vi.fn(async () => ({ data: [{ kind: "terms", version: "2026-11-11", given_at: "2026-11-12T00:00:00Z", withdrawn_at: null }] })),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  serverSupabase: async () => ({ auth: { exchangeCodeForSession }, from: () => ({ select: () => ({ eq: consentRows }) }) }),
}));

async function get(query: string) {
  const { GET } = await import("@/app/api/auth/callback/route");
  const { NextRequest } = await import("next/server");
  return GET(new NextRequest(`https://cansensa.test/api/auth/callback?${query}`));
}

describe("GET /api/auth/callback", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
  });

  it("lands on the question the person came from", async () => {
    const res = await get("code=abc&next=/en/q/boc-cut-dec-2026");
    expect(res.headers.get("location")).toBe("https://cansensa.test/en/q/boc-cut-dec-2026");
  });

  it("stays on this site for every hostile next", async () => {
    for (const next of ["//evil.com", "/\\evil.com", "https://evil.com", "/en/../..", "/%2F%2Fevil.com", "/\t/evil.com", "/en\r\nSet-Cookie:x=1"]) {
      const res = await get(`code=abc&next=${encodeURIComponent(next)}`);
      expect(res.headers.get("location")).toBe("https://cansensa.test/en/today");
    }
  });

  it("keeps next on the expired-link page, so a new link still lands there", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "expired" } });
    expect((await get("code=abc&next=/fr/q/x")).headers.get("location")).toBe("https://cansensa.test/fr/sign-in?link=expired&next=/fr/q/x");
    expect((await get("code=abc&next=/fr/q/x?utm_source=a")).headers.get("location")).toBe("https://cansensa.test/fr/sign-in?link=expired");
  });
});
