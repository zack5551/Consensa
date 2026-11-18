import { beforeEach, describe, expect, it, vi } from "vitest";

const { botCheck, signInWithOtp, createUser } = vi.hoisted(() => ({
  createUser: vi.fn(async (): Promise<{ error: null | { code?: string; status?: number } }> => ({ error: null })),
  botCheck: vi.fn<(p: string | null) => Promise<"pass" | "fail" | "skipped">>(async () => "skipped"),
  signInWithOtp: vi.fn(async (): Promise<{ error: null | { code?: string; status?: number } }> => ({ error: null })),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/bot-check", () => ({ verifyBotCheck: (p: string | null) => botCheck(p) }));
vi.mock("@/lib/supabase/server", () => ({ serverSupabase: async () => ({ auth: { signInWithOtp } }) }));
vi.mock("@/lib/supabase/admin", () => ({ adminSupabase: () => ({ auth: { admin: { createUser } } }) }));

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
    createUser.mockReset().mockResolvedValue({ error: null });
    vi.resetModules(); // a fresh per-instance rate limit for each test
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
    expect(signInWithOtp).toHaveBeenCalledWith({ email: "a@example.com", options: expect.objectContaining({ shouldCreateUser: false, emailRedirectTo: "http://localhost/api/auth/callback?next=/fr/today" }) });
  });

  it("refuses bad input and other sites", async () => {
    expect((await post({ email: "nope", data })).status).toBe(400);
    expect((await post({ email: "a@example.com", data: { ...data, adult: false } })).status).toBe(400);
    expect((await post({ email: "a@example.com", data }, { Origin: "https://evil.example" })).status).toBe(403);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("points the link at the fixed site address when it is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://cansensa.test/");
    signInWithOtp.mockClear();
    await post({ email: "a@example.com", data });
    expect(signInWithOtp).toHaveBeenCalledWith({ email: "a@example.com", options: expect.objectContaining({ emailRedirectTo: "https://cansensa.test/api/auth/callback?next=/fr/today" }) });
    vi.unstubAllEnvs();
  });

  it("answers ok for every Supabase error except a rate limit, and logs only the code", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const error of [{ code: "user_already_exists", status: 422 }, { code: "email_address_invalid", status: 400 }, { status: 500 }]) {
      signInWithOtp.mockResolvedValueOnce({ error });
      const res = await post({ email: "private@example.com", data });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    }
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private@example.com");
    warn.mockRestore();
  });

  it("answers a generic 429 for a rate limit", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const error of [{ code: "over_email_send_rate_limit", status: 429 }, { code: "over_request_rate_limit" }]) {
      signInWithOtp.mockResolvedValueOnce({ error });
      const res = await post({ email: "a@example.com", data });
      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({ error: "slow down" });
    }
  });

  it("creates the account on the server, with the consent metadata, and never lets the link create one", async () => {
    await post({ email: "a@example.com", data });
    expect(createUser).toHaveBeenCalledWith({ email: "a@example.com", email_confirm: false, user_metadata: expect.objectContaining({ adult: true, terms: true, locale: "fr" }) });
    expect(signInWithOtp).toHaveBeenCalledWith({ email: "a@example.com", options: expect.objectContaining({ shouldCreateUser: false }) });
  });

  it("treats an existing address like a new one: same answer, link sent", async () => {
    createUser.mockResolvedValueOnce({ error: { code: "email_exists", status: 422 } });
    const res = await post({ email: "a@example.com", data });
    expect(await res.json()).toEqual({ ok: true });
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it("answers ok without a link when the account can't be created, and slow down on a rate limit", async () => {
    createUser.mockResolvedValueOnce({ error: { code: "unexpected_failure", status: 500 } });
    expect(await (await post({ email: "a@example.com", data })).json()).toEqual({ ok: true });
    expect(signInWithOtp).not.toHaveBeenCalled();
    createUser.mockResolvedValueOnce({ error: { code: "over_request_rate_limit", status: 429 } });
    expect((await post({ email: "a@example.com", data })).status).toBe(429);
  });

  it("creates nothing when the bot check fails", async () => {
    botCheck.mockResolvedValue("fail");
    await post({ email: "a@example.com", data, altcha: "bad" });
    expect(createUser).not.toHaveBeenCalled();
  });
});
