import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { idHmac } from "@/lib/social-voting/link-rules";

vi.mock("server-only", () => ({}));

const SECRET = "s".repeat(40);

/** Records what the store sends to Supabase and answers each call from `answers`, in order. */
function fakeAdmin(answers: Array<{ data?: unknown; error?: { hint?: string } | null }>) {
  const sent: Array<{ table?: string; rpc?: string; action?: string; values?: unknown }> = [];
  const next = () => ({ data: null, error: null, ...answers.shift() });
  const from = (table: string) => {
    const op = { table, action: "select", values: undefined as unknown };
    sent.push(op);
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "range", "lt", "limit"]) b[m] = () => b;
    for (const m of ["insert", "update", "upsert"]) b[m] = (values: unknown) => ((op.action = m), (op.values = values), b);
    b.maybeSingle = async () => next();
    b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(next()).then(resolve);
    return b;
  };
  const rpc = async (name: string, values: unknown) => (sent.push({ rpc: name, values }), next());
  return { admin: { from, rpc } as unknown as SupabaseClient, sent };
}

async function store(answers: Parameters<typeof fakeAdmin>[0]) {
  const { SupabaseSocialStore } = await import("@/lib/social-voting/supabase-store");
  const fake = fakeAdmin(answers);
  return { store: new SupabaseSocialStore(fake.admin, SECRET), sent: fake.sent };
}

const reply = { platform: "x" as const, replyId: "9003", postId: "500", authorId: "111", slug: "boc-cut-dec-2026", probability: 99, at: "2026-11-18T14:00:00.000Z" };

describe("the social store in Supabase", () => {
  it("hands a reply to count_social_reply() and passes its answer on", async () => {
    const { store: s, sent } = await store([{ data: "counted" }, { data: "website_wins" }, { data: "something new" }]);
    expect(await s.countReply(reply)).toBe("counted");
    expect(sent[0]).toEqual({ rpc: "count_social_reply", values: { p_platform: "x", p_reply_id: "9003", p_post_id: "500", p_platform_user_id: "111", p_slug: "boc-cut-dec-2026", p_probability: 99, p_replied_at: "2026-11-18T14:00:00.000Z" } });
    expect(await s.countReply(reply)).toBe("website_wins");
    expect(await s.countReply(reply)).toBe("retry"); // an answer it doesn't know is never treated as counted
  });

  it("reads the database's 2-second rule as “try again” and a closed question as closed", async () => {
    const { store: s } = await store([{ error: { hint: "rate" } }, { error: { hint: "closed" } }]);
    expect(await s.countReply(reply)).toBe("retry");
    expect(await s.countReply(reply)).toBe("closed");
  });

  it("keeps a keyed hash, not the id, for the auto-reply record", async () => {
    const { store: s, sent } = await store([{}, { error: {} }]);
    expect(await s.claimAutoReply("x", "999", "500")).toBe(true);
    expect(sent[0]).toEqual({ table: "social_autoreply_seen", action: "insert", values: { platform: "x", id_hmac: idHmac("x", "999", SECRET), post_id: "500" } });
    expect(JSON.stringify(sent[0])).not.toContain('"999"');
    expect(await s.claimAutoReply("x", "999", "500")).toBe(false); // already there
  });

  it("reserves spend through reserve_social_spend() and treats an error as a refusal", async () => {
    const { store: s, sent } = await store([{ data: true }, { data: false }, { error: {} }]);
    expect(await s.reserve("x", "2026-11-01", 500_000, 25_000_000)).toBe(true);
    expect(sent[0]).toEqual({ rpc: "reserve_social_spend", values: { p_platform: "x", p_month: "2026-11-01", p_micros: 500_000, p_cap_micros: 25_000_000 } });
    expect(await s.reserve("x", "2026-11-01", 500_000, 25_000_000)).toBe(false);
    expect(await s.reserve("x", "2026-11-01", 500_000, 25_000_000)).toBe(false);
  });

  it("the monthly re-check pauses stale links and never deletes one", async () => {
    const { store: s, sent } = await store([{ data: [{ platform: "x" }, { platform: "x" }] }]);
    expect(await s.pauseStaleLinks(new Date("2026-11-19T15:00:00Z"))).toBe(2);
    expect(sent[0]).toMatchObject({ table: "social_links", action: "update", values: { paused: true } });
  });

  it("lists linked ids for a platform and saves poll totals and the reader's place", async () => {
    const { store: s, sent } = await store([{ data: [{ platform_user_id: "111" }, { platform_user_id: "222" }] }, {}, { data: { read_through: "2026-11-18T16:00:00+00:00" } }]);
    expect([...(await s.linkedIds("x"))]).toEqual(["111", "222"]);
    const post = { platform: "x" as const, postId: "500", slug: "boc-cut-dec-2026", locale: "en" as const, closesAt: "2026-12-09T14:45:00Z" };
    await s.saveRead(post, { poll: { yes: 4, no: 6 } }, new Date("2026-11-19T15:00:00Z"));
    expect(sent[1]).toMatchObject({ table: "social_post_reads", action: "upsert", values: { platform: "x", post_id: "500", slug: "boc-cut-dec-2026", poll_yes: 4, poll_no: 6, poll_read_at: "2026-11-19T15:00:00.000Z" } });
    expect((await s.readThrough("x", "500"))?.toISOString()).toBe("2026-11-18T16:00:00.000Z");
  });
});
