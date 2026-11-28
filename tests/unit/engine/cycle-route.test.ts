import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const runFromEnv = vi.fn();
vi.mock("@/engine/run", () => ({ runFromEnv: (...args: unknown[]) => runFromEnv(...args) }));
const revalidateTag = vi.fn();
vi.mock("next/cache", async (orig) => ({ ...(await orig<Record<string, unknown>>()), revalidateTag: (tag: string) => revalidateTag(tag) }));

const SECRET = "s".repeat(40);
const ENV = {
  CRON_SECRET: SECRET,
  ENGINE_LIVE_FEEDS: "1",
  ANTHROPIC_API_KEY: "sk-test",
  ENGINE_ALERT_EMAIL: "editor@example.ca",
  SES_ACCESS_KEY_ID: "AKIDEXAMPLE00000",
  SES_SECRET_ACCESS_KEY: "secretsecretsecret",
};

const request = () => new NextRequest("https://example.ca/api/engine/cycle", { headers: { authorization: `Bearer ${SECRET}` } });

describe("cycle route health email", () => {
  const sent: Array<{ url: string; body: string }> = [];
  beforeEach(() => {
    for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
    sent.length = 0;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      sent.push({ url: String(url), body: String(init.body) });
      return new Response("{}", { status: 200 });
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    runFromEnv.mockReset();
  });

  it("emails the editor when a run fails, and answers 500 without leaking the error", async () => {
    runFromEnv.mockRejectedValue(new Error("Supabase GET engine_queue failed: 503"));
    const { GET } = await import("@/app/api/engine/cycle/route");
    const res = await GET(request());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ failed: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe("https://email.ca-central-1.amazonaws.com/v2/email/outbound-emails");
    expect(JSON.parse(sent[0]!.body).Content.Simple.Subject.Data).toBe("PULSE run failed");
  });

  it("passes the mailer to a real run, and none to a sample run", async () => {
    runFromEnv.mockResolvedValue({ report: {} });
    const { GET } = await import("@/app/api/engine/cycle/route");
    await GET(request());
    expect(runFromEnv.mock.calls[0]![0]).toMatchObject({ checkThreshold: 7, mailer: expect.any(Function), autoApprove: true });
    // zack's caps (2026-11-25): 24 a run, 50 a day, US$95 a month.
    expect(runFromEnv.mock.calls[0]![0]).toMatchObject({ maxDrafts: 24, dailyDrafts: 50, monthlyBudgetUsd: 90 });
    // Publishing refreshes the site's question list instead of rebuilding the site.
    runFromEnv.mock.calls[0]![0].onPublished(["a-new-question"]);
    expect(revalidateTag).toHaveBeenCalledWith("live-questions");
    vi.stubEnv("ENGINE_LIVE_FEEDS", "0");
    await GET(request());
    expect(runFromEnv.mock.calls[1]![0].mailer).toBeUndefined();
    expect(runFromEnv.mock.calls[1]![0].autoApprove).toBe(false);
  });

  it("auto-approve can be switched off, and the email links the review page when Supabase is set", async () => {
    runFromEnv.mockResolvedValue({ report: {} });
    vi.stubEnv("ENGINE_AUTO_APPROVE", "0");
    vi.stubEnv("SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "k".repeat(30));
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "example.ca");
    const { GET } = await import("@/app/api/engine/cycle/route");
    await GET(request());
    const opts = runFromEnv.mock.calls[0]![0];
    expect(opts.autoApprove).toBe(false);
    expect(opts.reviewLink()).toMatch(/^https:\/\/example\.ca\/api\/engine\/review\?t=\d+\./);
  });
});

describe("review page route", () => {
  afterEach(() => vi.unstubAllEnvs());
  const page = (t?: string) => new NextRequest(`https://example.ca/api/engine/review${t ? `?t=${encodeURIComponent(t)}` : ""}`);

  it("is off without its settings and refuses a missing, forged or expired link", async () => {
    const { GET, POST } = await import("@/app/api/engine/review/route");
    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await GET(page())).status).toBe(404);
    vi.stubEnv("SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "k".repeat(30));
    expect((await GET(page())).status).toBe(401);
    const { reviewToken } = await import("@/engine/notify/review-link");
    expect((await GET(page(reviewToken("x".repeat(40), new Date())))).status).toBe(401);
    expect((await GET(page(reviewToken(SECRET, new Date(Date.now() - 8 * 86_400_000))))).status).toBe(401);
    const form = new FormData();
    form.set("t", "123.abc");
    form.set("id", "q");
    form.set("action", "approve");
    expect((await POST(new NextRequest("https://example.ca/api/engine/review", { method: "POST", body: form }))).status).toBe(401);
  });
});
