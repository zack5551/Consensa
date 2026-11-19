import { beforeEach, describe, expect, it, vi } from "vitest";
import { LINK_COOKIE, newPkce, sealLink } from "@/lib/social-voting/pkce";
import { TERMS_VERSION } from "@/lib/supabase/config";
import { fixture } from "./helpers";

const SECRET = "s".repeat(40);
const USER = "0b0e7a52-4f0c-4b56-9d58-2f1f6d1c9a11";
const ORIGIN = "http://localhost";

type Op = { table?: string; rpc?: string; action?: string; values?: unknown; args?: unknown };

const h = vi.hoisted(() => ({
  ops: [] as Array<{ table?: string; rpc?: string; action?: string; values?: unknown; args?: unknown }>,
  user: null as null | { id: string; email: string; email_confirmed_at: string | null },
  botCheck: "skipped" as "pass" | "fail" | "skipped",
  rpc: {} as Record<string, unknown>,
  rows: {} as Record<string, unknown>,
  failInsert: "" as string,
}));

/** A stand-in for a Supabase client: every write is recorded in `ops`; reads answer from `rows`, calls from `rpc`. */
function client() {
  const from = (table: string) => {
    const op: Op = { table, action: "select" };
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "order", "range", "lt", "in", "not", "limit"]) builder[m] = () => builder;
    for (const m of ["insert", "update", "upsert", "delete"]) {
      builder[m] = (values?: unknown) => {
        op.action = m;
        op.values = values;
        h.ops.push(op);
        return builder;
      };
    }
    const answer = () => (op.action === "insert" && h.failInsert === table ? { data: null, error: { message: "down" } } : { data: op.action === "select" ? (h.rows[table] ?? []) : null, error: null, count: 0 });
    builder.maybeSingle = async () => ({ data: (h.rows[table] as unknown[] | undefined)?.[0] ?? null, error: null });
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(answer()).then(resolve);
    return builder;
  };
  return {
    from,
    rpc: async (name: string, args: unknown) => {
      h.ops.push({ rpc: name, args });
      return { data: h.rpc[name] ?? null, error: null };
    },
    auth: { getUser: async () => ({ data: { user: h.user } }) },
  };
}

const later: Array<() => Promise<void>> = [];
vi.mock("server-only", () => ({}));
// `after` runs once the answer is sent; here it is collected and run by the test.
vi.mock("next/server", async (original) => ({ ...(await original<Record<string, unknown>>()), after: (fn: () => Promise<void>) => void later.push(fn) }));
// The VPN lookup: "unknown" by default (no database in tests); a test sets it to a clear answer when it needs one.
const proxy = vi.hoisted(() => ({ vpn: "unknown" as boolean | "unknown" }));
vi.mock("@/lib/server/proxy-check", async (original) => ({ ...(await original<Record<string, unknown>>()), checkProxy: async () => ({ vpn: proxy.vpn }) }));
vi.mock("@/lib/server/bot-check", () => ({ verifyBotCheck: async () => h.botCheck }));
vi.mock("@/lib/supabase/server", () => ({ serverSupabase: async () => client() }));
vi.mock("@/lib/supabase/admin", () => ({ adminSupabase: () => client() }));

const xAnswers: Array<[RegExp, unknown]> = [
  [/oauth2\/token$/, { access_token: "one-time-user-token" }],
  [/users\/me/, fixture("x-me.json")],
  [/oauth2\/revoke$/, {}],
];
const outside: string[] = [];

function stubFetch(answers: Array<[RegExp, unknown]> = xAnswers) {
  vi.stubGlobal("fetch", async (url: string) => {
    outside.push(String(url));
    const hit = answers.find(([re]) => re.test(String(url)));
    return new Response(JSON.stringify(hit?.[1] ?? {}), { status: hit ? 200 : 404 });
  });
}

function on(extra: Record<string, string> = {}) {
  vi.stubEnv("SOCIAL_VOTING", "1");
  vi.stubEnv("SOCIAL_LINK_SECRET", SECRET);
  vi.stubEnv("X_CLIENT_ID", "client-1");
  for (const [k, v] of Object.entries(extra)) vi.stubEnv(k, v);
}

async function request(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string>; cookie?: string } = {}) {
  const { NextRequest } = await import("next/server");
  return new NextRequest(`${ORIGIN}${path}`, {
    method: init.method ?? "GET",
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.cookie ? { Cookie: init.cookie } : {}), ...init.headers },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });
}

const start = async (body: unknown = { platform: "x", consent: true, locale: "en" }, headers: Record<string, string> = {}) =>
  (await import("@/app/api/account/social/start/route")).POST(await request("/api/account/social/start", { method: "POST", body, headers }));

async function callback(query: string, cookie?: string, headers: Record<string, string> = {}) {
  return (await import("@/app/api/account/social/callback/route")).GET(await request(`/api/account/social/callback?${query}`, { cookie: cookie ? `${LINK_COOKIE}=${cookie}` : undefined, headers }));
}

function sealed(overrides: Partial<{ userId: string; origin: string; at: Date }> = {}) {
  const pkce = newPkce();
  const cookie = sealLink({ platform: "x", state: pkce.state, verifier: pkce.verifier, userId: overrides.userId ?? USER, origin: overrides.origin ?? ORIGIN, locale: "fr", consent: true }, SECRET, overrides.at ?? new Date());
  return { ...pkce, cookie };
}

const result = (res: Response) => new URL(res.headers.get("location") ?? "http://none").searchParams.get("result");

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules(); // fresh per-instance rate limits
  h.ops.length = 0;
  outside.length = 0;
  h.user = { id: USER, email: "a@example.ca", email_confirmed_at: "2026-11-01T00:00:00Z" };
  h.botCheck = "skipped";
  h.rpc = { link_social_account: "linked", unlink_social_account: true };
  h.rows = {};
  h.failInsert = "";
  later.length = 0;
  stubFetch();
});

describe("flag off: nothing runs", () => {
  it("every social route answers 404 and touches nothing", async () => {
    const social = await import("@/app/api/account/social/route");
    expect((await social.GET()).status).toBe(404);
    expect((await social.DELETE(await request("/api/account/social", { method: "DELETE", body: { platform: "x" } }))).status).toBe(404);
    expect((await start()).status).toBe(404);
    const { state, cookie } = sealed();
    expect((await callback(`state=${state}&code=abc`, cookie)).status).toBe(404);
    expect(h.ops).toEqual([]);
    expect(outside).toEqual([]);
  });

  it("the daily step returns null without calling any platform or the database, whatever keys are set", async () => {
    const { runSocialStep } = await import("@/lib/social-voting/run");
    const keys = { SOCIAL_LINK_SECRET: SECRET, X_BEARER_TOKEN: "b", X_MONTHLY_CAP_USD: "25", META_PAGE_TOKEN: "m", SOCIAL_AUTO_REPLY: "1" };
    expect(await runSocialStep(new Date(), keys)).toBeNull();
    expect(await runSocialStep(new Date(), { ...keys, SOCIAL_VOTING: "0" })).toBeNull();
    expect(await runSocialStep(new Date(), { ...keys, SOCIAL_VOTING: "yes" })).toBeNull(); // only "1" turns it on
    expect(outside).toEqual([]);
    expect(h.ops).toEqual([]);
  });

  it("the flags default to off, the auto-reply needs both, and a bad value turns everything off", async () => {
    const { autoReplyOn, socialEnv, socialVotingOn } = await import("@/lib/social-voting/env");
    expect(socialVotingOn({})).toBe(false);
    expect(autoReplyOn({ SOCIAL_AUTO_REPLY: "1" })).toBe(false);
    expect(autoReplyOn({ SOCIAL_VOTING: "1" })).toBe(false);
    expect(autoReplyOn({ SOCIAL_VOTING: "1", SOCIAL_AUTO_REPLY: "1" })).toBe(true);
    expect(socialVotingOn({ SOCIAL_VOTING: "1", X_MONTHLY_CAP_USD: "lots" })).toBe(false);
    expect(socialVotingOn({ SOCIAL_VOTING: "1", SOCIAL_LINK_SECRET: "short" })).toBe(false);
    expect(socialEnv({ SOCIAL_VOTING: "1" }).X_MONTHLY_CAP_USD).toBe(0); // no cap set means no paid reads
  });

  it("the website call is saved without the new column while the flag is off, and as a website call once it is on", async () => {
    // A person who accepted the current Terms: calls need them (AEGIS, Terms s. 18).
    h.rows.consent_log = [{ kind: "terms", version: TERMS_VERSION, given_at: "2026-11-19T12:00:00Z", withdrawn_at: null }];
    const save = async () => {
      const { POST } = await import("@/app/api/calls/route");
      const res = await POST(await request("/api/calls", { method: "POST", body: { slug: "boc-cut-dec-2026", probability: 62 } }));
      expect(res.status).toBe(200);
      return h.ops.find((o) => o.table === "calls")?.values;
    };
    expect(await save()).toEqual({ user_id: USER, slug: "boc-cut-dec-2026", probability: 62 });
    for (const fn of later.splice(0)) await fn();
    expect(h.ops.filter((o) => o.table === "social_links")).toEqual([]); // and the links table isn't touched
    h.ops.length = 0;
    vi.resetModules();
    on();
    expect(await save()).toEqual({ user_id: USER, slug: "boc-cut-dec-2026", probability: 62, source: "web" });
    // With the flag on, an unknown VPN answer proves nothing: the links are left alone and a pause stays (AEGIS).
    for (const fn of later.splice(0)) await fn();
    expect(h.ops.filter((o) => o.table === "social_links")).toEqual([]);
    // A call from Canada with a clear "not a VPN" answer is the monthly re-check: it refreshes the links and lifts a pause.
    h.ops.length = 0;
    proxy.vpn = false;
    try {
      await save();
      for (const fn of later.splice(0)) await fn();
    } finally {
      proxy.vpn = "unknown";
    }
    expect(h.ops.find((o) => o.table === "social_links")).toMatchObject({ action: "update", values: { paused: false, last_checked_at: expect.any(String) } });
  });

  it("linking fails closed on Vercel: only a clear not-a-VPN answer lets it through (AEGIS)", async () => {
    const { connectionAllowed } = await import("@/lib/social-voting/link-checks");
    const headers = new Headers({ "x-vercel-ip-country": "CA" });
    const answer = async (vpn: boolean | "unknown") => {
      proxy.vpn = vpn;
      try {
        return await connectionAllowed(headers);
      } finally {
        proxy.vpn = "unknown";
      }
    };
    expect(await answer("unknown")).toBe(true); // off Vercel (local, e2e) an unknown answer is let through
    expect(await answer(true)).toBe(false);
    vi.stubEnv("VERCEL", "1");
    try {
      expect(await answer("unknown")).toBe(false);
      expect(await answer(true)).toBe(false);
      expect(await answer(false)).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("the auto-reply link is the plain page address, with nothing to track", async () => {
    const { autoReplyText } = await import("@/lib/social-voting/run");
    const text = autoReplyText("https://cansensa.test");
    expect(text.en).toBe("To have your call count in “Canada says”, link your account: https://cansensa.test/en/account/social");
    expect(text.fr).toContain("https://cansensa.test/fr/account/social");
    for (const t of Object.values(text)) expect(t).not.toMatch(/[?&#]|utm_|ref=/);
  });
});

describe("POST /api/account/social/start", () => {
  it("sets the signed cookie and answers with X's sign-in address", async () => {
    on();
    const res = await start();
    expect(res.status).toBe(200);
    const url = new URL(((await res.json()) as { url: string }).url);
    expect(url.origin + url.pathname).toBe("https://x.com/i/oauth2/authorize");
    expect(url.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/account/social/callback`);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(new RegExp(`^${LINK_COOKIE}=`));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Max-Age=600/);
    expect(cookie).toMatch(/Path=\/api\/account\/social/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(outside).toEqual([]); // nothing is sent to X until the person goes there
    expect(h.ops).toEqual([]);
  });

  it("needs the consent box ticked: no consent, no cookie", async () => {
    on();
    for (const body of [{ platform: "x", locale: "en" }, { platform: "x", consent: false, locale: "en" }, { platform: "x", consent: "yes", locale: "en" }]) {
      const res = await start(body);
      expect(res.status).toBe(400);
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });

  it("refuses other sites, signed-out visitors, unconfirmed accounts, a failed bot check and connections outside Canada", async () => {
    on();
    expect((await start(undefined, { Origin: "https://evil.example" })).status).toBe(403);
    h.botCheck = "fail";
    expect(await (await start()).json()).toEqual({ error: "bot check" });
    h.botCheck = "pass";
    h.user = { id: USER, email: "a@example.ca", email_confirmed_at: null };
    expect(await (await start()).json()).toEqual({ error: "unconfirmed" });
    h.user = null;
    expect((await start()).status).toBe(401);
    h.user = { id: USER, email: "a@example.ca", email_confirmed_at: "2026-11-01T00:00:00Z" };
    vi.stubEnv("VERCEL", "1");
    expect(await (await start(undefined, { "x-vercel-ip-country": "US" })).json()).toEqual({ error: "outside canada" });
  });

  it("Meta can't be started (stand-in), and X can't without its keys", async () => {
    on();
    expect((await start({ platform: "facebook", consent: true, locale: "en" })).status).toBe(503);
    vi.stubEnv("X_CLIENT_ID", "");
    expect((await start()).status).toBe(503);
  });

  it("is rate limited per person", async () => {
    on();
    for (let i = 0; i < 5; i++) expect((await start()).status).toBe(200);
    expect((await start()).status).toBe(429);
  });
});

describe("GET /api/account/social/callback", () => {
  it("links the account: the id is stored, the consent is recorded, the cookie is cleared, and no token is kept", async () => {
    on();
    const { state, cookie } = sealed();
    const res = await callback(`state=${state}&code=code-1`, cookie);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/fr/account/social?result=linked`);
    expect(res.headers.get("set-cookie")).toMatch(new RegExp(`${LINK_COOKIE}=;.*Max-Age=0`));
    const link = h.ops.find((o) => o.rpc === "link_social_account");
    expect(link?.args).toEqual({ p_user: USER, p_platform: "x", p_platform_user_id: "111", p_id_hmac: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(h.ops.find((o) => o.table === "consent_log" && o.action === "insert")?.values).toEqual({ email_hash: expect.stringMatching(/^[0-9a-f]{64}$/), kind: "socialLink", version: "2026-11-19" });
    // Nothing written anywhere holds the token, the handle or the name X returned.
    expect(JSON.stringify(h.ops)).not.toMatch(/one-time-user-token|maple_reader|Maple Reader|access_token/);
    expect(outside.at(-1)).toMatch(/oauth2\/revoke$/);
  });

  it("rejects a state mismatch before anything is sent to X or written", async () => {
    on();
    const { cookie } = sealed();
    const res = await callback(`state=${newPkce().state}&code=code-1`, cookie);
    expect(result(res)).toBe("expired");
    expect(res.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    expect(outside).toEqual([]);
    expect(h.ops).toEqual([]);
  });

  it("rejects a missing or expired cookie, another origin, another signed-in person and a signed-out visitor", async () => {
    on();
    const good = sealed();
    expect(result(await callback(`state=${good.state}&code=c`))).toBe("expired");
    const old = sealed({ at: new Date(Date.now() - 11 * 60_000) });
    expect(result(await callback(`state=${old.state}&code=c`, old.cookie))).toBe("expired");
    const elsewhere = sealed({ origin: "https://evil.example" });
    expect(result(await callback(`state=${elsewhere.state}&code=c`, elsewhere.cookie))).toBe("expired");
    expect(result(await callback(`state=${good.state}&code=c`, good.cookie, { Origin: "https://evil.example" }))).toBe("expired");
    const other = sealed({ userId: "7a0d6c1e-2b7b-4f55-8f36-0d6f3f0f2b22" });
    expect(result(await callback(`state=${other.state}&code=c`, other.cookie))).toBe("expired");
    h.user = null;
    expect(result(await callback(`state=${good.state}&code=c`, good.cookie))).toBe("signedOut");
    expect(outside).toEqual([]);
    expect(h.ops).toEqual([]);
  });

  it("links nothing when the person cancelled on X, the account is unconfirmed, or the connection is outside Canada", async () => {
    on();
    let s = sealed();
    expect(result(await callback(`state=${s.state}&error=access_denied`, s.cookie))).toBe("cancelled");
    h.user = { id: USER, email: "a@example.ca", email_confirmed_at: null };
    s = sealed();
    expect(result(await callback(`state=${s.state}&code=c`, s.cookie))).toBe("unconfirmed");
    h.user = { id: USER, email: "a@example.ca", email_confirmed_at: "2026-11-01T00:00:00Z" };
    vi.stubEnv("VERCEL", "1");
    s = sealed();
    expect(result(await callback(`state=${s.state}&code=c`, s.cookie, { "x-vercel-ip-country": "FR" }))).toBe("outside");
    expect(outside).toEqual([]);
    expect(h.ops).toEqual([]);
  });

  it("refuses an X account under 30 days old", async () => {
    on();
    stubFetch([[/oauth2\/token$/, { access_token: "tok" }], [/users\/me/, { data: { id: "111", created_at: new Date(Date.now() - 5 * 86_400_000).toISOString() } }], [/revoke/, {}]]);
    const s = sealed();
    expect(result(await callback(`state=${s.state}&code=c`, s.cookie))).toBe("tooNew");
    expect(h.ops).toEqual([]);
  });

  it("passes on the database's answer: taken, cooldown, already", async () => {
    on();
    for (const outcome of ["taken", "cooldown", "already"]) {
      h.rpc.link_social_account = outcome;
      const s = sealed();
      expect(result(await callback(`state=${s.state}&code=c`, s.cookie))).toBe(outcome);
    }
    expect(h.ops.filter((o) => o.table === "consent_log")).toEqual([]);
  });

  it("takes the link back out if the consent can't be recorded", async () => {
    on();
    h.failInsert = "consent_log";
    const s = sealed();
    expect(result(await callback(`state=${s.state}&code=c`, s.cookie))).toBe("failed");
    expect(h.ops.at(-1)).toMatchObject({ table: "social_links", action: "delete" });
  });
});

describe("/api/account/social", () => {
  it("lists my links without the platform id", async () => {
    on();
    h.rows.social_links = [{ platform: "x", linked_at: "2026-11-19T12:00:00Z", paused: false, platform_user_id: "111" }];
    const { GET } = await import("@/app/api/account/social/route");
    const res = await GET();
    expect(await res.json()).toEqual({ signedIn: true, confirmed: true, available: ["x"], links: [{ platform: "x", linkedAt: "2026-11-19T12:00:00Z", paused: false }] });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("unlinks in one request: the id is deleted with a cooldown keyed by hash, and the consent ends", async () => {
    on();
    h.rows.social_links = [{ platform_user_id: "111" }];
    const { DELETE } = await import("@/app/api/account/social/route");
    const res = await DELETE(await request("/api/account/social", { method: "DELETE", body: { platform: "x" } }));
    expect(res.status).toBe(200);
    const unlink = h.ops.find((o) => o.rpc === "unlink_social_account");
    expect(unlink?.args).toEqual({ p_user: USER, p_platform: "x", p_id_hmac: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(JSON.stringify(unlink)).not.toContain('"111"');
    expect(h.ops.find((o) => o.table === "consent_log")).toMatchObject({ action: "update", values: { withdrawn_at: expect.any(String) } });
  });

  it("refuses other sites and bad bodies", async () => {
    on();
    const { DELETE } = await import("@/app/api/account/social/route");
    expect((await DELETE(await request("/api/account/social", { method: "DELETE", body: { platform: "x" }, headers: { Origin: "https://evil.example" } }))).status).toBe(403);
    expect((await DELETE(await request("/api/account/social", { method: "DELETE", body: { platform: "myspace" } }))).status).toBe(400);
    expect(h.ops).toEqual([]);
  });
});
