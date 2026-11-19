/**
 * LEX's three conditions on the daily sweep, before social voting may be turned on:
 *
 * 1. A halt must not hold a withdrawal for long: what a halted run found gone is hidden from "Canada says" at once
 *    (held, not removed), and a halt still open 72 hours after it first happened is logged again on every run.
 * 2. Each use of the hand-given approval is logged: when it was given and by which database role, when it was
 *    used, and how many replies that run took out.
 * 3. Removal is soft: a gone reply is marked withdrawn and stops counting at once; it can be put back by hand for
 *    7 days, and the first run after that deletes it for real.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OfficialPost } from "@/lib/social-voting/count";
import { SWEEP_HALT_ALERT_HOURS, SWEEP_WITHDRAWN_KEEP_DAYS, sweepDeletedReplies, type SweepReport } from "@/lib/social-voting/sweep";
import type { DeletedCheck, SocialProvider } from "@/lib/social-voting/types";
import { MemoryStore, NOW, OUR_POST, post } from "./helpers";

const SLUG = post.slug;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const at = (ms: number) => new Date(NOW.getTime() + ms);

/** A provider that reports the given ids as deleted. `complete: false` is a check that stopped early. */
function reporting(gone: string[], complete = true): SocialProvider {
  return {
    platform: "x",
    readPollTotals: async () => null,
    readReplies: async () => ({ replies: [], complete: true }),
    findDeleted: async (ids): Promise<DeletedCheck> => ({ gone, checked: complete ? ids.length : 0, spentMicros: 0, complete }),
  };
}

/** `total` counted replies, each one person's only reply: reply 9000 + i belongs to user-i. */
function setup(total: number) {
  const ids = Array.from({ length: total }, (_, i) => String(9_000 + i));
  const store = new MemoryStore();
  store.windows.set(SLUG, post.closesAt);
  ids.forEach((replyId, i) => {
    store.ledger.push({ platform: "x", replyId, postId: OUR_POST, userId: `user-${i}`, slug: SLUG, probability: 75, at: "2026-11-18T14:00:00.000Z" });
    store.calls.set(`user-${i}:${SLUG}`, { probability: 75, source: "x" });
  });
  /** One run at the store's clock in which the platform reports `gone` as deleted. */
  const run = (gone: string[], complete = true) => sweepDeletedReplies({ posts: [post], providers: { x: reporting(gone, complete) }, store, now: store.clock });
  return { store, run, ids };
}

/** The people who count in "Canada says" on the question: one call each. */
const counted = (store: MemoryStore) => [...store.calls.keys()].filter((k) => k.endsWith(`:${SLUG}`)).length;

describe("soft removal (LEX condition 3)", () => {
  it("a gone reply is marked withdrawn, not deleted, and stops counting at once", async () => {
    const { store, run } = setup(5);
    const report = await run(["9000"]);
    expect(report).toEqual({ posts: 1, checked: 5, gone: 1, outcomes: { call_removed: 1 }, incomplete: 0, halted: false });
    expect(store.ledger).toHaveLength(5); // nothing deleted
    expect(store.row("9000")).toMatchObject({ withdrawnAt: NOW });
    expect(store.row("9000")).not.toHaveProperty("heldAt");
    expect(store.calls.has(`user-0:${SLUG}`)).toBe(false);
    expect(counted(store)).toBe(4);
  });

  it("a withdrawn reply is out of every count: it can't set a call, and can't stand in the way of one that is still up", async () => {
    const store = new MemoryStore().link("x", "111", "user-a");
    store.windows.set(SLUG, post.closesAt);
    const reply = (replyId: string, probability: number, hour: number) => ({ platform: "x" as const, replyId, postId: OUR_POST, authorId: "111", slug: SLUG, probability, at: `2026-11-18T${hour}:00:00.000Z` });
    expect(await store.countReply(reply("9002", 25, 16))).toBe("counted");
    await sweepDeletedReplies({ posts: [post], providers: { x: reporting(["9002"]) }, store, now: NOW });
    expect(store.calls.has(`user-a:${SLUG}`)).toBe(false);

    // An earlier reply read late: the withdrawn later one no longer outranks it.
    expect(await store.countReply(reply("9001", 75, 14))).toBe("counted");
    expect(store.calls.get(`user-a:${SLUG}`)).toEqual({ probability: 75, source: "x" });
    // The withdrawn reply read again is a duplicate: it isn't counted a second time.
    expect(await store.countReply(reply("9002", 25, 16))).toBe("duplicate");
    expect(store.calls.get(`user-a:${SLUG}`)).toEqual({ probability: 75, source: "x" });
  });

  it("the call falls back to the latest reply that is still live, skipping withdrawn ones", async () => {
    const store = new MemoryStore();
    store.windows.set(SLUG, post.closesAt);
    for (const [replyId, probability, hour] of [["9001", 75, 14], ["9002", 25, 15], ["9003", 75, 16]] as const) {
      store.ledger.push({ platform: "x", replyId, postId: OUR_POST, userId: "user-a", slug: SLUG, probability, at: `2026-11-18T${hour}:00:00.000Z` });
    }
    store.calls.set(`user-a:${SLUG}`, { probability: 75, source: "x" });
    await sweepDeletedReplies({ posts: [post], providers: { x: reporting(["9002"]) }, store, now: NOW });
    const report = await sweepDeletedReplies({ posts: [post], providers: { x: reporting(["9003"]) }, store, now: NOW });
    expect(report.outcomes).toEqual({ restored: 1 });
    expect(store.calls.get(`user-a:${SLUG}`)).toEqual({ probability: 75, source: "x" }); // 9001, not the withdrawn 9002
    expect(store.live().map((l) => l.replyId)).toEqual(["9001"]);
  });

  it("a withdrawn reply is not checked again, so it costs no further read", async () => {
    const { store, run } = setup(5);
    await run(["9000"]);
    const asked: string[][] = [];
    const provider: SocialProvider = { ...reporting([]), findDeleted: async (ids) => (asked.push([...ids]), { gone: [], checked: ids.length, spentMicros: 0, complete: true }) };
    const report = await sweepDeletedReplies({ posts: [post], providers: { x: provider }, store, now: NOW });
    expect(asked).toEqual([["9001", "9002", "9003", "9004"]]);
    expect(report).toMatchObject({ checked: 4, gone: 0 });
  });

  it("keeps a withdrawn reply for 7 days, then the sweep's run deletes it for real", async () => {
    expect(SWEEP_WITHDRAWN_KEEP_DAYS).toBe(7);
    const { store, run } = setup(5);
    await run(["9000"]);

    store.clock = at(7 * DAY_MS); // exactly 7 days: still kept
    const kept = await run([]);
    expect(kept).not.toHaveProperty("purged");
    expect(store.row("9000")).toBeDefined();

    store.clock = at(7 * DAY_MS + 1);
    const purged = await run([]);
    expect(purged).toEqual({ posts: 1, checked: 4, gone: 0, outcomes: {}, incomplete: 0, halted: false, purged: 1 });
    expect(store.row("9000")).toBeUndefined();
    expect(store.ledger).toHaveLength(4);
    expect(counted(store)).toBe(4); // the purge changes no count: the reply stopped counting when it was withdrawn
  });

  it("the purge runs even on a day with no post to check, and a purge that fails waits for the next run", async () => {
    const { store, run } = setup(3);
    await run(["9000"]);
    store.clock = at(8 * DAY_MS);
    store.purgeFails = true;
    expect(await run([])).not.toHaveProperty("purged");
    expect(store.row("9000")).toBeDefined();
    store.purgeFails = false;
    expect(await sweepDeletedReplies({ posts: [], providers: {}, store, now: store.clock })).toEqual({ posts: 0, checked: 0, gone: 0, outcomes: {}, incomplete: 0, halted: false, purged: 1 });
    expect(store.row("9000")).toBeUndefined();
  });

  it("a held reply is never purged, however long the halt lasts", async () => {
    const { store, run, ids } = setup(12);
    await run(ids.slice(0, 11)); // halted
    store.clock = at(19 * DAY_MS); // long past 7 days, and the question is still open
    await sweepDeletedReplies({ posts: [], providers: {}, store, now: store.clock });
    expect(store.ledger).toHaveLength(12);
  });

  it("zack can restore a wrongly withdrawn reply within 7 days: it counts again", async () => {
    const { store, run } = setup(5);
    await run(["9000"]);
    expect(counted(store)).toBe(4);
    store.clock = at(6 * DAY_MS);
    expect(store.restoreReply("x", "9000")).toBe("counted");
    expect(store.calls.get(`user-0:${SLUG}`)).toEqual({ probability: 75, source: "x" });
    expect(store.row("9000")).not.toHaveProperty("withdrawnAt");
    expect(counted(store)).toBe(5);
    expect(store.restoreReply("x", "9000")).toBe("live"); // nothing to do the second time
    expect(store.restoreReply("x", "1")).toBe("unknown");
  });

  it("a restore never overrides a website call or a newer live reply, and is refused after 7 days or once the question has closed", async () => {
    const web = setup(3);
    await web.run(["9000"]);
    web.store.calls.set(`user-0:${SLUG}`, { probability: 62, source: "web" });
    expect(web.store.restoreReply("x", "9000")).toBe("website_wins");
    expect(web.store.calls.get(`user-0:${SLUG}`)).toEqual({ probability: 62, source: "web" });

    const newer = setup(3);
    await newer.run(["9000"]);
    newer.store.ledger.push({ platform: "x", replyId: "9500", postId: OUR_POST, userId: "user-0", slug: SLUG, probability: 25, at: "2026-11-19T10:00:00.000Z" });
    newer.store.calls.set(`user-0:${SLUG}`, { probability: 25, source: "x" });
    expect(newer.store.restoreReply("x", "9000")).toBe("older_reply");
    expect(newer.store.calls.get(`user-0:${SLUG}`)).toEqual({ probability: 25, source: "x" });

    const late = setup(3);
    await late.run(["9000"]);
    late.store.clock = at(7 * DAY_MS);
    expect(late.store.restoreReply("x", "9000")).toBe("expired");
    expect(late.store.calls.has(`user-0:${SLUG}`)).toBe(false);

    const closed = setup(3);
    await closed.run(["9000"]);
    closed.store.windows.set(SLUG, at(DAY_MS).toISOString());
    closed.store.clock = at(2 * DAY_MS);
    expect(closed.store.restoreReply("x", "9000")).toBe("closed");
    expect(closed.store.row("9000")?.withdrawnAt).toEqual(NOW);
  });
});

describe("a halt hides, it doesn't hold a withdrawal (LEX condition 1a)", () => {
  it("a halted run hides what it found gone from the count: held, not withdrawn, not deleted", async () => {
    const { store, run, ids } = setup(100);
    const report = await run(ids.slice(0, 21)); // one over the ceiling of 20
    expect(report).toEqual({ posts: 1, checked: 100, gone: 21, outcomes: {}, incomplete: 0, halted: true, held: 21 });
    expect(counted(store)).toBe(79);
    expect(store.ledger).toHaveLength(100);
    expect(store.ledger.filter((l) => l.heldAt)).toHaveLength(21);
    expect(store.ledger.filter((l) => l.withdrawnAt)).toEqual([]);
    expect(store.firstHaltedAt).toEqual(NOW);
  });

  it("a held reply can't set a call: an earlier reply of the same person takes over while the halt lasts", async () => {
    const { store, run, ids } = setup(12);
    store.ledger.push({ platform: "x", replyId: "8000", postId: OUR_POST, userId: "user-0", slug: SLUG, probability: 25, at: "2026-11-18T10:00:00.000Z" });
    await run(ids.slice(0, 11));
    expect(store.row("9000")?.heldAt).toEqual(NOW);
    expect(store.calls.get(`user-0:${SLUG}`)).toEqual({ probability: 25, source: "x" });
  });

  it("the next approved run converts held replies to withdrawn", async () => {
    const { store, run, ids } = setup(100);
    const gone = ids.slice(0, 21);
    await run(gone);
    store.clock = at(DAY_MS);
    store.approveSweep();
    const report = await run(gone);
    // "removed": each was already hidden by the hold, so its call needed no further change.
    expect(report).toEqual({ posts: 1, checked: 100, gone: 21, outcomes: { removed: 21 }, incomplete: 0, halted: false, approvedOverride: true });
    expect(store.ledger.filter((l) => l.heldAt)).toEqual([]);
    expect(store.ledger.filter((l) => l.withdrawnAt)).toHaveLength(21);
    expect(store.row("9000")?.withdrawnAt).toEqual(at(DAY_MS)); // the 7 days run from the withdrawal, not the hold
    expect(counted(store)).toBe(79);
    expect(store.firstHaltedAt).toBeNull(); // the halt is over
  });

  it("a later run under the ceiling settles the halt on its own: still gone is withdrawn, back up counts again", async () => {
    const { store, run, ids } = setup(100);
    await run(ids.slice(0, 21));
    store.clock = at(DAY_MS);
    const report = await run(ids.slice(0, 5)); // the platform now reports only five of them gone
    expect(report).toEqual({ posts: 1, checked: 100, gone: 5, outcomes: { removed: 5 }, incomplete: 0, halted: false, released: 16 });
    expect(store.ledger.filter((l) => l.withdrawnAt).map((l) => l.replyId)).toEqual(ids.slice(0, 5));
    expect(store.ledger.filter((l) => l.heldAt)).toEqual([]);
    expect(counted(store)).toBe(95);
    expect(store.calls.get(`user-20:${SLUG}`)).toEqual({ probability: 75, source: "x" });
    expect(store.approvalAsked).toBe(1); // only the halted run asked
    expect(store.firstHaltedAt).toBeNull();
  });

  it("a second halted run keeps holding, holds the newly gone, and never holds a reply twice", async () => {
    const { store, run, ids } = setup(100);
    await run(ids.slice(0, 21));
    store.clock = at(DAY_MS);
    const report = await run(ids.slice(0, 25));
    expect(report).toMatchObject({ gone: 25, outcomes: {}, halted: true, held: 25 });
    expect(store.row("9000")?.heldAt).toEqual(NOW); // the first hold's time stands
    expect(store.row("9024")?.heldAt).toEqual(at(DAY_MS));
    expect(counted(store)).toBe(75);
    expect(store.firstHaltedAt).toEqual(NOW);
  });

  it("a held reply is counted again only after a complete answer from the platform", async () => {
    const { store, run, ids } = setup(100);
    await run(ids.slice(0, 21));
    const report = await run([], false); // the check stopped early: silence proves nothing
    expect(report).toMatchObject({ checked: 0, gone: 0, incomplete: 1, halted: false });
    expect(report).not.toHaveProperty("released");
    expect(store.ledger.filter((l) => l.heldAt)).toHaveLength(21);
    expect(counted(store)).toBe(79);
    expect(store.firstHaltedAt).toEqual(NOW); // still open
  });

  it("zack can put a held reply back by hand too", async () => {
    const { store, run, ids } = setup(12);
    await run(ids.slice(0, 11));
    expect(store.restoreReply("x", "9000")).toBe("counted");
    expect(store.row("9000")).not.toHaveProperty("heldAt");
    expect(counted(store)).toBe(2);
  });

  it("the sweep's own release never touches a withdrawn reply", async () => {
    const { store, run } = setup(5);
    await run(["9000"]);
    expect(await store.releaseReply("x", "9000")).toBe("unknown");
    expect(store.row("9000")?.withdrawnAt).toEqual(NOW);
    expect(counted(store)).toBe(4);
  });

  it("privacy: a halted run's report is still counts only", async () => {
    const { run, ids } = setup(100);
    expect(JSON.stringify(await run(ids.slice(0, 21)))).not.toMatch(/\d{6,}|user-/);
  });
});

describe("a halt still open after 72 hours (LEX condition 1b)", () => {
  it("is reported by the first run at 72 hours, and by every run after, until it is settled", async () => {
    expect(SWEEP_HALT_ALERT_HOURS).toBe(72);
    const { store, run, ids } = setup(100);
    const gone = ids.slice(0, 21);
    expect(await run(gone)).not.toHaveProperty("haltUnresolved72h");
    for (const hours of [24, 48, 72 - 1 / 3600]) {
      store.clock = at(hours * HOUR_MS);
      const early = await run(gone);
      expect(early.halted).toBe(true);
      expect(early).not.toHaveProperty("haltUnresolved72h");
    }
    for (const hours of [72, 96]) {
      store.clock = at(hours * HOUR_MS);
      expect(await run(gone)).toMatchObject({ halted: true, haltUnresolved72h: true });
    }
    expect(store.firstHaltedAt).toEqual(NOW); // measured from the first halt, not the latest

    // Approved at last: the run settles the halt and has nothing more to report.
    store.clock = at(97 * HOUR_MS);
    store.approveSweep();
    const settled = await run(gone);
    expect(settled).toMatchObject({ halted: false, approvedOverride: true });
    expect(settled).not.toHaveProperty("haltUnresolved72h");
    expect(store.firstHaltedAt).toBeNull();
  });

  it("is reported even by a run that isn't halted itself, while replies are still held", async () => {
    const { store, run, ids } = setup(100);
    await run(ids.slice(0, 21));
    store.clock = at(80 * HOUR_MS);
    const report = await run([], false); // nothing could be checked today
    expect(report).toMatchObject({ halted: false, haltUnresolved72h: true });
    // A day with no post to check says so as well.
    expect(await sweepDeletedReplies({ posts: [], providers: {}, store, now: store.clock })).toMatchObject({ haltUnresolved72h: true });
  });

  it("a new halt after a settled one starts its own 72 hours", async () => {
    const { store, run, ids } = setup(100);
    await run(ids.slice(0, 21));
    store.clock = at(DAY_MS);
    await run([]); // all 21 are back up: released, halt over
    expect(store.firstHaltedAt).toBeNull();
    store.clock = at(80 * HOUR_MS);
    const again = await run(ids.slice(0, 21));
    expect(again.halted).toBe(true);
    expect(again).not.toHaveProperty("haltUnresolved72h");
    expect(store.firstHaltedAt).toEqual(at(80 * HOUR_MS));
  });

  it("a run with no halt anywhere reports nothing", async () => {
    const { run } = setup(5);
    expect(await run(["9000"])).not.toHaveProperty("haltUnresolved72h");
  });
});

describe("the approval log (LEX condition 2)", () => {
  it("logs when the approval was given and by which role, when it was used, and how many replies that run took out", async () => {
    const { store, run, ids } = setup(100);
    const gone = ids.slice(0, 21);
    await run(gone); // halted
    store.clock = at(2 * HOUR_MS);
    const until = store.approveSweep("postgres");
    store.clock = at(DAY_MS);
    const report = await run(gone);
    expect(report.approvedOverride).toBe(true);
    const given = { approvedAt: at(2 * HOUR_MS), approvedBy: "postgres", approvedUntil: until };
    expect(store.approvalLog).toEqual([
      { event: "given", ...given },
      { event: "used", ...given, usedAt: at(DAY_MS), inTime: true },
      { event: "removed", ...given, usedAt: at(DAY_MS), removed: 21 },
    ]);
    expect(until).toEqual(at(38 * HOUR_MS)); // 36 hours from when it was given
  });

  it("counts what the run really took out, not what the platform reported", async () => {
    const { store, run, ids } = setup(100);
    store.approveSweep();
    store.removeFails.add("9000"); // one removal fails; it is found again tomorrow
    const report = await run(ids.slice(0, 21));
    expect(report).toMatchObject({ gone: 21, outcomes: { call_removed: 20 }, incomplete: 1, approvedOverride: true });
    expect(store.approvalLog.at(-1)).toMatchObject({ event: "removed", removed: 20 });
  });

  it("an approval used past its time is logged as such, with no removal count", async () => {
    const { store, run, ids } = setup(100);
    store.approveSweep();
    store.clock = at(36 * HOUR_MS);
    expect(await run(ids.slice(0, 21))).toMatchObject({ halted: true });
    expect(store.approvalLog.map((r) => r.event)).toEqual(["given", "used"]);
    expect(store.approvalLog[1]).toMatchObject({ event: "used", inTime: false, usedAt: at(36 * HOUR_MS) });
  });

  it("a run under the ceiling, and a halted run with no approval, log nothing", async () => {
    const { store, run, ids } = setup(100);
    await run(ids.slice(0, 20));
    await run(ids.slice(20, 60));
    expect(store.approvalLog).toEqual([]);
  });

  it("an approval from before the log existed is still logged: given 36 hours before its end, by 'unknown'", async () => {
    const { store, run, ids } = setup(100);
    store.sweepApprovedUntil = at(10 * HOUR_MS);
    await run(ids.slice(0, 21));
    expect(store.approvalLog[0]).toEqual({ event: "used", approvedAt: at(-26 * HOUR_MS), approvedBy: "unknown", approvedUntil: at(10 * HOUR_MS), usedAt: NOW, inTime: true });
    expect(store.approvalLog[1]).toMatchObject({ event: "removed", removed: 21 });
  });

  it("a log that can't be written never undoes or stops the removals; the use is on record without a count", async () => {
    const { store, run, ids } = setup(100);
    store.approveSweep();
    store.recordFails = true;
    const report = await run(ids.slice(0, 21));
    expect(report).toMatchObject({ outcomes: { call_removed: 21 }, halted: false, approvedOverride: true });
    expect(store.approvalLog.map((r) => r.event)).toEqual(["given", "used"]);
  });
});

describe("the daily step logs a halt that is still open after 72 hours", () => {
  const h = { sweep: null as SweepReport | null };
  const base: SweepReport = { posts: 0, checked: 0, gone: 0, outcomes: {}, incomplete: 0, halted: false };
  const keys = { SOCIAL_VOTING: "1", SOCIAL_LINK_SECRET: "s".repeat(40) };

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/lib/supabase/admin", () => ({ adminSupabase: () => ({}) }));
    vi.doMock("@/lib/social-voting/sweep", async (original) => ({ ...(await original<Record<string, unknown>>()), sweepDeletedReplies: async () => h.sweep }));
    vi.doMock("@/lib/social-voting/count", async (original) => ({
      ...(await original<Record<string, unknown>>()),
      countSocialReplies: async () => ({ posts: 0 }),
      officialPosts: (): OfficialPost[] => [],
    }));
  });

  it("logs the code social-sweep: halt-unapproved-72h, after the halted code, and nothing else", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { runSocialStep } = await import("@/lib/social-voting/run");
    h.sweep = { ...base, halted: true, held: 21, haltUnresolved72h: true };
    await runSocialStep(NOW, keys);
    expect(warn.mock.calls).toEqual([["social-sweep: halted"], ["social-sweep: halt-unapproved-72h"]]);
  });

  it("logs it on a run that isn't halted itself, once per run, and not before the 72 hours", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { runSocialStep } = await import("@/lib/social-voting/run");
    h.sweep = { ...base, haltUnresolved72h: true };
    await runSocialStep(NOW, keys);
    expect(warn.mock.calls).toEqual([["social-sweep: halt-unapproved-72h"]]);

    warn.mockClear();
    h.sweep = { ...base, halted: true, held: 21 };
    await runSocialStep(NOW, keys);
    expect(warn.mock.calls).toEqual([["social-sweep: halted"]]);
  });
});

describe("the withdrawals migration", () => {
  const dir = join(__dirname, "..", "..", "..", "supabase", "migrations");
  const raw = readFileSync(join(dir, "20261120001000_social_sweep_withdrawals.sql"), "utf8");
  const sql = raw.replace(/--[^\n]*/g, "").toLowerCase();
  /** One function's text, from its name to the end of its body. */
  const fn = (name: string) => sql.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$[\\s\\S]*?\\$\\$;`))?.[0] ?? "";
  const live = /withdrawn_at is null and v\.held_at is null/;

  it("says how zack restores a reply, and that it hasn't been run on any Postgres yet", () => {
    expect(raw).toMatch(/Not run on any Postgres yet/);
    expect(raw).toMatch(/select public\.restore_social_reply\('x', '\d+'\);/);
  });

  it("is safe to run again, and deletes or rewrites nothing that exists", () => {
    expect(sql).not.toMatch(/create table (?!if not exists)/);
    expect(sql).not.toMatch(/create function/);
    expect(sql).not.toMatch(/create (unique )?index (?!if not exists)/);
    expect(sql.match(/add column (?!if not exists)/)).toBeNull();
    expect(sql).not.toMatch(/drop (table|function|column|index)/);
  });

  it("adds the two markers to the ledger, never both on one row", () => {
    expect(sql).toMatch(/alter table public\.social_votes add column if not exists withdrawn_at timestamptz;/);
    expect(sql).toMatch(/alter table public\.social_votes add column if not exists held_at timestamptz;/);
    expect(sql).toMatch(/check \(withdrawn_at is null or held_at is null\)/);
  });

  it("no longer deletes a gone reply: it is marked, and remove_social_reply() only withdraws", () => {
    const mark = fn("mark_social_reply_gone");
    expect(mark).toMatch(/set withdrawn_at = now\(\), held_at = null/);
    expect(mark).toMatch(/set held_at = now\(\)/);
    expect(mark).not.toMatch(/delete from public\.social_votes/);
    expect(fn("remove_social_reply")).toMatch(/select public\.mark_social_reply_gone\(p_platform, p_reply_id, false\)/);
    expect(fn("hold_social_reply")).toMatch(/select public\.mark_social_reply_gone\(p_platform, p_reply_id, true\)/);
    // The only real deletion of a ledger row here is the purge, 7 days after the withdrawal, on the database's clock.
    expect(sql.match(/delete from public\.social_votes/g)).toHaveLength(1);
    expect(fn("purge_withdrawn_social_replies")).toMatch(/delete from public\.social_votes v where v\.withdrawn_at < now\(\) - interval '7 days'/);
  });

  it("every place a reply can set a call looks at live replies only", () => {
    // Each query that finds "the person's latest reply", in every function, carries the live filter.
    const latest = sql.match(/from public\.social_votes v\s+where v\.user_id = [^;]*?(?:limit 1|\) then)/g) ?? [];
    expect(latest).toHaveLength(4); // count (1), mark (2), restore (1)
    for (const q of latest) expect(q).toMatch(live);
    expect(fn("count_social_reply")).toMatch(live);
    expect(fn("mark_social_reply_gone").match(new RegExp(live.source, "g"))).toHaveLength(2);
    expect(fn("restore_social_reply")).toMatch(live);
  });

  it("the older migration's count and removal are the only functions that read the ledger, and both are replaced here", () => {
    const older = readFileSync(join(dir, "20261119000000_social_voting.sql"), "utf8").replace(/--[^\n]*/g, "").toLowerCase();
    const readers = [...older.matchAll(/create or replace function public\.(\w+)\(([\s\S]*?)\$\$([\s\S]*?)\$\$;/g)].filter((m) => /social_votes/.test(m[3]!)).map((m) => m[1]);
    expect(readers).toEqual(["count_social_reply", "remove_social_reply"]);
    for (const name of readers) expect(fn(name!)).not.toBe("");
    // No view anywhere reads the ledger; "Canada says" is built from calls.
    const all = ["20261119000000_social_voting.sql", "20261120000000_social_sweep_approval.sql"].map((f) => readFileSync(join(dir, f), "utf8").toLowerCase()).join("\n") + sql;
    expect(all).not.toMatch(/create (or replace )?(materialized )?view/);
  });

  it("every function is privileged with a fixed, empty search_path and closed to the public keys", () => {
    const names = [...sql.matchAll(/create or replace function public\.(\w+)\(([^)]*)\)\s+returns (\w+)\s+language (?:plpgsql|sql)( stable)?( security definer)? set search_path = ''/g)];
    expect(names.map((m) => m[1]).sort()).toEqual([
      "approve_social_sweep", "consume_social_sweep_approval", "count_social_reply", "hold_social_reply", "mark_social_reply_gone",
      "note_social_sweep_halt", "purge_withdrawn_social_replies", "record_social_sweep_removals", "release_social_reply",
      "remove_social_reply", "restore_social_reply", "settle_social_sweep_halt", "social_sweep_approval_log_append_only",
    ]);
    expect(sql.match(/create or replace function/g)).toHaveLength(names.length);
    for (const m of names) {
      if (m[3] === "trigger") continue; // the append-only guard runs as whoever tries the change
      expect(m[5], `${m[1]} is security definer`).toBe(" security definer");
      expect(sql, `${m[1]} is revoked`).toMatch(new RegExp(`revoke execute on function public\\.${m[1]}\\([^)]*\\) from public, anon, authenticated`));
    }
    expect(sql).not.toMatch(/search_path = (?!'')/);
  });

  it("restoring, approving and the internal marker are hand-only or internal: no API role may call them, the server key included", () => {
    for (const signature of ["restore_social_reply\\(text, text\\)", "approve_social_sweep\\(\\)", "mark_social_reply_gone\\(text, text, boolean\\)"]) {
      expect(sql).toMatch(new RegExp(`revoke execute on function public\\.${signature} from public, anon, authenticated, service_role;`));
    }
    expect(sql).not.toMatch(/grant [^;]*(restore_social_reply|approve_social_sweep|mark_social_reply_gone)/);
  });

  it("grants the server key exactly the functions the sweep and the count call, and nothing on any table", () => {
    const grants = [...sql.matchAll(/grant ([^;]+);/g)].map((m) => m[1]!.replace(/\s+/g, " "));
    expect(grants.sort()).toEqual([
      "execute on function public.consume_social_sweep_approval() to service_role",
      "execute on function public.count_social_reply(text, text, text, text, text, smallint, timestamptz) to service_role",
      "execute on function public.hold_social_reply(text, text) to service_role",
      "execute on function public.note_social_sweep_halt() to service_role",
      "execute on function public.purge_withdrawn_social_replies() to service_role",
      "execute on function public.record_social_sweep_removals(integer) to service_role",
      "execute on function public.release_social_reply(text, text) to service_role",
      "execute on function public.remove_social_reply(text, text) to service_role",
      "execute on function public.settle_social_sweep_halt() to service_role",
    ]);
  });

  it("the sweep's release can only ever reach a held reply", () => {
    const release = fn("release_social_reply");
    expect(release).toMatch(/if not exists \(select 1 from public\.social_votes v\s+where v\.platform = p_platform and v\.reply_id = p_reply_id and v\.held_at is not null\) then\s+return 'unknown';/);
    expect(fn("restore_social_reply")).toMatch(/if back\.withdrawn_at <= now\(\) - interval '7 days' then return 'expired'; end if;/);
  });

  it("the approval log is append-only, with RLS on, no policy and no rights for any API role", () => {
    expect(sql).toMatch(/create table if not exists public\.social_sweep_approval_log/);
    expect(sql).toMatch(/alter table public\.social_sweep_approval_log enable row level security;/);
    expect(sql).toMatch(/revoke all on public\.social_sweep_approval_log from public, anon, authenticated, service_role;/);
    expect(sql).not.toMatch(/create policy/);
    expect(sql).toMatch(/before update or delete on public\.social_sweep_approval_log\s+for each row execute function public\.social_sweep_approval_log_append_only\(\)/);
    expect(sql).toMatch(/before truncate on public\.social_sweep_approval_log/);
    expect(sql).not.toMatch(/(update|delete from) public\.social_sweep_approval_log/);
    expect(sql.match(/insert into public\.social_sweep_approval_log/g)).toHaveLength(3); // given, used, removed
  });

  it("the log records who gave the approval and when, when it was used, and the run's count once", () => {
    const approve = fn("approve_social_sweep");
    expect(approve).toMatch(/values \(true, now\(\) \+ interval '36 hours', now\(\), session_user\)/);
    expect(approve).toMatch(/values \('given', now\(\), session_user, until_at\)/);
    const consume = fn("consume_social_sweep_approval");
    expect(consume).toMatch(/delete from public\.social_sweep_approval a where a\.id returning \* into used;/);
    expect(consume).toMatch(/'used', coalesce\(used\.approved_at, used\.approved_until - interval '36 hours'\)/);
    expect(consume).toMatch(/ok := used\.approved_until > now\(\);/);
    const record = fn("record_social_sweep_removals");
    expect(record).toMatch(/if not found or not last_use\.in_time then return false; end if;/);
    expect(record).toMatch(/exception when unique_violation then\s+return false;/);
    expect(sql).toMatch(/create unique index if not exists social_sweep_approval_log_one_count\s+on public\.social_sweep_approval_log \(used_at\) where event = 'removed';/);
  });

  it("the halt's first time is kept in one row no API role can touch, and it ends only when nothing is held on an open question", () => {
    expect(sql).toMatch(/create table if not exists public\.social_sweep_halt \(\s+id boolean primary key default true check \(id\),\s+first_halted_at timestamptz not null default now\(\)/);
    expect(sql).toMatch(/alter table public\.social_sweep_halt enable row level security;/);
    expect(sql).toMatch(/revoke all on public\.social_sweep_halt from public, anon, authenticated, service_role;/);
    expect(fn("note_social_sweep_halt")).toMatch(/on conflict \(id\) do nothing/);
    const settle = fn("settle_social_sweep_halt");
    expect(settle).toMatch(/where v\.held_at is not null and w\.closes_at > now\(\)/);
    expect(settle).toMatch(/delete from public\.social_sweep_halt h where h\.id;\s+return null;/);
  });
});
