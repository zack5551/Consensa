import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ serverSupabase: async () => session.client }));

const { GET } = await import("@/app/api/session/route");

/** A session client whose getUser() answers with this user (or throws). */
function client(user: unknown, fail = false, errorName = "AuthSessionMissingError") {
  return {
    auth: {
      getUser: async () => {
        if (fail) throw new Error("network down at 10.0.0.1");
        return { data: { user }, error: user ? null : { name: errorName } };
      },
    },
  };
}

const person = {
  id: "8f14e45f-ceea-467f-a0e6-1b2c3d4e5f60",
  email: "someone@example.ca",
  created_at: "2026-10-01T12:00:00Z",
  last_sign_in_at: "2026-11-18T09:00:00Z",
  user_metadata: { region: "QC" },
};

describe("/api/session (light signed-in check)", () => {
  beforeEach(() => {
    session.client = null;
  });

  it("says signed out, not an error, when accounts are off", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signedIn: false });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("says signed out with no session", async () => {
    session.client = client(null);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signedIn: false });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("says signed in with a session", async () => {
    session.client = client(person);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signedIn: true });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("returns nothing personal: no email, id, dates or profile", async () => {
    session.client = client(person);
    const body = await (await GET()).text();
    expect(Object.keys(JSON.parse(body) as object)).toEqual(["signedIn"]);
    for (const value of [person.id, person.email, "example.ca", person.created_at, person.last_sign_in_at, "QC"]) {
      expect(body).not.toContain(value);
    }
  });

  it("answers 503 with no detail when the session can't be read, so the page leaves the answer unknown", async () => {
    session.client = client(person, true);
    const res = await GET();
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).not.toMatch(/10\.0\.0\.1|network/);
  });

  it("answers 503 when Supabase returns an error other than a missing session", async () => {
    session.client = client(null, false, "AuthRetryableFetchError");
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });
});
