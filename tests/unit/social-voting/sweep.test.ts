import { beforeEach, describe, expect, it, vi } from "vitest";
import { countSocialReplies, type OfficialPost } from "@/lib/social-voting/count";
import { XProvider, X_READ_COST_MICROS } from "@/lib/social-voting/providers/x";
import { SpendCap } from "@/lib/social-voting/spend";
import { removalCeiling, SWEEP_BUDGET_SHARE, SWEEP_MAX_REPLIES_PER_RUN, sweepDeletedReplies, type SweepOptions } from "@/lib/social-voting/sweep";
import type { DeletedCheck, SocialProvider } from "@/lib/social-voting/types";
import { fakeFetch, fixture, MemorySpend, MemoryStore, NOW, OUR_POST, post } from "./helpers";

const SLUG = post.slug;
const FIRST = "1990000000000000001"; // user-a's YES, still up
const HIDDEN = "1990000000000000002"; // user-b's NO, behind a protected account
const DELETED = "1990000000000000007"; // user-a's later NO, deleted on X

/** X answering from the fixtures: the lookup reports DELETED as not found and HIDDEN as not authorized. */
function xSetup(capMicros = 50_000_000) {
  const net = fakeFetch([
    [/search\/recent.*next_token=page2token/, fixture("x-replies-page2.json")],
    [/search\/recent/, fixture("x-replies-page1.json")],
    [/tweets\/1980000000000000000\?expansions/, fixture("x-poll.json")],
    [/tweets\?ids=/, fixture("x-lookup.json")],
  ]);
  const spend = new MemorySpend();
  const x = new XProvider({ bearer: "app-bearer", spend: new SpendCap(spend, "x", capMicros), fetch: net.fetch });
  const store = new MemoryStore().link("x", "111", "user-a").link("x", "222", "user-b");
  const count = () => countSocialReplies({ posts: [post], providers: { x }, store, now: NOW, wait: async () => undefined });
  const sweep = (extra: Partial<SweepOptions> = {}) => sweepDeletedReplies({ posts: [post], providers: { x }, store, now: NOW, wait: async () => undefined, ...extra });
  return { net, spend, store, count, sweep };
}

/** A provider that reports the given ids as deleted and records what it was asked. */
function reporting(gone: string[], complete = true, costPerReply = 0) {
  const asked: string[][] = [];
  const shares: Array<number | undefined> = [];
  const provider: SocialProvider = {
    platform: "x",
    readPollTotals: async () => null,
    readReplies: async () => ({ replies: [], complete: true }),
    findDeleted: async (ids, _now, maxSpendMicros): Promise<DeletedCheck> => {
      asked.push([...ids]);
      shares.push(maxSpendMicros);
      return { gone, checked: complete ? ids.length : 0, spentMicros: complete ? ids.length * costPerReply : 0, complete };
    },
  };
  return { provider, asked, shares };
}

/** A store with replies already counted, as count_social_reply() would have left it. */
function counted(rows: Array<{ replyId: string; userId: string; probability: number; at: string; postId?: string; slug?: string }>) {
  const store = new MemoryStore();
  for (const r of rows) {
    const slug = r.slug ?? SLUG;
    store.windows.set(slug, post.closesAt);
    store.ledger.push({ platform: "x", replyId: r.replyId, postId: r.postId ?? OUR_POST, userId: r.userId, slug, probability: r.probability, at: r.at });
  }
  return store;
}

describe("the daily sweep of deleted replies", () => {
  it("a deleted reply stops counting: its call is removed, and a reply that is only hidden stays", async () => {
    const { store, count, sweep } = xSetup();
    await count();
    // user-a's two replies were one call (the later NO); the count kept the latest only.
    expect(store.calls.get(`user-a:${SLUG}`)).toEqual({ probability: 25, source: "x" });
    expect(store.ledger.map((l) => l.replyId).sort()).toEqual([HIDDEN, DELETED]);

    const report = await sweep();
    expect(report).toEqual({ posts: 1, checked: 2, gone: 1, outcomes: { call_removed: 1 }, incomplete: 0, halted: false });
    expect(store.calls.has(`user-a:${SLUG}`)).toBe(false);
    // Soft removal (LEX): the reply is marked withdrawn, not deleted, and no longer backs anything.
    expect(store.live().map((l) => l.replyId)).toEqual([HIDDEN]);
    expect(store.row(DELETED)?.withdrawnAt).toEqual(NOW);
    expect(store.ledger).toHaveLength(2);
    expect(store.calls.get(`user-b:${SLUG}`)).toEqual({ probability: 25, source: "x" });
  });

  it("a deleted reply with a call made on the site keeps the site call", async () => {
    const store = counted([{ replyId: DELETED, userId: "user-a", probability: 25, at: "2026-11-18T16:00:00.000Z" }]);
    store.calls.set(`user-a:${SLUG}`, { probability: 62, source: "web" });
    const report = await sweepDeletedReplies({ posts: [post], providers: { x: reporting([DELETED]).provider }, store, now: NOW });
    expect(report).toMatchObject({ gone: 1, outcomes: { removed: 1 } });
    expect(store.calls.get(`user-a:${SLUG}`)).toEqual({ probability: 62, source: "web" });
    expect(store.live()).toEqual([]); // the reply itself no longer backs anything
    expect(store.row(DELETED)?.withdrawnAt).toEqual(NOW); // kept, marked, for 7 days
  });

  it("falls back to the person's earlier reply when that one is still up, and leaves the call alone when an older reply goes", async () => {
    const rows = [
      { replyId: FIRST, userId: "user-a", probability: 75, at: "2026-11-18T14:00:00.000Z" },
      { replyId: DELETED, userId: "user-a", probability: 25, at: "2026-11-18T16:00:00.000Z" },
    ];
    const newest = counted(rows);
    newest.calls.set(`user-a:${SLUG}`, { probability: 25, source: "x" });
    expect((await sweepDeletedReplies({ posts: [post], providers: { x: reporting([DELETED]).provider }, store: newest, now: NOW })).outcomes).toEqual({ restored: 1 });
    expect(newest.calls.get(`user-a:${SLUG}`)).toEqual({ probability: 75, source: "x" });

    const older = counted(rows);
    older.calls.set(`user-a:${SLUG}`, { probability: 25, source: "x" });
    expect((await sweepDeletedReplies({ posts: [post], providers: { x: reporting([FIRST]).provider }, store: older, now: NOW })).outcomes).toEqual({ removed: 1 });
    expect(older.calls.get(`user-a:${SLUG}`)).toEqual({ probability: 25, source: "x" });
  });

  it("changes nothing once the question has closed: the call is part of the record", async () => {
    const store = counted([{ replyId: DELETED, userId: "user-a", probability: 25, at: "2026-11-18T16:00:00.000Z" }]);
    store.calls.set(`user-a:${SLUG}`, { probability: 25, source: "x" });
    store.clock = new Date("2026-12-10T00:00:00Z");
    const report = await sweepDeletedReplies({ posts: [post], providers: { x: reporting([DELETED]).provider }, store, now: NOW });
    expect(report.outcomes).toEqual({ closed: 1 });
    expect(store.calls.get(`user-a:${SLUG}`)).toEqual({ probability: 25, source: "x" });
    expect(store.ledger).toHaveLength(1);
  });

  it("never removes a reply it didn't ask about, and a platform with no check is left alone", async () => {
    const store = counted([{ replyId: FIRST, userId: "user-a", probability: 75, at: "2026-11-18T14:00:00.000Z" }]);
    store.ledger.push({ platform: "x", replyId: "777", postId: "1980000000000000555", userId: "user-b", slug: SLUG, probability: 25, at: "2026-11-18T14:00:00.000Z" });
    const report = await sweepDeletedReplies({ posts: [post], providers: { x: reporting(["777", "888"]).provider }, store, now: NOW });
    expect(report).toMatchObject({ gone: 0, outcomes: {} });
    expect(store.ledger).toHaveLength(2);

    const noCheck: SocialProvider = { platform: "facebook", readPollTotals: async () => null, readReplies: async () => ({ replies: [], complete: true }) };
    expect(await sweepDeletedReplies({ posts: [{ ...post, platform: "facebook", postId: "5001" }], providers: { facebook: noCheck }, store, now: NOW })).toEqual({ posts: 0, checked: 0, gone: 0, outcomes: {}, incomplete: 0, halted: false });
  });

  it("respects the spend cap: with no room left nothing is asked of X and nothing is removed", async () => {
    // Two counted replies to check, and room left under the cap for one read only.
    const { net, spend, store, sweep } = xSetup(8 * X_READ_COST_MICROS);
    store.windows.set(SLUG, post.closesAt);
    store.ledger.push({ platform: "x", replyId: HIDDEN, postId: OUR_POST, userId: "user-b", slug: SLUG, probability: 25, at: "2026-11-18T14:05:00.000Z" });
    store.ledger.push({ platform: "x", replyId: DELETED, postId: OUR_POST, userId: "user-a", slug: SLUG, probability: 25, at: "2026-11-18T16:00:00.000Z" });
    store.calls.set(`user-a:${SLUG}`, { probability: 25, source: "x" });
    spend.totals.set("x:2026-11-01", 7 * X_READ_COST_MICROS);

    const report = await sweep();
    expect(report).toEqual({ posts: 1, checked: 0, gone: 0, outcomes: {}, incomplete: 1, halted: false });
    expect(net.calls).toHaveLength(0);
    expect(spend.totals.get("x:2026-11-01")).toBe(7 * X_READ_COST_MICROS);
    expect(store.ledger).toHaveLength(2);
    expect(store.calls.get(`user-a:${SLUG}`)).toEqual({ probability: 25, source: "x" });
  });

  it("pays from the same counter as every other read, and only for replies X returned", async () => {
    const { spend, count, sweep } = xSetup();
    await count();
    const before = spend.totals.get("x:2026-11-01") ?? 0;
    await sweep();
    // Two ids asked; the lookup fixture returns one post, so one read is kept.
    expect((spend.totals.get("x:2026-11-01") ?? 0) - before).toBe(X_READ_COST_MICROS);
  });

  it("with no cap set, the sweep makes no request at all", async () => {
    const { net, store, sweep } = xSetup(0);
    store.windows.set(SLUG, post.closesAt);
    store.ledger.push({ platform: "x", replyId: DELETED, postId: OUR_POST, userId: "user-a", slug: SLUG, probability: 25, at: "2026-11-18T16:00:00.000Z" });
    expect(await sweep()).toMatchObject({ checked: 0, gone: 0, incomplete: 1 });
    expect(net.calls).toHaveLength(0);
    expect(store.ledger).toHaveLength(1);
  });

  it("stops asking a platform once its check stops early, and checks no more than the per-run ceiling", async () => {
    const other: OfficialPost = { ...post, postId: "1980000000000000555", slug: "second-question" };
    const rows = [
      { replyId: "9001", userId: "user-a", probability: 75, at: "2026-11-18T14:00:00.000Z" },
      { replyId: "9002", userId: "user-b", probability: 25, at: "2026-11-18T14:00:00.000Z" },
      { replyId: "9003", userId: "user-a", probability: 75, at: "2026-11-18T14:00:00.000Z", postId: other.postId, slug: other.slug },
    ];
    const stopped = reporting([], false);
    expect(await sweepDeletedReplies({ posts: [post, other], providers: { x: stopped.provider }, store: counted(rows), now: NOW })).toMatchObject({ posts: 2, incomplete: 2 });
    expect(stopped.asked).toHaveLength(1);

    const capped = reporting([]);
    const report = await sweepDeletedReplies({ posts: [post], providers: { x: capped.provider }, store: counted(rows), now: NOW, maxReplies: 1 });
    expect(capped.asked).toEqual([["9001"]]);
    expect(report).toMatchObject({ checked: 1, incomplete: 1 }); // one reply was left for a later day
    expect(SWEEP_MAX_REPLIES_PER_RUN).toBeLessThanOrEqual(5_000);
  });

  it("starts one post further on each day, so a run that can't finish still reaches every post", async () => {
    const other: OfficialPost = { ...post, postId: "1980000000000000555", slug: "second-question" };
    const rows = [
      { replyId: "9001", userId: "user-a", probability: 75, at: "2026-11-18T14:00:00.000Z" },
      { replyId: "9003", userId: "user-a", probability: 75, at: "2026-11-18T14:00:00.000Z", postId: other.postId, slug: other.slug },
    ];
    const firstAsked = async (now: Date) => {
      const { provider, asked } = reporting([]);
      await sweepDeletedReplies({ posts: [post, other], providers: { x: provider }, store: counted(rows), now, maxReplies: 1 });
      return asked[0]![0];
    };
    const today = await firstAsked(NOW);
    const tomorrow = await firstAsked(new Date(NOW.getTime() + 24 * 60 * 60 * 1000));
    expect([today, tomorrow].sort()).toEqual(["9001", "9003"]);
  });

  it("waits out the database's 2-second rule once, and one reply failing doesn't stop the others", async () => {
    const rows = [
      { replyId: "9001", userId: "user-a", probability: 75, at: "2026-11-18T14:00:00.000Z" },
      { replyId: "9002", userId: "user-b", probability: 25, at: "2026-11-18T14:00:00.000Z" },
    ];
    const store = counted(rows);
    store.calls.set(`user-a:${SLUG}`, { probability: 75, source: "x" });
    store.calls.set(`user-b:${SLUG}`, { probability: 25, source: "x" });
    store.removeRetryOnce.add("9002");
    store.removeFails.add("9001");
    const wait = vi.fn(async () => undefined);
    const report = await sweepDeletedReplies({ posts: [post], providers: { x: reporting(["9001", "9002"]).provider }, store, now: NOW, wait });
    expect(wait).toHaveBeenCalledTimes(1);
    expect(report).toMatchObject({ gone: 2, outcomes: { call_removed: 1 }, incomplete: 1 });
    expect(store.calls.has(`user-b:${SLUG}`)).toBe(false);
    expect(store.calls.has(`user-a:${SLUG}`)).toBe(true); // found again tomorrow
  });

  describe("the removal ceiling (AEGIS)", () => {
    /** `total` counted replies, each one person's only reply, of which the platform reports the first `gone` deleted. */
    async function run(total: number, gone: number) {
      const ids = Array.from({ length: total }, (_, i) => String(9_000 + i));
      const store = counted(ids.map((replyId, i) => ({ replyId, userId: `user-${i}`, probability: 75, at: "2026-11-18T14:00:00.000Z" })));
      ids.forEach((_, i) => store.calls.set(`user-${i}:${SLUG}`, { probability: 75, source: "x" }));
      store.written.length = 0;
      const report = await sweepDeletedReplies({ posts: [post], providers: { x: reporting(ids.slice(0, gone)).provider }, store, now: NOW });
      return { report, store };
    }

    it("is max(10, 20% of the replies checked)", () => {
      expect([0, 12, 50, 51, 100, 5_000].map(removalCeiling)).toEqual([10, 10, 10, 10.2, 20, 1_000]);
    });

    it("at the limit the run goes ahead; one over, it withdraws nothing, hides what it found and says halted", async () => {
      const at = await run(100, 20);
      expect(at.report).toMatchObject({ checked: 100, gone: 20, outcomes: { call_removed: 20 }, halted: false });
      expect(at.store.calls.size).toBe(80);

      const over = await run(100, 21);
      expect(over.report).toEqual({ posts: 1, checked: 100, gone: 21, outcomes: {}, incomplete: 0, halted: true, held: 21 });
      // LEX: a halt may not keep a withdrawal counting. The 21 are hidden from the count, and nothing is removed.
      expect(over.store.calls.size).toBe(79);
      expect(over.store.ledger).toHaveLength(100);
      expect(over.store.ledger.filter((l) => l.withdrawnAt)).toEqual([]);
      expect(over.store.ledger.filter((l) => l.heldAt)).toHaveLength(21);
      expect(over.store.written).toHaveLength(21); // one hold each, and nothing else was asked of the database
    });

    it("small runs use the floor of 10: ten of twelve goes ahead, eleven of twelve halts", async () => {
      const at = await run(12, 10);
      expect(at.report).toMatchObject({ gone: 10, outcomes: { call_removed: 10 }, halted: false });
      expect(at.store.calls.size).toBe(2);

      const over = await run(12, 11);
      expect(over.report).toMatchObject({ gone: 11, outcomes: {}, halted: true, held: 11 });
      expect(over.store.calls.size).toBe(1); // the eleven are hidden while a person decides
      expect(over.store.ledger).toHaveLength(12);
    });

    it("counts the whole run, not each post: two posts under the limit alone still halt together", async () => {
      const other: OfficialPost = { ...post, postId: "1980000000000000555", slug: "second-question" };
      const a = Array.from({ length: 6 }, (_, i) => String(9_000 + i));
      const b = Array.from({ length: 6 }, (_, i) => String(9_100 + i));
      const store = counted([
        ...a.map((replyId, i) => ({ replyId, userId: `user-${i}`, probability: 75, at: "2026-11-18T14:00:00.000Z" })),
        ...b.map((replyId, i) => ({ replyId, userId: `user-${i}`, probability: 75, at: "2026-11-18T14:00:00.000Z", postId: other.postId, slug: other.slug })),
      ]);
      const report = await sweepDeletedReplies({ posts: [post, other], providers: { x: reporting([...a, ...b]).provider }, store, now: NOW });
      expect(report).toMatchObject({ checked: 12, gone: 12, outcomes: {}, halted: true, held: 12 });
      expect(store.ledger).toHaveLength(12);
      expect(store.ledger.every((l) => l.heldAt && !l.withdrawnAt)).toBe(true);
    });
  });

  it("budget share: the checks of one run draw on one allowance, and stop when it is used up", async () => {
    const other: OfficialPost = { ...post, postId: "1980000000000000555", slug: "second-question" };
    const rows = [
      { replyId: "9001", userId: "user-a", probability: 75, at: "2026-11-18T14:00:00.000Z" },
      { replyId: "9002", userId: "user-b", probability: 25, at: "2026-11-18T14:00:00.000Z" },
      { replyId: "9003", userId: "user-a", probability: 75, at: "2026-11-18T14:00:00.000Z", postId: other.postId, slug: other.slug },
    ];
    const { provider, shares } = reporting([], true, X_READ_COST_MICROS);
    await sweepDeletedReplies({ posts: [post, other], providers: { x: provider }, store: counted(rows), now: NOW, allowanceMicros: { x: 10 * X_READ_COST_MICROS } });
    // Whichever post went first, the second is handed only what the first left.
    expect(shares[0]).toBe(10 * X_READ_COST_MICROS);
    expect(shares[0]! - shares[1]!).toBeGreaterThanOrEqual(X_READ_COST_MICROS);
    expect(shares[1]).toBeLessThan(10 * X_READ_COST_MICROS);
  });

  it("budget share on X: with room for one read in the allowance, one reply is checked and the rest waits", async () => {
    const { net, spend, store, sweep } = xSetup();
    store.windows.set(SLUG, post.closesAt);
    store.ledger.push({ platform: "x", replyId: FIRST, postId: OUR_POST, userId: "user-a", slug: SLUG, probability: 75, at: "2026-11-18T14:00:00.000Z" });
    store.ledger.push({ platform: "x", replyId: DELETED, postId: OUR_POST, userId: "user-a", slug: SLUG, probability: 25, at: "2026-11-18T16:00:00.000Z" });
    const report = await sweep({ allowanceMicros: { x: X_READ_COST_MICROS } });
    expect(net.calls.map((c) => c.url.split("ids=")[1])).toEqual([FIRST]);
    expect(report).toMatchObject({ checked: 1, gone: 0, incomplete: 1 });
    expect(spend.totals.get("x:2026-11-01")).toBe(X_READ_COST_MICROS);
    expect(await sweep({ allowanceMicros: { x: 0 } })).toMatchObject({ checked: 0, incomplete: 1 });
    expect(net.calls).toHaveLength(1);
  });

  it("privacy: the report is counts only, and the store is handed nothing but a platform and a reply id", async () => {
    const { store, count, sweep } = xSetup();
    await count();
    store.written.length = 0;
    const report = await sweep();
    expect(JSON.stringify(report)).not.toMatch(/\d{6,}|user-/);
    expect(store.written).toEqual([{ platform: "x", replyId: DELETED }]);
  });
});

describe("the sweep in the daily step", () => {
  const SECRET = "s".repeat(40);
  const h = { ops: [] as string[], steps: [] as string[], spent: 0, posts: [] as OfficialPost[], sweepArgs: [] as SweepOptions[], halted: false, sweepFails: false };

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    h.ops.length = 0;
    h.steps.length = 0;
    h.spent = 0;
    h.posts = [];
    h.sweepArgs.length = 0;
    h.halted = false;
    h.sweepFails = false;
    vi.restoreAllMocks();
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/lib/supabase/admin", () => ({
      adminSupabase: () => ({
        from: (table: string) => {
          h.ops.push(table);
          const b: Record<string, unknown> = {};
          b.select = b.eq = () => b;
          b.maybeSingle = async () => ({ data: { spent_micros: h.spent }, error: null });
          return b;
        },
        rpc: async (name: string) => (h.ops.push(name), { data: null, error: null }),
      }),
    }));
    vi.doMock("@/lib/social-voting/sweep", async (original) => ({
      ...(await original<Record<string, unknown>>()),
      sweepDeletedReplies: async (o: SweepOptions) => {
        h.steps.push("sweep");
        h.sweepArgs.push(o);
        if (h.sweepFails) throw new Error("sweep unavailable");
        return { posts: 0, checked: 0, gone: 0, outcomes: {}, incomplete: 0, halted: h.halted };
      },
    }));
    vi.doMock("@/lib/social-voting/count", async (original) => ({
      ...(await original<Record<string, unknown>>()),
      countSocialReplies: async () => (h.steps.push("count"), { posts: 0 }),
      officialPosts: () => h.posts,
    }));
  });

  const keys = { SOCIAL_LINK_SECRET: SECRET, X_BEARER_TOKEN: "b", X_MONTHLY_CAP_USD: "25" };

  it("flag off: no sweep, no count, no request and no database call, whatever keys are set", async () => {
    const outside: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => (outside.push(String(url)), new Response("{}")));
    const { runSocialStep } = await import("@/lib/social-voting/run");
    expect(await runSocialStep(NOW, keys)).toBeNull();
    expect(await runSocialStep(NOW, { ...keys, SOCIAL_VOTING: "0" })).toBeNull();
    expect(h.steps).toEqual([]);
    expect(h.ops).toEqual([]);
    expect(outside).toEqual([]);
  });

  it("flag on: the sweep runs every day of the week, before the count", async () => {
    const { runSocialStep } = await import("@/lib/social-voting/run");
    for (let day = 0; day < 7; day++) {
      const report = await runSocialStep(new Date(NOW.getTime() + day * 24 * 60 * 60 * 1000), { ...keys, SOCIAL_VOTING: "1" });
      expect(report?.sweep).toEqual({ posts: 0, checked: 0, gone: 0, outcomes: {}, incomplete: 0, halted: false });
    }
    expect(h.steps).toEqual(Array.from({ length: 7 }, () => ["sweep", "count"]).flat());
  });

  it("flag on: the sweep is handed half of what is left under X's monthly cap, read from the database", async () => {
    const { runSocialStep } = await import("@/lib/social-voting/run");
    h.posts = [post];
    h.spent = 5_000_000; // US$5 of the US$25 cap used
    await runSocialStep(NOW, { ...keys, SOCIAL_VOTING: "1" });
    expect(SWEEP_BUDGET_SHARE).toBe(0.5);
    expect(h.sweepArgs[0]?.allowanceMicros).toEqual({ x: 10_000_000 });
    // The poll finder asks for its first read before the sweep (refused here), then the sweep's share is read once.
    expect(h.ops).toEqual(["reserve_social_spend", "social_spend"]);

    h.spent = 25_000_000; // cap used up: the sweep gets nothing
    await runSocialStep(NOW, { ...keys, SOCIAL_VOTING: "1" });
    expect(h.sweepArgs[1]?.allowanceMicros).toEqual({ x: 0 });
  });

  it("a halted sweep logs the code social-sweep: halted, and nothing else", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { runSocialStep } = await import("@/lib/social-voting/run");
    h.halted = true;
    const report = await runSocialStep(NOW, { ...keys, SOCIAL_VOTING: "1" });
    expect(report?.sweep?.halted).toBe(true);
    expect(warn.mock.calls).toEqual([["social-sweep: halted"]]);
    expect(h.steps).toEqual(["sweep", "count"]); // the count still runs
  });

  it("a sweep that isn't halted logs nothing, and neither does one that failed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { runSocialStep } = await import("@/lib/social-voting/run");
    await runSocialStep(NOW, { ...keys, SOCIAL_VOTING: "1" });
    h.sweepFails = true;
    expect((await runSocialStep(NOW, { ...keys, SOCIAL_VOTING: "1" }))?.sweep).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
