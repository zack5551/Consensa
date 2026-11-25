import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const runFromEnv = vi.fn();
vi.mock("@/engine/run", () => ({ runFromEnv: (...args: unknown[]) => runFromEnv(...args) }));

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
    expect(runFromEnv.mock.calls[0]![0]).toMatchObject({ checkThreshold: 7, mailer: expect.any(Function) });
    vi.stubEnv("ENGINE_LIVE_FEEDS", "0");
    await GET(request());
    expect(runFromEnv.mock.calls[1]![0].mailer).toBeUndefined();
  });
});
