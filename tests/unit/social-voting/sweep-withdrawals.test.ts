/**
 * LEX's three conditions on the daily sweep, before social voting may be turned on:
 *
 * 1. A halt must not hold a withdrawal for long: what a halted run found gone is hidden from "Canada says" at once
 *    (held, not removed), and a halt still open 72 hours after it first happened is logged again on every run.
 * 2. Each use of the hand-given approval is logged: when it was given and by which database role, when it was
 *    used, and how many replies that run took out.
 * 3. Removal is soft: a gone reply is marked withdrawn and stops counting at once; it can be put back by hand for
 *    7 days, and the first run after that deletes it for real.
 *
 * And LEX's two changes on review: a restore by hand also works after the close, for a reply written before it,
 * and every restore is logged; an approval needs a name and a reason.
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

  it("a restore never overrides a website call or a newer live reply, and is refused after 7 days", async () => {
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

  });
});

describe("restoring after the close, and the restore log (LEX on review)", () => {
  const CLOSE = at(DAY_MS);
  /** Replies written the day before NOW; the question closes one day after NOW. */
  function closing(total: number) {
    const s = setup(total);
    s.store.windows.set(SLUG, CLOSE.toISOString());
    return s;
  }

  it("a reply written before the close can be restored after it, inside the 7 days: the call is back, as made in time", async () => {
    const { store, run } = closing(5);
    await run(["9000"]); // withdrawn while the question was open
    store.clock = at(3 * DAY_MS); // closed two days ago
    expect(store.restoreReply("x", "9000")).toBe("counted");
    // The call carries the reply's own time, not the time of the restore, so it reads as a call made in time.
    expect(store.calls.get(`user-0:${SLUG}`)).toEqual({ probability: 75, source: "x", madeAt: "2026-11-18T14:00:00.000Z" });
    expect(Date.parse(store.calls.get(`user-0:${SLUG}`)!.madeAt!)).toBeLessThan(CLOSE.getTime());
    expect(store.row("9000")).not.toHaveProperty("withdrawnAt");
    expect(counted(store)).toBe(5); // scored like any other call: every reader of calls sees it
  });

  it("a restore while the question is open stamps the call as any other write does", async () => {
    const { store, run } = closing(5);
    await run(["9000"]);
    expect(store.restoreReply("x", "9000")).toBe("counted");
    expect(store.calls.get(`user-0:${SLUG}`)).toEqual({ probability: 75, source: "x" });
  });

  it("a reply written at or after the close is never restored after it", async () => {
    const { store } = closing(2);
    for (const [replyId, written] of [["9600", CLOSE], ["9601", at(DAY_MS + 1)]] as const) {
      store.ledger.push({ platform: "x", replyId, postId: OUR_POST, userId: `late-${replyId}`, slug: SLUG, probability: 25, at: written.toISOString(), withdrawnAt: at(DAY_MS + 2) });
    }
    store.clock = at(2 * DAY_MS);
    expect(store.restoreReply("x", "9600")).toBe("after_close");
    expect(store.restoreReply("x", "9601")).toBe("after_close");
    expect(store.row("9600")?.withdrawnAt).toEqual(at(DAY_MS + 2));
    expect(counted(store)).toBe(2);
  });

  it("the 7 days still hold after the close", async () => {
    const { store, run } = closing(5);
    await run(["9000"]);
    store.clock = at(7 * DAY_MS - 1);
    expect(store.restoreReply("x", "9001")).toBe("live");
    store.clock = at(7 * DAY_MS);
    expect(store.restoreReply("x", "9000")).toBe("expired");
    expect(store.calls.has(`user-0:${SLUG}`)).toBe(false);
  });

  it("after the close a website call still wins, and a newer live reply still sets the call", async () => {
    const web = closing(3);
    await web.run(["9000"]);
    web.store.calls.set(`user-0:${SLUG}`, { probability: 62, source: "web" });
    web.store.clock = at(2 * DAY_MS);
    expect(web.store.restoreReply("x", "9000")).toBe("website_wins");
    expect(web.store.calls.get(`user-0:${SLUG}`)).toEqual({ probability: 62, source: "web" });

    const newer = closing(3);
    await newer.run(["9000"]);
    newer.store.ledger.push({ platform: "x", replyId: "9500", postId: OUR_POST, userId: "user-0", slug: SLUG, probability: 25, at: "2026-11-19T10:00:00.000Z" });
    newer.store.calls.set(`user-0:${SLUG}`, { probability: 25, source: "x" });
    newer.store.clock = at(2 * DAY_MS);
    expect(newer.store.restoreReply("x", "9000")).toBe("older_reply");
    expect(newer.store.calls.get(`user-0:${SLUG}`)).toEqual({ probability: 25, source: "x" });
  });

  it("a held reply is never released automatically at or after the close", async () => {
    const { store, run, ids } = closing(12);
    await run(ids.slice(0, 11)); // halted: eleven held
    store.clock = at(2 * DAY_MS);
    expect(await store.releaseReply("x", "9000")).toBe("closed");
    expect(store.row("9000")?.heldAt).toEqual(NOW);
    expect(counted(store)).toBe(1);
    // A whole run after the close changes nothing either.
    await run([]);
    expect(store.ledger.filter((l) => l.heldAt)).toHaveLength(11);
    expect(counted(store)).toBe(1);
  });

  it("a held reply on a closed question can be restored by hand, for 7 days after the close", async () => {
    const { store, run, ids } = closing(12);
    await run(ids.slice(0, 11));
    store.clock = at(DAY_MS + 7 * DAY_MS - 1);
    expect(store.restoreReply("x", "9000")).toBe("counted");
    expect(store.calls.get(`user-0:${SLUG}`)).toEqual({ probability: 75, source: "x", madeAt: "2026-11-18T14:00:00.000Z" });
    store.clock = at(DAY_MS + 7 * DAY_MS);
    expect(store.restoreReply("x", "9001")).toBe("expired");
    expect(store.row("9001")?.heldAt).toEqual(NOW);
  });

  it("a question with no close time on record takes no restore", async () => {
    const { store, run } = closing(3);
    await run(["9000"]);
    store.windows.delete(SLUG);
    expect(store.restoreReply("x", "9000")).toBe("closed");
    expect(store.row("9000")?.withdrawnAt).toEqual(NOW);
  });

  it("every restore is logged, before or after the close, whatever it answers: when, who, which reply, the result", async () => {
    const { store, run, ids } = closing(12);
    await run(["9000"]);
    store.clock = at(HOUR_MS);
    store.restoreReply("x", "9000", " zack "); // before the close
    store.restoreReply("x", "9000", "zack"); // nothing to do
    store.restoreReply("x", "1", "zack"); // no such reply
    await run(ids.slice(0, 11)); // halted
    store.clock = at(2 * HOUR_MS);
    await run([]); // the platform reports them back: the sweep releases all eleven
    await run(["9003"]);
    store.clock = at(2 * DAY_MS);
    store.restoreReply("x", "9003", "zack"); // after the close
    const hand = store.restoreLog.filter((r) => r.origin === "hand");
    expect(hand).toEqual([
      { restoredAt: at(HOUR_MS), restoredBy: "postgres", restoredName: "zack", origin: "hand", platform: "x", replyId: "9000", userId: "user-0", result: "counted", afterClose: false },
      { restoredAt: at(HOUR_MS), restoredBy: "postgres", restoredName: "zack", origin: "hand", platform: "x", replyId: "9000", userId: "user-0", result: "live", afterClose: false },
      { restoredAt: at(HOUR_MS), restoredBy: "postgres", restoredName: "zack", origin: "hand", platform: "x", replyId: "1", userId: null, result: "unknown", afterClose: false },
      { restoredAt: at(2 * DAY_MS), restoredBy: "postgres", restoredName: "zack", origin: "hand", platform: "x", replyId: "9003", userId: "user-3", result: "counted", afterClose: true },
    ]);
    const swept = store.restoreLog.filter((r) => r.origin === "sweep");
    expect(swept).toHaveLength(11);
    expect(swept.every((r) => r.result === "counted" && !r.afterClose && r.restoredBy === "authenticator" && r.restoredName === "system")).toBe(true);
  });

  it("a restore needs a name: a missing, blank or over-long one is refused, and nothing is restored or logged", async () => {
    const { store, run } = closing(5);
    await run(["9000"]);
    for (const name of [null, "", "   ", "\n\t"]) expect(() => store.restoreReply("x", "9000", name)).toThrow(/needs a name/);
    expect(() => store.restoreReply("x", "9000", "z".repeat(81))).toThrow(/too long/);
    expect(store.row("9000")?.withdrawnAt).toEqual(NOW);
    expect(store.restoreLog).toEqual([]);
    expect(store.restoreReply("x", "9000", "z".repeat(80))).toBe("counted");
  });
});

describe("the two logs: personal information and the 12 months (LEX and AEGIS on review)", () => {
  /** Two restores by hand, for two people, and one approval used. */
  async function logged() {
    const s = setup(100);
    await s.run(["9000", "9001"]);
    s.store.restoreReply("x", "9000", "zack");
    s.store.restoreReply("x", "9001", "zack");
    s.store.approveSweep();
    await s.run(s.ids.slice(2, 30));
    expect(s.store.restoreLog).toHaveLength(2);
    expect(s.store.approvalLog.map((r) => r.event)).toEqual(["given", "used", "removed"]);
    return s;
  }

  it("deleting an account blanks the reply id and the person's id in their restore-log rows, and keeps the rest", async () => {
    const { store } = await logged();
    store.deleteAccount("user-0");
    expect(store.restoreLog[0]).toEqual({ restoredAt: NOW, restoredBy: "postgres", restoredName: "zack", origin: "hand", platform: "x", replyId: null, userId: null, result: "counted", afterClose: false });
    // Another person's row is untouched.
    expect(store.restoreLog[1]).toMatchObject({ replyId: "9001", userId: "user-1" });
    expect(JSON.stringify(store.restoreLog[0])).not.toMatch(/9000|user-0/);
    expect(store.row("9000")).toBeUndefined(); // the ledger row went by cascade
    store.deleteAccount("user-0"); // nothing left to blank: no error
    store.deleteAccount("nobody");
    expect(store.restoreLog).toHaveLength(2);
  });

  it("forgery: changing the result while nulling reply_id is refused, and so is any other change", async () => {
    const { store } = await logged();
    const before = JSON.stringify(store.restoreLog);
    expect(() => store.updateRestoreLog(0, { replyId: null, userId: null, result: "unknown" })).toThrow(/append-only/);
    expect(() => store.updateRestoreLog(0, { replyId: null, userId: null, restoredName: "someone else" })).toThrow(/append-only/);
    expect(() => store.updateRestoreLog(0, { replyId: null, userId: null, restoredAt: at(-400 * DAY_MS) })).toThrow(/append-only/); // can't be aged into the purge
    expect(() => store.updateRestoreLog(0, { replyId: null, userId: null, afterClose: true })).toThrow(/append-only/);
    expect(() => store.updateRestoreLog(0, { replyId: null, userId: null, platform: "threads" })).toThrow(/append-only/);
    expect(() => store.updateRestoreLog(0, { replyId: "9999", userId: null })).toThrow(/append-only/); // a new value is not a null
    expect(() => store.updateRestoreLog(0, { replyId: null })).toThrow(/append-only/); // both, or nothing
    expect(() => store.updateRestoreLog(0, {})).toThrow(/append-only/);
    expect(JSON.stringify(store.restoreLog)).toBe(before);
    // The one allowed change, and it can be repeated (null stays null).
    store.updateRestoreLog(0, { replyId: null, userId: null });
    store.updateRestoreLog(0, { replyId: null, userId: null });
    expect(() => store.updateRestoreLog(0, { replyId: "9000", userId: "user-0" })).toThrow(/append-only/); // and never back
  });

  it("forgery: deleting an 11-month-old row is refused in both logs; only a row past 12 months can go", async () => {
    const { store } = await logged();
    const eleven = new Date(NOW);
    eleven.setUTCMonth(eleven.getUTCMonth() + 11);
    store.clock = eleven;
    expect(() => store.deleteLogRow("restore", 0)).toThrow(/12 months/);
    expect(() => store.deleteLogRow("approval", 0)).toThrow(/12 months/);
    store.clock = NOW; // a fresh row can't go either
    expect(() => store.deleteLogRow("restore", 0)).toThrow(/12 months/);
    const twelve = new Date(NOW);
    twelve.setUTCMonth(twelve.getUTCMonth() + 12);
    store.clock = twelve; // exactly 12 months: not yet
    expect(() => store.deleteLogRow("restore", 0)).toThrow(/12 months/);
    expect(() => store.deleteLogRow("approval", 0)).toThrow(/12 months/);
    expect(store.restoreLog).toHaveLength(2);
    expect(store.approvalLog).toHaveLength(3);
    store.clock = new Date(twelve.getTime() + 1);
    store.deleteLogRow("restore", 0);
    store.deleteLogRow("approval", 0);
    expect(store.restoreLog).toHaveLength(1);
    expect(store.approvalLog).toHaveLength(2);
  });

  it("truncate is always refused, however old the rows", async () => {
    const { store } = await logged();
    store.clock = at(800 * DAY_MS);
    expect(() => store.truncateLog("restore")).toThrow(/append-only/);
    expect(() => store.truncateLog("approval")).toThrow(/append-only/);
    expect(store.restoreLog).toHaveLength(2);
  });

  it("the sweep's run purges both logs after 12 months, and not a day before", async () => {
    const { store, run } = await logged();
    const eleven = new Date(NOW);
    eleven.setUTCMonth(eleven.getUTCMonth() + 11);
    store.clock = eleven;
    await run([]);
    expect(store.restoreLog).toHaveLength(2);
    expect(store.approvalLog).toHaveLength(3);

    const past = new Date(NOW);
    past.setUTCMonth(past.getUTCMonth() + 12);
    store.clock = new Date(past.getTime() + 1);
    await sweepDeletedReplies({ posts: [], providers: {}, store, now: store.clock }); // even on a day with no post to check
    expect(store.restoreLog).toEqual([]);
    expect(store.approvalLog).toEqual([]);
  });

  it("a log purge that fails never stops the run", async () => {
    const { store, run } = await logged();
    store.purgeFails = true;
    expect(await run([])).toMatchObject({ halted: false, checked: 72 });
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
    const until = store.approveSweep("zack", "  Checked 21 replies on X by hand: all really deleted. ", "postgres");
    store.clock = at(DAY_MS);
    const report = await run(gone);
    expect(report.approvedOverride).toBe(true);
    const given = { approvedAt: at(2 * HOUR_MS), approvedBy: "postgres", approvedName: "zack", approvedReason: "Checked 21 replies on X by hand: all really deleted.", approvedUntil: until };
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

  it("an approval needs a name and a reason: a missing or blank one is refused, and nothing is approved or logged", async () => {
    const { store, run, ids } = setup(100);
    for (const [name, reason] of [[null, "why"], ["zack", null], ["", "why"], ["zack", ""], ["   ", "why"], ["zack", " \n\t "]] as const) {
      expect(() => store.approveSweep(name, reason)).toThrow(/needs a name and a reason/);
    }
    expect(() => store.approveSweep("z".repeat(81), "why")).toThrow(/too long/);
    expect(() => store.approveSweep("zack", "y".repeat(501))).toThrow(/too long/);
    expect(store.sweepApprovedUntil).toBeNull();
    expect(store.approvalLog).toEqual([]);
    expect(await run(ids.slice(0, 21))).toMatchObject({ halted: true }); // so the run still halts
  });

  it("an approval from before the log existed is still logged: given 36 hours before its end, by 'unknown'", async () => {
    const { store, run, ids } = setup(100);
    store.sweepApprovedUntil = at(10 * HOUR_MS);
    await run(ids.slice(0, 21));
    expect(store.approvalLog[0]).toEqual({ event: "used", approvedAt: at(-26 * HOUR_MS), approvedBy: "unknown", approvedName: "unknown", approvedReason: "unknown", approvedUntil: at(10 * HOUR_MS), usedAt: NOW, inTime: true });
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

  it("says how zack restores a reply and approves a sweep, and that it hasn't been run on any Postgres yet", () => {
    expect(raw).toMatch(/Not run on any Postgres yet/);
    expect(raw).toMatch(/select public\.restore_social_reply\('x', '\d+', 'zack'\);/);
    expect(raw).not.toMatch(/select public\.restore_social_reply\('x', '\d+'\);/);
    expect(raw).toMatch(/select public\.approve_social_sweep\('zack', '[^']+'\);/);
    expect(raw).not.toMatch(/select public\.approve_social_sweep\(\)/);
  });

  it("is safe to run again, and deletes or rewrites nothing that exists", () => {
    expect(sql).not.toMatch(/create table (?!if not exists)/);
    expect(sql).not.toMatch(/create function/);
    expect(sql).not.toMatch(/create (unique )?index (?!if not exists)/);
    expect(sql.match(/add column (?!if not exists)/)).toBeNull();
    expect(sql).not.toMatch(/drop (table|column|index)/);
    // The two drops: the restore without a name, and the approval without a name and a reason, each right before
    // the version that needs them.
    expect(sql.match(/drop function[^;]*;/g)).toEqual(["drop function if exists public.restore_social_reply(text, text);", "drop function if exists public.approve_social_sweep();"]);
    expect(sql).toMatch(/drop function if exists public\.restore_social_reply\(text, text\);\s+create or replace function public\.restore_social_reply\(p_platform text, p_reply_id text, p_name text\)/);
    expect(sql).toMatch(/drop function if exists public\.approve_social_sweep\(\);\s+create or replace function public\.approve_social_sweep\(p_name text, p_reason text\)/);
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
    expect(latest).toHaveLength(4); // count (1), mark (2), put back (1)
    for (const q of latest) expect(q).toMatch(live);
    expect(fn("count_social_reply")).toMatch(live);
    expect(fn("mark_social_reply_gone").match(new RegExp(live.source, "g"))).toHaveLength(2);
    expect(fn("put_back_social_reply")).toMatch(live);
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
      "approve_social_sweep", "consume_social_sweep_approval", "count_social_reply", "enforce_call_rules", "forget_social_restores_on_delete",
      "hold_social_reply", "mark_social_reply_gone", "note_social_sweep_halt", "purge_social_audit_logs", "purge_withdrawn_social_replies",
      "put_back_social_reply", "record_social_sweep_removals", "release_social_reply", "remove_social_reply", "restore_social_reply",
      "settle_social_sweep_halt", "social_log_append_only", "social_reply_restore_log_guard", "social_sweep_approval_log_guard",
    ]);
    expect(sql.match(/create or replace function/g)).toHaveLength(names.length);
    for (const m of names) {
      if (m[3] === "trigger") continue; // triggers can't be called; the migrations guard checks their search_path
      expect(m[5], `${m[1]} is security definer`).toBe(" security definer");
      expect(sql, `${m[1]} is revoked`).toMatch(new RegExp(`revoke execute on function public\\.${m[1]}\\([^)]*\\) from public, anon, authenticated`));
    }
    expect(sql).not.toMatch(/search_path = (?!'')/);
  });

  it("restoring, approving and the internal marker are hand-only or internal: no API role may call them, the server key included", () => {
    for (const signature of ["restore_social_reply\\(text, text, text\\)", "approve_social_sweep\\(text, text\\)", "mark_social_reply_gone\\(text, text, boolean\\)", "put_back_social_reply\\(text, text, text, text\\)"]) {
      expect(sql).toMatch(new RegExp(`revoke execute on function public\\.${signature} from public, anon, authenticated, service_role;`));
    }
    expect(sql).not.toMatch(/grant [^;]*(restore_social_reply|approve_social_sweep|mark_social_reply_gone|put_back_social_reply)/);
  });

  it("grants the server key exactly the functions the sweep and the count call, and nothing on any table", () => {
    const grants = [...sql.matchAll(/grant ([^;]+);/g)].map((m) => m[1]!.replace(/\s+/g, " "));
    expect(grants.sort()).toEqual([
      "execute on function public.consume_social_sweep_approval() to service_role",
      "execute on function public.count_social_reply(text, text, text, text, text, smallint, timestamptz) to service_role",
      "execute on function public.hold_social_reply(text, text) to service_role",
      "execute on function public.note_social_sweep_halt() to service_role",
      "execute on function public.purge_social_audit_logs() to service_role",
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
    expect(release).toMatch(/return public\.put_back_social_reply\(p_platform, p_reply_id, 'sweep', 'system'\);/);
    expect(fn("restore_social_reply")).toMatch(/return public\.put_back_social_reply\(p_platform, p_reply_id, 'hand', who\);/);
    expect(fn("put_back_social_reply")).toMatch(/if back\.withdrawn_at <= now\(\) - interval '7 days' then result := 'expired'; exit work; end if;/);
  });

  it("the approval log is append-only, with RLS on, no policy and no rights for any API role", () => {
    expect(sql).toMatch(/create table if not exists public\.social_sweep_approval_log/);
    expect(sql).toMatch(/alter table public\.social_sweep_approval_log enable row level security;/);
    expect(sql).toMatch(/revoke all on public\.social_sweep_approval_log from public, anon, authenticated, service_role;/);
    expect(sql).not.toMatch(/create policy/);
    expect(sql).toMatch(/before update or delete on public\.social_sweep_approval_log\s+for each row execute function public\.social_sweep_approval_log_guard\(\)/);
    expect(sql).toMatch(/before truncate on public\.social_sweep_approval_log/);
    expect(sql).not.toMatch(/update public\.social_sweep_approval_log/);
    expect(sql.match(/delete from public\.social_sweep_approval_log/g)).toHaveLength(1); // the 12-month purge only
    expect(sql.match(/insert into public\.social_sweep_approval_log/g)).toHaveLength(3); // given, used, removed
  });

  it("the log records who gave the approval and when, when it was used, and the run's count once", () => {
    const approve = fn("approve_social_sweep");
    expect(approve).toMatch(/values \(true, now\(\) \+ interval '36 hours', now\(\), session_user, who, why\)/);
    expect(approve).toMatch(/values \('given', now\(\), session_user, who, why, until_at\)/);
    const consume = fn("consume_social_sweep_approval");
    expect(consume).toMatch(/delete from public\.social_sweep_approval a where a\.id returning \* into used;/);
    expect(consume).toMatch(/'used', coalesce\(used\.approved_at, used\.approved_until - interval '36 hours'\)/);
    expect(consume).toMatch(/ok := used\.approved_until > now\(\);/);
    const record = fn("record_social_sweep_removals");
    expect(record).toMatch(/if not found or not last_use\.in_time then return false; end if;/);
    expect(record).toMatch(/exception when unique_violation then\s+return false;/);
    expect(sql).toMatch(/create unique index if not exists social_sweep_approval_log_one_count\s+on public\.social_sweep_approval_log \(used_at\) where event = 'removed';/);
  });

  it("an approval needs a name and a reason: null or blank is refused before anything is written, and both are kept", () => {
    const approve = fn("approve_social_sweep");
    expect(approve).toMatch(/^create or replace function public\.approve_social_sweep\(p_name text, p_reason text\)/);
    expect(approve).toMatch(/who text := btrim\(coalesce\(p_name, ''\)\);\s+why text := btrim\(coalesce\(p_reason, ''\)\);/);
    const refuse = approve.indexOf("if who = '' or why = '' then\n    raise exception");
    expect(refuse).toBeGreaterThan(0);
    expect(refuse).toBeLessThan(approve.indexOf("insert into"));
    expect(approve).not.toMatch(/default/); // neither argument can be left out
    expect(sql).toMatch(/alter table public\.social_sweep_approval add column if not exists approved_name text;/);
    expect(sql).toMatch(/alter table public\.social_sweep_approval add column if not exists approved_reason text;/);
    expect(sql).toMatch(/approved_name text not null,\s+approved_reason text not null,/);
    // The name and the reason follow the approval into its 'used' and 'removed' rows.
    expect(fn("consume_social_sweep_approval")).toMatch(/coalesce\(used\.approved_name, 'unknown'\), coalesce\(used\.approved_reason, 'unknown'\)/);
    expect(fn("record_social_sweep_removals")).toMatch(/last_use\.approved_name, last_use\.approved_reason/);
  });

  it("the restore log is append-only, closed to every API role, and written on every run of the restore", () => {
    expect(sql).toMatch(/create table if not exists public\.social_reply_restore_log \(\s+id bigint generated always as identity primary key,\s+restored_at timestamptz not null default now\(\),\s+restored_by text not null,\s+restored_name text not null,\s+origin text not null check \(origin in \('hand', 'sweep'\)\),\s+platform text not null,\s+reply_id text,\s+user_id uuid,\s+result text not null,\s+after_close boolean not null/);
    expect(sql).toMatch(/alter table public\.social_reply_restore_log enable row level security;/);
    expect(sql).toMatch(/revoke all on public\.social_reply_restore_log from public, anon, authenticated, service_role;/);
    expect(sql).toMatch(/before update or delete on public\.social_reply_restore_log\s+for each row execute function public\.social_reply_restore_log_guard\(\)/);
    expect(sql).toMatch(/before truncate on public\.social_reply_restore_log/);
    // One update (account deletion) and one delete (the 12-month purge) in the whole file.
    expect(sql.match(/update public\.social_reply_restore_log/g)).toHaveLength(1);
    expect(sql.match(/delete from public\.social_reply_restore_log/g)).toHaveLength(1);
    const back = fn("put_back_social_reply");
    // One way out of the function: every answer is set inside the block, then logged, then returned.
    expect(back.match(/\breturn\b/g)).toHaveLength(1);
    expect(back).toMatch(/values \(session_user, p_name, p_origin, p_platform, p_reply_id, back\.user_id, result, closed\);\s+return result;\s+end;/);
    expect(sql.match(/insert into public\.social_reply_restore_log/g)).toHaveLength(1);
  });

  it("a restore needs a name: blank is refused before anything is touched, 80 characters at most, and it can't be left out", () => {
    const restore = fn("restore_social_reply");
    expect(restore).toMatch(/^create or replace function public\.restore_social_reply\(p_platform text, p_reply_id text, p_name text\)/);
    expect(restore).toMatch(/who text := btrim\(coalesce\(p_name, ''\)\);/);
    expect(restore).toMatch(/if who = '' then\s+raise exception/);
    expect(restore).toMatch(/if length\(who\) > 80 then\s+raise exception/);
    expect(restore.indexOf("raise exception")).toBeLessThan(restore.indexOf("put_back_social_reply"));
    expect(restore).not.toMatch(/default/);
  });

  it("truncate is always refused on both logs", () => {
    const always = fn("social_log_append_only");
    expect(always.replace(/\s+/g, " ")).toMatch(/begin raise exception '% is append-only', tg_table_name; end;/);
    expect(always).not.toMatch(/\bif\b|\breturn\b/);
    for (const table of ["social_sweep_approval_log", "social_reply_restore_log"]) {
      expect(sql).toMatch(new RegExp(`before truncate on public\\.${table}\\s+for each statement execute function public\\.social_log_append_only\\(\\)`));
    }
  });

  it("a delete is let through only for a row whose own time is more than 12 months back (an 11-month-old row is refused)", () => {
    const approval = fn("social_sweep_approval_log_guard").replace(/\s+/g, " ");
    expect(approval).toMatch(/begin if tg_op = 'delete' and old\.logged_at < now\(\) - interval '12 months' then return old; end if; raise exception/);
    expect(approval.match(/\breturn\b/g)).toHaveLength(1); // the one way through
    expect(approval).not.toMatch(/return new/); // no update ever passes on the approval log

    const restore = fn("social_reply_restore_log_guard").replace(/\s+/g, " ");
    expect(restore).toMatch(/if tg_op = 'delete' then if old\.restored_at < now\(\) - interval '12 months' then return old; end if; raise exception [^;]+; end if;/);
    // No other interval, and no clock but the database's own, anywhere in the guards.
    for (const g of [approval, restore]) {
      expect(g.match(/interval '[^']+'/g)).toEqual(["interval '12 months'"]);
      expect(g).not.toMatch(/current_setting|session_user|current_user|security definer/);
    }
  });

  it("an update is let through only when it nulls reply_id and user_id and every other column is unchanged (changing result is refused)", () => {
    const guard = fn("social_reply_restore_log_guard").replace(/\s+/g, " ");
    const columns = sql.match(/create table if not exists public\.social_reply_restore_log \(([\s\S]*?)\n\);/)![1]!.split("\n").map((l) => l.trim().split(" ")[0]!).filter(Boolean);
    expect(columns).toEqual(["id", "restored_at", "restored_by", "restored_name", "origin", "platform", "reply_id", "user_id", "result", "after_close"]);
    const others = columns.filter((c) => c !== "reply_id" && c !== "user_id");
    // The whole condition, in order: the two personal columns end up null, then every other column by name.
    const expected = ["new.reply_id is null", "new.user_id is null", ...others.map((c) => `new.${c} is not distinct from old.${c}`)].join(" and ");
    expect(guard).toContain(`if ${expected} then return new; end if; raise exception`);
    expect(guard).toContain("new.result is not distinct from old.result");
    // AEGIS: column by column, never a row comparison (a null inside one answers null).
    expect(guard).not.toMatch(/to_jsonb|row\(|\bnew = old\b|\(new\.\*\)|old\.\* /);
    expect(guard.match(/return new/g)).toHaveLength(1);
    expect(guard.match(/return old/g)).toHaveLength(1);
  });

  it("no API role can use the two exceptions: no table rights, unprivileged guards, and the only ways in take no argument", () => {
    expect(raw).toMatch(/No API role can use the exceptions: anon, authenticated and service_role have no right at all on either table/);
    for (const table of ["social_sweep_approval_log", "social_reply_restore_log"]) {
      expect(sql).toMatch(new RegExp(`revoke all on public\\.${table} from public, anon, authenticated, service_role;`));
      expect(sql).not.toMatch(new RegExp(`grant [^;]*${table}`));
    }
    expect(sql).not.toMatch(/create policy/);
    for (const name of ["social_log_append_only", "social_sweep_approval_log_guard", "social_reply_restore_log_guard"]) {
      expect(fn(name)).toMatch(/returns trigger\s+language plpgsql set search_path = ''/);
    }
    const purge = fn("purge_social_audit_logs");
    expect(purge).toMatch(/^create or replace function public\.purge_social_audit_logs\(\)\s+returns integer\s+language sql security definer set search_path = ''/);
    expect(purge).toMatch(/delete from public\.social_sweep_approval_log l where l\.logged_at < now\(\) - interval '12 months' returning 1/);
    expect(purge).toMatch(/delete from public\.social_reply_restore_log l where l\.restored_at < now\(\) - interval '12 months' returning 1/);
    expect(sql).toMatch(/revoke execute on function public\.purge_social_audit_logs\(\) from public, anon, authenticated;/);
  });

  it("account deletion blanks the reply id and the person's id in the deleting transaction, for that account only", () => {
    const forget = fn("forget_social_restores_on_delete");
    expect(forget).toMatch(/returns trigger\s+language plpgsql security definer set search_path = ''/);
    expect(forget).toMatch(/update public\.social_reply_restore_log l set reply_id = null, user_id = null where l\.user_id = old\.id;\s+return old;/);
    expect(sql).toMatch(/drop trigger if exists on_auth_user_deleted_forget_social_restores on auth\.users;\s+create trigger on_auth_user_deleted_forget_social_restores after delete on auth\.users\s+for each row execute function public\.forget_social_restores_on_delete\(\);/);
    // The trigger that ends the consents on deletion is left as it is.
    expect(sql).not.toMatch(/trigger (if exists )?on_auth_user_deleted on/);
    // No foreign key from the log: its rows must outlive the account.
    expect(sql.match(/create table if not exists public\.social_reply_restore_log \(([\s\S]*?)\n\);/)![1]).not.toMatch(/references/);
  });

  it("after the close only a restore by hand goes on, and only for a reply written before the close", () => {
    const back = fn("put_back_social_reply");
    expect(back).toMatch(/if closes is null or p_origin <> 'hand' then result := 'closed'; exit work; end if;\s+if back\.replied_at >= closes then result := 'after_close'; exit work; end if;\s+if back\.held_at is not null and closes <= now\(\) - interval '7 days' then result := 'expired'; exit work; end if;/);
    // Those checks come before anything is changed.
    expect(back.indexOf("result := 'after_close'")).toBeLessThan(back.indexOf("update public.social_votes"));
  });

  it("the close rule can't be talked past: the pass is a row no API role can write, not a session setting", () => {
    expect(sql).not.toMatch(/set_config|current_setting/);
    expect(sql).toMatch(/alter table public\.call_restore_pass enable row level security;/);
    expect(sql).toMatch(/revoke all on public\.call_restore_pass from public, anon, authenticated, service_role;/);
    expect(sql).not.toMatch(/grant [^;]*call_restore_pass/);
    // Only the internal restore function writes a pass, only after the close, and it deletes it in the same transaction.
    expect(sql.match(/insert into public\.call_restore_pass/g)).toHaveLength(1);
    const back = fn("put_back_social_reply");
    expect(back).toMatch(/if closed then\s+insert into public\.call_restore_pass \(user_id, slug, probability, source, made_at\)\s+values \(back\.user_id, back\.slug, back\.probability, back\.platform, back\.replied_at\);\s+end if;/);
    expect(back.indexOf("insert into public.call_restore_pass")).toBeLessThan(back.indexOf("insert into public.calls"));
    expect(back.indexOf("insert into public.calls")).toBeLessThan(back.indexOf("delete from public.call_restore_pass p where p.user_id = back.user_id and p.slug = back.slug;"));
    expect(back.indexOf("delete from public.call_restore_pass")).toBeGreaterThan(0);
  });

  it("the calls trigger keeps both of its rules, and lets through only the exact write a pass of this transaction names", () => {
    const rules = fn("enforce_call_rules");
    expect(rules).toMatch(/returns trigger\s+language plpgsql security definer set search_path = ''/);
    expect(rules).toMatch(/where p\.user_id = new\.user_id and p\.slug = new\.slug\s+and p\.probability = new\.probability and p\.source = new\.source\s+and p\.txid = pg_current_xact_id\(\) and p\.made_at < closes;/);
    // The restored call carries the time it was made, so anything that reads calls by time sees a call made in time.
    expect(rules).toMatch(/if found then\s+new\.updated_at := made;\s+if tg_op = 'insert' then\s+new\.created_at := made;\s+end if;\s+return new;\s+end if;/);
    // The original rules, word for word, as in 20261111000200_call_rules.sql.
    const older = readFileSync(join(dir, "20261111000200_call_rules.sql"), "utf8").replace(/--[^\n]*/g, "").toLowerCase();
    const tail = (text: string) => text.slice(text.indexOf("if closes is null or now() >= closes then")).replace(/\s+/g, " ");
    expect(tail(rules)).toBe(tail(older.match(/create or replace function public\.enforce_call_rules\(\)[\s\S]*?\$\$[\s\S]*?\$\$;/)![0]));
    expect(rules).not.toMatch(/session_user|current_user/);
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
