import { beforeEach, describe, expect, it, vi } from "vitest";

const { botCheck, signInWithOtp } = vi.hoisted(() => ({
  botCheck: vi.fn(async (_p: string | null): Promise<"pass" | "fail" | "skipped"> => "skipped"),
  signInWithOtp: vi.fn(async (_args: unknown): Promise<{ error: null | { code?: string; status?: number } }> => ({ error: null })),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/bot-check", () => ({ verifyBotCheck: (p: string | null) => botCheck(p) }));
vi.mock("@/lib/supabase/server", () => ({ serverSupabase: async () => ({ auth: { signInWithOtp } }) }));

const data = { consentVersion: "2026-11-11", locale: "fr", adult: true, terms: true, region: "QC", topics: [], dataLicensing: false, analytics: false, marketing: false };

async function post(body: unknown, headers: Record<string, string> = {}) {
  const { POST } = await import("@/app/api/auth/sign-up/route");
  const { NextRequest } = await import("next/server");
  return POST(new NextRequest("http://localhost/api/auth/sign-up", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }));
}

describe("POST /api/auth/sign-up", () => {
  beforeEach(() => {
    botCheck.mockReset().mockResolvedValue("skipped");
    signInWithOtp.mockClear();
  });

  it("answers 403 bot check and creates nothing when the check fails", async () => {
    botCheck.mockResolvedValue("fail");
    const res = await post({ email: "a@example.com", data, altcha: "bad" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "bot check" });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("sends the link after a pass or a skipped check, with the callback on this site", async () => {
    for (const verdict of ["pass", "skipped"] as const) {
      botCheck.mockResolvedValue(verdict);
      expect((await post({ email: "a@example.com", data, altcha: "x" })).status).toBe(200);
    }
    expect(signInWithOtp).toHaveBeenCalledTimes(2);
    expect(signInWithOtp).toHaveBeenCalledWith({ email: "a@example.com", options: expect.objectContaining({ shouldCreateUser: true, emailRedirectTo: "http://localhost/api/auth/callback?next=/fr/today" }) });
  });

  it("refuses bad input and other sites", async () => {
    expect((await post({ email: "nope", data })).status).toBe(400);
    expect((await post({ email: "a@example.com", data: { ...data, adult: false } })).status).toBe(400);
    expect((await post({ email: "a@example.com", data }, { Origin: "https://evil.example" })).status).toBe(403);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});
