import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { idHmac } from "@/lib/social-voting/link-rules";

vi.mock("server-only", () => ({}));

const SECRET = "s".repeat(40);

/** Records what the store sends to Supabase and answers each call from `answers`, in order. */
function fakeAdmin(answers: Array<{ data?: unknown; error?: { hint?: string } | null }>) {
  const sent: Array<{ table?: string; rpc?: string; action?: string; values?: unknown; filters?: unknown[][] }> = [];
  const next = () => ({ data: null, error: null, ...answers.shift() });
  const from = (table: string) => {
    const op: (typeof sent)[number] = { table, action: "select", values: undefined };
    sent.push(op);
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "range", "lt", "limit"]) b[m] = () => b;
    for (const m of ["is", "not"]) b[m] = (...args: unknown[]) => ((op.filters ??= []).push([m, ...args]), b);
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

  it("hands a deleted reply to remove_social_reply() and passes its answer on", async () => {
    const { store: s, sent } = await store([{ data: "call_removed" }, { data: "removed" }, { error: { hint: "rate" } }, { error: { hint: "closed" } }, { error: {} }, { data: "something new" }]);
    expect(await s.removeReply("x", "9003")).toBe("call_removed");
    expect(sent[0]).toEqual({ rpc: "remove_social_reply", values: { p_platform: "x", p_reply_id: "9003" } });
    expect(await s.removeReply("x", "9003")).toBe("removed");
    expect(await s.removeReply("x", "9003")).toBe("retry"); // the 2-second rule on calls
    expect(await s.removeReply("x", "9003")).toBe("closed");
    await expect(s.removeReply("x", "9003")).rejects.toThrow();
    await expect(s.removeReply("x", "9003")).rejects.toThrow(); // an answer it doesn't know is never treated as done
  });

  it("uses up the sweep approval through consume_social_sweep_approval(), and only a plain true is an approval", async () => {
    const { store: s, sent } = await store([{ data: true }, { data: false }, { data: null }, { data: "true" }, { data: true, error: {} }]);
    expect(await s.consumeSweepApproval()).toBe(true);
    expect(sent[0]).toEqual({ rpc: "consume_social_sweep_approval", values: undefined });
    expect(await s.consumeSweepApproval()).toBe(false); // none, or past its time
    expect(await s.consumeSweepApproval()).toBe(false);
    expect(await s.consumeSweepApproval()).toBe(false);
    expect(await s.consumeSweepApproval()).toBe(false); // the database couldn't answer
    expect(sent).toHaveLength(5);
  });

  it("lists a post's counted reply ids up to the limit it is given", async () => {
    const { store: s, sent } = await store([{ data: [{ reply_id: "9001" }, { reply_id: "9002" }] }, { data: [{ reply_id: "9001" }] }, { error: {} }]);
    expect(await s.ledgerReplyIds("x", "500", 5)).toEqual(["9001", "9002"]);
    expect(sent[0]).toMatchObject({ table: "social_votes", action: "select" });
    expect(await s.ledgerReplyIds("x", "500", 1)).toEqual(["9001"]);
    expect(sent).toHaveLength(2);
    await expect(s.ledgerReplyIds("x", "500", 5)).rejects.toThrow();
  });

  it("never lists a withdrawn reply for checking, and lists the held ones on their own", async () => {
    const { store: s, sent } = await store([{ data: [{ reply_id: "9001" }, { reply_id: "9002" }] }, { data: [{ reply_id: "9002" }] }, { error: {} }]);
    expect(await s.ledgerReplyIds("x", "500", 5)).toEqual(["9001", "9002"]);
    expect(sent[0]?.filters).toEqual([["is", "withdrawn_at", null]]);
    expect(await s.heldReplyIds("x", "500", 5)).toEqual(["9002"]);
    expect(sent[1]).toMatchObject({ table: "social_votes", action: "select", filters: [["is", "withdrawn_at", null], ["not", "held_at", "is", null]] });
    await expect(s.heldReplyIds("x", "500", 5)).rejects.toThrow();
  });

  it("holds through hold_social_reply() and releases through release_social_reply(), and never guesses an answer", async () => {
    const { store: s, sent } = await store([{ data: "call_removed" }, { data: "held" }, { error: { hint: "rate" } }, { error: {} }, { data: "counted" }, { data: "unknown" }, { error: { hint: "rate" } }, { error: { hint: "closed" } }, { error: {} }, { data: "something new" }]);
    expect(await s.holdReply("x", "9003")).toBe("call_removed");
    expect(sent[0]).toEqual({ rpc: "hold_social_reply", values: { p_platform: "x", p_reply_id: "9003" } });
    expect(await s.holdReply("x", "9003")).toBe("held"); // already held: nothing changed
    expect(await s.holdReply("x", "9003")).toBe("retry");
    await expect(s.holdReply("x", "9003")).rejects.toThrow();

    expect(await s.releaseReply("x", "9003")).toBe("counted");
    expect(sent[4]).toEqual({ rpc: "release_social_reply", values: { p_platform: "x", p_reply_id: "9003" } });
    expect(await s.releaseReply("x", "9003")).toBe("unknown");
    expect(await s.releaseReply("x", "9003")).toBe("retry");
    expect(await s.releaseReply("x", "9003")).toBe("closed");
    await expect(s.releaseReply("x", "9003")).rejects.toThrow();
    await expect(s.releaseReply("x", "9003")).rejects.toThrow();
  });

  it("has no way to restore a withdrawn reply or to give an approval: those are done by hand in the database", async () => {
    const { store: s } = await store([]);
    const names = Object.getOwnPropertyNames(Object.getPrototypeOf(s)).join(" ");
    expect(names).not.toMatch(/restore|approveSweep/i);
  });

  it("purges through purge_withdrawn_social_replies() and reads the halt's first time from the database", async () => {
    const { store: s, sent } = await store([{ data: 3 }, { error: {} }, { data: "2026-11-16T15:00:00+00:00" }, { data: null }, { data: "2026-11-16T15:00:00+00:00" }, { error: {} }, { data: "not a time" }]);
    expect(await s.purgeWithdrawn()).toBe(3);
    expect(sent[0]).toEqual({ rpc: "purge_withdrawn_social_replies", values: undefined });
    await expect(s.purgeWithdrawn()).rejects.toThrow();

    expect((await s.noteHalt())?.toISOString()).toBe("2026-11-16T15:00:00.000Z");
    expect(sent[2]).toEqual({ rpc: "note_social_sweep_halt", values: undefined });
    expect(await s.settleHalt()).toBeNull(); // nothing held any more
    expect(sent[3]).toEqual({ rpc: "settle_social_sweep_halt", values: undefined });
    expect((await s.settleHalt())?.toISOString()).toBe("2026-11-16T15:00:00.000Z");
    await expect(s.noteHalt()).rejects.toThrow();
    expect(await s.noteHalt()).toBeNull();
  });

  it("reports an approved run's removals through record_social_sweep_removals(), a count and nothing else", async () => {
    const { store: s, sent } = await store([{ data: true }, { error: {} }]);
    await s.recordApprovedRemovals(21);
    expect(sent[0]).toEqual({ rpc: "record_social_sweep_removals", values: { p_removed: 21 } });
    await expect(s.recordApprovedRemovals(21)).rejects.toThrow();
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

  it("reads the month's running spend, 0 when there is none yet, and fails when it can't be read", async () => {
    const { store: s, sent } = await store([{ data: { spent_micros: 5_000_000 } }, { data: null }, { error: {} }]);
    expect(await s.spent("x", "2026-11-01")).toBe(5_000_000);
    expect(sent[0]).toMatchObject({ table: "social_spend", action: "select" });
    expect(await s.spent("x", "2026-11-01")).toBe(0);
    await expect(s.spent("x", "2026-11-01")).rejects.toThrow();
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
