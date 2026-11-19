import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { linkProvider, MetaLinkProvider, X_SCOPE, XLinkProvider } from "@/lib/social-voting/link-providers";
import { idHmac, MIN_SOCIAL_ACCOUNT_AGE_DAYS, oldEnough, recheckCutoff } from "@/lib/social-voting/link-rules";
import { checkCallback, LINK_TTL_SECONDS, linkCookieOptions, newPkce, openLink, sealLink } from "@/lib/social-voting/pkce";
import { fakeFetch, fixture, NOW } from "./helpers";

const SECRET = "s".repeat(40);
const USER = "0b0e7a52-4f0c-4b56-9d58-2f1f6d1c9a11";
const ORIGIN = "https://cansensus.test";

function sealed(state: string, verifier: string, at = NOW) {
  return sealLink({ platform: "x", state, verifier, userId: USER, origin: ORIGIN, locale: "fr", consent: true }, SECRET, at);
}

describe("PKCE and the signed linking cookie", () => {
  it("makes an S256 challenge from a fresh verifier and a fresh state each time", () => {
    const a = newPkce();
    const b = newPkce();
    expect(a.verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(a.challenge).toBe(createHash("sha256").update(a.verifier).digest("base64url"));
    expect(a.state).not.toBe(b.state);
    expect(a.verifier).not.toBe(b.verifier);
  });

  it("the cookie is httpOnly, SameSite=Lax, 10 minutes, and only sent to the linking routes", () => {
    expect(linkCookieOptions).toMatchObject({ httpOnly: true, sameSite: "lax", maxAge: 600, path: "/api/account/social" });
    expect(LINK_TTL_SECONDS).toBe(600);
  });

  it("accepts a callback whose state, origin and signed-in person all match", () => {
    const { state, verifier } = newPkce();
    const check = checkCallback({ cookie: sealed(state, verifier), state, origin: ORIGIN, userId: USER, secret: SECRET, now: NOW });
    expect(check).toMatchObject({ ok: true, payload: { platform: "x", verifier, locale: "fr", consent: true } });
  });

  it("rejects a state mismatch", () => {
    const { state, verifier } = newPkce();
    const cookie = sealed(state, verifier);
    expect(checkCallback({ cookie, state: newPkce().state, origin: ORIGIN, userId: USER, secret: SECRET, now: NOW })).toEqual({ ok: false, reason: "state" });
    expect(checkCallback({ cookie, state: `${state}x`, origin: ORIGIN, userId: USER, secret: SECRET, now: NOW })).toEqual({ ok: false, reason: "state" });
    expect(checkCallback({ cookie, state: null, origin: ORIGIN, userId: USER, secret: SECRET, now: NOW })).toEqual({ ok: false, reason: "state" });
  });

  it("rejects another origin, another signed-in person, and a missing cookie", () => {
    const { state, verifier } = newPkce();
    const cookie = sealed(state, verifier);
    expect(checkCallback({ cookie, state, origin: "https://evil.example", userId: USER, secret: SECRET, now: NOW })).toEqual({ ok: false, reason: "origin" });
    expect(checkCallback({ cookie, state, origin: ORIGIN, userId: "7a0d6c1e-2b7b-4f55-8f36-0d6f3f0f2b22", secret: SECRET, now: NOW })).toEqual({ ok: false, reason: "user" });
    expect(checkCallback({ cookie: undefined, state, origin: ORIGIN, userId: USER, secret: SECRET, now: NOW })).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a cookie after 10 minutes, one signed with another key, and one that was altered", () => {
    const { state, verifier } = newPkce();
    const cookie = sealed(state, verifier);
    expect(openLink(cookie, SECRET, new Date(NOW.getTime() + 599_000))).not.toBeNull();
    expect(openLink(cookie, SECRET, new Date(NOW.getTime() + 600_000))).toBeNull();
    expect(openLink(cookie, "t".repeat(40), NOW)).toBeNull();
    const [body, mac] = cookie.split(".") as [string, string];
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), userId: "7a0d6c1e-2b7b-4f55-8f36-0d6f3f0f2b22" })).toString("base64url");
    expect(openLink(`${forged}.${mac}`, SECRET, NOW)).toBeNull();
    expect(openLink(`${body}.${mac}.extra`, SECRET, NOW)).toBeNull();
    expect(openLink("garbage", SECRET, NOW)).toBeNull();
  });
});

describe("linking rules", () => {
  it("the 30-day account age is checked on X only", () => {
    expect(MIN_SOCIAL_ACCOUNT_AGE_DAYS).toBe(30);
    expect(oldEnough("x", "2026-10-20T15:00:00.000Z", NOW)).toBe(true); // exactly 30 days
    expect(oldEnough("x", "2026-10-21T15:00:00.000Z", NOW)).toBe(false);
    expect(oldEnough("x", null, NOW)).toBe(false); // X always reports a date; without one, refuse
    expect(oldEnough("x", "yesterday", NOW)).toBe(false);
    // Meta's public profile has no creation date, so there is nothing to check.
    for (const p of ["facebook", "instagram", "threads"] as const) expect(oldEnough(p, null, NOW)).toBe(true);
  });

  it("stands a keyed hash in for an id, different per platform and per secret", () => {
    const h = idHmac("x", "111", SECRET);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("111");
    expect(idHmac("x", "111", SECRET)).toBe(h);
    expect(idHmac("facebook", "111", SECRET)).not.toBe(h);
    expect(idHmac("x", "111", "t".repeat(40))).not.toBe(h);
  });

  it("a link goes stale 30 days after its last check", () => {
    expect(recheckCutoff(NOW).toISOString()).toBe("2026-10-20T15:00:00.000Z");
  });
});

describe("X sign-in for linking", () => {
  const routes = (): Array<[RegExp, unknown, number?]> => [
    [/oauth2\/token$/, { token_type: "bearer", access_token: "one-time-user-token", scope: X_SCOPE, expires_in: 7200 }],
    [/users\/me/, fixture("x-me.json")],
    [/oauth2\/revoke$/, { revoked: true }],
  ];

  it("asks for identity only, with PKCE S256 and the state", () => {
    const url = new URL(new XLinkProvider({ clientId: "client-1" }).authorizeUrl({ state: "state-1", challenge: "challenge-1", redirectUri: `${ORIGIN}/api/account/social/callback` })!);
    expect(url.origin + url.pathname).toBe("https://x.com/i/oauth2/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code", client_id: "client-1", redirect_uri: `${ORIGIN}/api/account/social/callback`, scope: "users.read tweet.read", state: "state-1", code_challenge: "challenge-1", code_challenge_method: "S256",
    });
    expect(X_SCOPE).not.toMatch(/offline|write|dm|email|follows/);
  });

  it("returns the numeric id and creation date only, and revokes the token: no token, handle or name comes back", async () => {
    const { fetch, calls } = fakeFetch(routes());
    const identity = await new XLinkProvider({ clientId: "client-1", clientSecret: "shh", fetch }).identify({ code: "code-1", verifier: "verifier-1", redirectUri: `${ORIGIN}/cb` });
    expect(identity).toEqual({ platformUserId: "111", createdAt: "2019-04-02T10:00:00.000Z" });
    expect(JSON.stringify(identity)).not.toMatch(/one-time-user-token|maple_reader|Maple/);
    expect(calls.map((c) => c.url)).toEqual(["https://api.x.com/2/oauth2/token", "https://api.x.com/2/users/me?user.fields=created_at", "https://api.x.com/2/oauth2/revoke"]);
    expect(String(calls[0]!.init?.body)).toContain("code_verifier=verifier-1");
    expect(String(calls[2]!.init?.body)).toContain("token=one-time-user-token");
  });

  it("gives nothing when X refuses the code or answers oddly, and still revokes a token it did get", async () => {
    const refused = fakeFetch([[/oauth2\/token$/, { error: "invalid_grant" }, 400]]);
    expect(await new XLinkProvider({ clientId: "c", fetch: refused.fetch }).identify({ code: "bad", verifier: "v", redirectUri: "r" })).toBeNull();
    const odd = fakeFetch([[/oauth2\/token$/, { access_token: "tok" }], [/users\/me/, { data: { id: "not-numeric" } }], [/revoke/, {}]]);
    expect(await new XLinkProvider({ clientId: "c", fetch: odd.fetch }).identify({ code: "c", verifier: "v", redirectUri: "r" })).toBeNull();
    expect(odd.calls.at(-1)!.url).toMatch(/oauth2\/revoke$/);
  });

  it("is unavailable without a client id; Meta is a stand-in that can't start a sign-in and never calls out", async () => {
    expect(new XLinkProvider({}).available()).toBe(false);
    expect(new XLinkProvider({}).authorizeUrl({ state: "s", challenge: "c", redirectUri: "r" })).toBeNull();
    const { fetch, calls } = fakeFetch([]);
    for (const p of ["facebook", "instagram", "threads"] as const) {
      const meta = linkProvider(p, { X_CLIENT_ID: "client-1" }, fetch);
      expect(meta).toBeInstanceOf(MetaLinkProvider);
      expect(meta.available()).toBe(false);
      expect(meta.authorizeUrl({ state: "s", challenge: "c", redirectUri: "r" })).toBeNull();
      expect(await meta.identify({ code: "c", verifier: "v", redirectUri: "r" })).toBeNull();
    }
    expect(calls).toHaveLength(0);
    expect(linkProvider("x", { X_CLIENT_ID: "client-1" }).available()).toBe(true);
  });
});
