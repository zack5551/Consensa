/**
 * The way past a halted sweep (AEGIS). When the removal ceiling trips, the run removes nothing unless zack has run
 * approve_social_sweep() by hand in the database. That approval lasts 36 hours and one run uses it up.
 * Since LEX's conditions a removal is a withdrawal (the reply is marked, not deleted) and a halted run hides what
 * it found; sweep-withdrawals.test.ts covers those rules themselves.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sweepDeletedReplies } from "@/lib/social-voting/sweep";
import type { DeletedCheck, SocialProvider } from "@/lib/social-voting/types";
import { MemoryStore, NOW, OUR_POST, post } from "./helpers";

const SLUG = post.slug;
const HOUR_MS = 60 * 60 * 1000;

/** A provider that reports the given ids as deleted. */
function reporting(gone: string[]): SocialProvider {
  return {
    platform: "x",
    readPollTotals: async () => null,
    readReplies: async () => ({ replies: [], complete: true }),
    findDeleted: async (ids): Promise<DeletedCheck> => ({ gone, checked: ids.length, spentMicros: 0, complete: true }),
  };
}

/** `total` counted replies, each one person's only reply. */
function setup(total: number) {
  const ids = Array.from({ length: total }, (_, i) => String(9_000 + i));
  const store = new MemoryStore();
  store.windows.set(SLUG, post.closesAt);
  ids.forEach((replyId, i) => {
    store.ledger.push({ platform: "x", replyId, postId: OUR_POST, userId: `user-${i}`, slug: SLUG, probability: 75, at: "2026-11-18T14:00:00.000Z" });
    store.calls.set(`user-${i}:${SLUG}`, { probability: 75, source: "x" });
  });
  /** One run in which the platform reports the first `gone` of the replies still counted as deleted. */
  const run = (gone: number) =>
    sweepDeletedReplies({ posts: [post], providers: { x: reporting(store.live().map((l) => l.replyId).sort().slice(0, gone)) }, store, now: NOW });
  return { store, run };
}

describe("the sweep approval (AEGIS)", () => {
  it("an approved run removes despite the ceiling, and says so in its report", async () => {
    const { store, run } = setup(100);
    store.sweepApprovedUntil = new Date(NOW.getTime() + 36 * HOUR_MS);
    const report = await run(21); // one over the ceiling of 20
    expect(report).toEqual({ posts: 1, checked: 100, gone: 21, outcomes: { call_removed: 21 }, incomplete: 0, halted: false, approvedOverride: true });
    expect(store.calls.size).toBe(79);
    expect(store.live()).toHaveLength(79);
    expect(store.ledger.filter((l) => l.withdrawnAt)).toHaveLength(21);
    expect(store.approvalAsked).toBe(1);
    expect(store.sweepApprovedUntil).toBeNull();
  });

  it("is single-use: the next run over the ceiling halts", async () => {
    const { store, run } = setup(100);
    store.sweepApprovedUntil = new Date(NOW.getTime() + 36 * HOUR_MS);
    expect(await run(21)).toMatchObject({ halted: false, approvedOverride: true });
    expect(store.calls.size).toBe(79);

    store.written.length = 0;
    const second = await run(30); // 30 of the 79 left: over the ceiling again
    expect(second).toEqual({ posts: 1, checked: 79, gone: 30, outcomes: {}, incomplete: 0, halted: true, held: 30 });
    expect(second).not.toHaveProperty("approvedOverride");
    // Nothing more is withdrawn. The 30 are held: hidden from the count while a person decides.
    expect(store.ledger.filter((l) => l.withdrawnAt)).toHaveLength(21);
    expect(store.ledger.filter((l) => l.heldAt)).toHaveLength(30);
    expect(store.calls.size).toBe(49);
    expect(store.written).toHaveLength(30); // 30 holds, and the database wasn't asked to withdraw anything
    expect(store.approvalAsked).toBe(2);
  });

  it("an approval past its time is ignored, and cleared", async () => {
    const { store, run } = setup(100);
    store.sweepApprovedUntil = new Date(NOW.getTime() - 1);
    const report = await run(21);
    expect(report).toEqual({ posts: 1, checked: 100, gone: 21, outcomes: {}, incomplete: 0, halted: true, held: 21 });
    expect(store.ledger).toHaveLength(100);
    expect(store.ledger.filter((l) => l.withdrawnAt)).toEqual([]);
    expect(store.calls.size).toBe(79); // held, not withdrawn
    expect(store.sweepApprovedUntil).toBeNull();

    // An approval that ends at this very moment is past its time too.
    store.sweepApprovedUntil = new Date(NOW.getTime());
    expect(await run(21)).toMatchObject({ halted: true });
    expect(store.ledger.filter((l) => l.withdrawnAt)).toEqual([]);
  });

  it("a run under the ceiling never asks for the approval, so it can't use one up", async () => {
    const { store, run } = setup(100);
    const until = new Date(NOW.getTime() + 36 * HOUR_MS);
    store.sweepApprovedUntil = until;
    const report = await run(20); // exactly at the ceiling: goes ahead on its own
    expect(report).toEqual({ posts: 1, checked: 100, gone: 20, outcomes: { call_removed: 20 }, incomplete: 0, halted: false });
    expect(store.approvalAsked).toBe(0);
    expect(store.sweepApprovedUntil).toBe(until);

    // A run with nothing to remove, and a run with nothing to check, leave it alone as well.
    await run(0);
    await sweepDeletedReplies({ posts: [], providers: {}, store, now: NOW });
    expect(store.approvalAsked).toBe(0);
    expect(store.sweepApprovedUntil).toBe(until);
  });

  it("with no approval the run halts as before, and a database that can't answer is no approval", async () => {
    const none = setup(100);
    expect(await none.run(21)).toMatchObject({ outcomes: {}, halted: true });
    expect(none.store.approvalAsked).toBe(1);
    expect(none.store.ledger.filter((l) => l.withdrawnAt)).toEqual([]);
    expect(none.store.ledger.filter((l) => l.heldAt)).toHaveLength(21);

    const down = setup(100);
    down.store.sweepApprovedUntil = new Date(NOW.getTime() + 36 * HOUR_MS);
    down.store.approvalFails = true;
    const report = await down.run(21);
    expect(report).toMatchObject({ outcomes: {}, halted: true });
    expect(report).not.toHaveProperty("approvedOverride");
    expect(down.store.ledger.filter((l) => l.withdrawnAt)).toEqual([]);
    expect(down.store.ledger.filter((l) => l.heldAt)).toHaveLength(21);
  });

  it("privacy: an approved run's report is still counts only", async () => {
    const { store, run } = setup(100);
    store.sweepApprovedUntil = new Date(NOW.getTime() + HOUR_MS);
    expect(JSON.stringify(await run(21))).not.toMatch(/\d{6,}|user-/);
  });
});

describe("the sweep approval in the database", () => {
  const sql = readFileSync(join(__dirname, "..", "..", "..", "supabase", "migrations", "20261120000000_social_sweep_approval.sql"), "utf8")
    .replace(/--[^\n]*/g, "")
    .toLowerCase();

  it("keeps one row at most, closed to every API role", () => {
    expect(sql).toMatch(/id boolean primary key default true check \(id\)/);
    expect(sql).toMatch(/approved_until timestamptz not null/);
    expect(sql).toMatch(/alter table public\.social_sweep_approval enable row level security/);
    expect(sql).toMatch(/revoke all on public\.social_sweep_approval from public, anon, authenticated, service_role;/);
    expect(sql).not.toMatch(/create policy/);
  });

  it("the approval lasts 36 hours and comes from the database's own clock", () => {
    expect(sql).toMatch(/now\(\) \+ interval '36 hours'/);
  });

  it("both functions are privileged with a fixed, empty search_path, and nobody but the owner may give an approval", () => {
    for (const fn of ["approve_social_sweep", "consume_social_sweep_approval"]) {
      expect(sql).toMatch(new RegExp(`function public\\.${fn}\\(\\)\\s+returns \\w+\\s+language plpgsql security definer set search_path = ''`));
    }
    expect(sql).toMatch(/revoke execute on function public\.approve_social_sweep\(\) from public, anon, authenticated, service_role;/);
    expect(sql).toMatch(/revoke execute on function public\.consume_social_sweep_approval\(\) from public, anon, authenticated;/);
    expect(sql).toMatch(/grant execute on function public\.consume_social_sweep_approval\(\) to service_role;/);
    expect(sql.match(/grant /g)).toHaveLength(1);
  });

  it("using an approval clears it whether or not it was still in time", () => {
    expect(sql).toMatch(/delete from public\.social_sweep_approval a where a\.id returning a\.approved_until into until_at;\s+return until_at is not null and until_at > now\(\);/);
  });
});
