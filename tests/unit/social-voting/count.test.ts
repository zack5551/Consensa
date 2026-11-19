import { describe, expect, it, vi } from "vitest";
import { sampleQuestions } from "@/content/sample-questions";
import { countSocialReplies, officialPosts, type CountOptions } from "@/lib/social-voting/count";
import { XProvider } from "@/lib/social-voting/providers/x";
import { SpendCap } from "@/lib/social-voting/spend";
import type { ParsedReply, SocialProvider } from "@/lib/social-voting/types";
import { fakeFetch, fixture, MemorySpend, MemoryStore, NOW, OUR_POST, post } from "./helpers";

const xFixtures = (): Array<[RegExp, unknown]> => [
  [/search\/recent.*next_token=page2token/, fixture("x-replies-page2.json")],
  [/search\/recent/, fixture("x-replies-page1.json")],
  [/tweets\/1980000000000000000\?expansions/, fixture("x-poll.json")],
  [/tweets\?ids=/, fixture("x-lookup.json")],
  [/\/2\/tweets$/, { data: { id: "1990000000000000099" } }],
];

function setup(extra: Partial<CountOptions> = {}) {
  const net = fakeFetch(xFixtures());
  const x = new XProvider({ bearer: "app-bearer", spend: new SpendCap(new MemorySpend(), "x", 50_000_000), fetch: net.fetch, replyToken: "official-account-token" });
  const store = new MemoryStore().link("x", "111", "user-a").link("x", "222", "user-b");
  const run = () => countSocialReplies({ posts: [post], providers: { x }, store, now: NOW, wait: async () => undefined, ...extra });
  return { net, store, run };
}

describe("counting replies from linked accounts", () => {
  it("counts one call per linked person, latest reply wins, and drops everyone else before storing", async () => {
    const { store, run } = setup();
    const report = await run();
    expect(report).toMatchObject({ posts: 1, repliesRead: 4, unlinkedDropped: 1, outcomes: { counted: 2 }, pollsRead: 1, incomplete: 0, autoReplies: 0 });
    // user-a replied YES then NO: only the newest is handed on. user-b said NO.
    expect([...store.calls.entries()]).toEqual([
      ["user-b:boc-cut-dec-2026", { probability: 25, source: "x" }],
      ["user-a:boc-cut-dec-2026", { probability: 25, source: "x" }],
    ]);
    expect(store.ledger.map((l) => l.replyId)).toEqual(["1990000000000000002", "1990000000000000007"]);
    expect(store.reads.get(`x:${OUR_POST}`)).toEqual({ poll: { yes: 412, no: 655 }, readThrough: new Date("2026-11-18T16:00:00.000Z") });
    expect(store.windows.get("boc-cut-dec-2026")).toBe("2026-12-09T14:45:00Z");
  });

  it("privacy: nothing given to the store holds a token, a username, reply text or an unlinked author's id", async () => {
    const { store, run } = setup();
    await run();
    const everything = JSON.stringify({ written: store.written, ledger: store.ledger, calls: [...store.calls], reads: [...store.reads] });
    expect(everything).not.toMatch(/app-bearer|official-account-token|Bearer/);
    expect(everything).not.toMatch(/maple_reader|Maple Reader|username|"text"|probably|@Cansensa/);
    expect(everything).not.toContain('"999"'); // the unlinked author
    expect(everything).not.toMatch(/"(333|444|555)"/); // unclear, indirect and malformed replies never got this far
    // What a counted reply carries, and nothing more.
    const counted = store.written.filter((w) => typeof w === "object" && w !== null && "replyId" in w);
    for (const row of counted) expect(Object.keys(row as object).sort()).toEqual(["at", "authorId", "platform", "postId", "probability", "replyId", "slug"]);
  });

  it("the report is counts only", async () => {
    const report = await setup().run();
    expect(JSON.stringify(report)).not.toMatch(/\d{3,}/);
  });

  it("is idempotent: a second run over the same replies changes nothing", async () => {
    const { store, run } = setup();
    await run();
    const before = JSON.stringify({ ledger: store.ledger, calls: [...store.calls] });
    store.reads.clear(); // even if the reader lost its place and read everything again
    const again = await run();
    expect(again.outcomes).toEqual({ duplicate: 2 });
    expect(JSON.stringify({ ledger: store.ledger, calls: [...store.calls] })).toBe(before);
  });

  it("a call made on the site wins over a reply", async () => {
    const { store, run } = setup();
    store.calls.set("user-b:boc-cut-dec-2026", { probability: 70, source: "web" });
    const report = await run();
    expect(report.outcomes).toEqual({ website_wins: 1, counted: 1 });
    expect(store.calls.get("user-b:boc-cut-dec-2026")).toEqual({ probability: 70, source: "web" });
  });

  it("waits out the database's 2-second rule once, and keeps its place if a reply still can't be saved", async () => {
    const first = setup();
    first.store.retryOnce.add("1990000000000000002");
    const wait = vi.fn(async () => undefined);
    const report = await setup({ store: first.store, wait }).run();
    expect(wait).toHaveBeenCalledTimes(1);
    expect(report).toMatchObject({ outcomes: { counted: 2 }, incomplete: 0 });

    const stuck = setup();
    const always: SocialProvider = { platform: "x", readPollTotals: async () => null, readReplies: async () => ({ complete: true, replies: [{ replyId: "1", authorId: "111", vote: "yes", at: "2026-11-18T14:00:00.000Z" }] }) };
    stuck.store.countReply = async () => "retry";
    const waited = vi.fn(async () => undefined);
    const r = await countSocialReplies({ posts: [post], providers: { x: always }, store: stuck.store, now: NOW, wait: waited });
    expect(waited).toHaveBeenCalledWith(2_100);
    expect(r).toMatchObject({ outcomes: { retry: 1 }, incomplete: 1 });
    expect(stuck.store.reads.get(`x:${OUR_POST}`)?.readThrough).toBeUndefined();
  });

  it("reads nothing (and pays nothing) for a platform where nobody is linked", async () => {
    const net = fakeFetch(xFixtures());
    const x = new XProvider({ bearer: "b", spend: new SpendCap(new MemorySpend(), "x", 50_000_000), fetch: net.fetch });
    const report = await countSocialReplies({ posts: [post], providers: { x }, store: new MemoryStore(), now: NOW });
    expect(net.calls.filter((c) => c.url.includes("search/recent"))).toHaveLength(0);
    expect(report).toMatchObject({ repliesRead: 0, pollsRead: 1 });
  });

  it("an incomplete read (spend cap) counts what it got but doesn't move the reader's place", async () => {
    const replies: ParsedReply[] = [{ replyId: "1990000000000000002", authorId: "222", vote: "no", at: "2026-11-18T14:05:00.000Z" }];
    const capped: SocialProvider = { platform: "x", readPollTotals: async () => null, readReplies: async () => ({ replies, complete: false }) };
    const store = new MemoryStore().link("x", "222", "user-b");
    const report = await countSocialReplies({ posts: [post], providers: { x: capped }, store, now: NOW });
    expect(report).toMatchObject({ outcomes: { counted: 1 }, incomplete: 1 });
    expect(store.reads.has(`x:${OUR_POST}`)).toBe(false);
  });

  it("removes a deleted reply from the ledger on the weekly sweep, and only then", async () => {
    const { store, run } = setup();
    await run();
    expect(store.ledger).toHaveLength(2);
    const swept = await setup({ sweepDeleted: true, store } as Partial<CountOptions>).run();
    expect(swept.removed).toBe(1);
    expect(store.ledger.map((l) => l.replyId)).toEqual(["1990000000000000002"]);
  });

  it("reports how many stale links the monthly re-check paused, and one failing post doesn't stop the next", async () => {
    const store = new MemoryStore().link("x", "222", "user-b");
    store.paused = 3;
    const broken: SocialProvider = { platform: "facebook", readPollTotals: async () => Promise.reject(new Error("down")), readReplies: async () => ({ replies: [], complete: true }) };
    const { net } = setup();
    const x = new XProvider({ bearer: "b", spend: new SpendCap(new MemorySpend(), "x", 50_000_000), fetch: net.fetch });
    const report = await countSocialReplies({ posts: [{ ...post, platform: "facebook", postId: "5001" }, post], providers: { facebook: broken, x }, store, now: NOW });
    expect(report).toMatchObject({ paused: 3, posts: 2, incomplete: 1, outcomes: { counted: 1 } });
  });
});

describe("the auto-reply (off unless SOCIAL_AUTO_REPLY is on)", () => {
  const text = { en: "To have your call count in “Canada says”, link your account: https://cansensa.test/en/account/social", fr: "FR" };

  it("is never sent without its own config", async () => {
    const { net, run } = setup();
    await run();
    expect(net.calls.filter((c) => c.init?.method === "POST")).toHaveLength(0);
  });

  it("sends one public reply per unlinked account per post, only to people who replied to our post", async () => {
    const { net, store, run } = setup({ autoReply: { text, maxPerCycle: 50 } });
    const first = await run();
    expect(first.autoReplies).toBe(1);
    const posts = net.calls.filter((c) => c.init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]!.url).toBe("https://api.x.com/2/tweets");
    expect(JSON.parse(String(posts[0]!.init?.body))).toEqual({ text: text.en, reply: { in_reply_to_tweet_id: "1990000000000000006" } });
    expect((posts[0]!.init?.headers as Record<string, string>).Authorization).toBe("Bearer official-account-token");
    // A second cycle reads the same replies again: nobody gets a second reply.
    store.reads.clear();
    expect((await run()).autoReplies).toBe(0);
    expect(net.calls.filter((c) => c.init?.method === "POST")).toHaveLength(1);
    // Linked people never get one.
    expect(store.autoReplied.size).toBe(1);
  });

  it("respects the per-cycle ceiling", async () => {
    const many: ParsedReply[] = Array.from({ length: 8 }, (_, i) => ({ replyId: `90${i}`, authorId: `70${i}`, vote: "yes", at: `2026-11-18T14:0${i}:00.000Z` }));
    const posted: string[] = [];
    const provider: SocialProvider = { platform: "x", readPollTotals: async () => null, readReplies: async () => ({ replies: many, complete: true }), postReply: async (id) => (posted.push(id), true) };
    const report = await countSocialReplies({ posts: [post], providers: { x: provider }, store: new MemoryStore(), now: NOW, autoReply: { text, maxPerCycle: 3 } });
    expect(report.autoReplies).toBe(3);
    expect(posted).toHaveLength(3);
  });
});

describe("official posts come from content only", () => {
  const base = sampleQuestions.find((q) => q.slug === "boc-cut-dec-2026")!;

  it("no sample question lists a post yet, so nothing would be read", () => {
    expect(officialPosts(sampleQuestions, NOW)).toEqual([]);
  });

  it("lists valid posts of open questions and skips the rest", () => {
    const withPosts = { ...base, socialPosts: [{ platform: "x", postId: OUR_POST, locale: "en" }, { platform: "x", postId: "not an id", locale: "en" }, { platform: "myspace", postId: "1", locale: "en" }] };
    expect(officialPosts([withPosts], NOW)).toEqual([{ platform: "x", postId: OUR_POST, locale: "en", slug: base.slug, closesAt: "2026-12-09T14:45:00Z" }]);
    expect(officialPosts([withPosts], new Date("2026-12-10T00:00:00Z"))).toEqual([]); // closed: not read any more
  });
});
