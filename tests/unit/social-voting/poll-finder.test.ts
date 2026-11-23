import { describe, expect, it } from "vitest";
import { sampleQuestions } from "@/content/sample-questions";
import { socialPollSchema } from "@/lib/social";
import { matchOwnPolls, ownHostsFrom, questionFromLink } from "@/lib/social-voting/discover";
import { pollFromRead } from "@/lib/social-voting/poll-reads";
import { POLL_SCAN_SIZE, XProvider, X_READ_COST_MICROS } from "@/lib/social-voting/providers/x";
import { SpendCap } from "@/lib/social-voting/spend";
import { fakeFetch, MemorySpend, NOW } from "./helpers";

const SITE = new Set(["consensa-omega.vercel.app"]);
const open = sampleQuestions.find((q) => q.slug === "boc-cut-dec-2026")!;

const timeline = {
  data: [
    { id: "1990000000000000101", attachments: { poll_ids: ["p1"] }, entities: { urls: [{ expanded_url: `https://consensa-omega.vercel.app/en/q/${open.slug}` }] } },
    { id: "1990000000000000102", attachments: { poll_ids: ["p2"] }, entities: { urls: [] } },
    { id: "1990000000000000103", attachments: { poll_ids: ["p3"] } },
    { id: "1990000000000000104" },
  ],
  includes: {
    polls: [
      { id: "p1", options: [{ label: "Yes", votes: 120 }, { label: "No", votes: 80 }], end_datetime: "2026-11-20T14:00:00.000Z" },
      { id: "p2", options: [{ label: "Oui", votes: 5 }, { label: "Non", votes: 5 }] },
      { id: "p3", options: [{ label: "Cut", votes: 1 }, { label: "Hold", votes: 2 }] },
    ],
  },
};
const routes = (): Array<[RegExp, unknown]> => [
  [/users\/by\/username\/CANsensus$/, { data: { id: "777" } }],
  [/users\/777\/tweets\?/, timeline],
];

describe("finding the polls zack posts on @CANsensus", () => {
  it("reads only our own account and keeps two-way YES/NO polls with their links", async () => {
    const { fetch, calls } = fakeFetch(routes());
    const found = await new XProvider({ bearer: "b", spend: new SpendCap(new MemorySpend(), "x", 5_000_000), fetch }).findOwnPolls("CANsensus", NOW);
    expect(found).toEqual([
      { postId: "1990000000000000101", poll: { yes: 120, no: 80 }, endsAt: "2026-11-20T14:00:00.000Z", links: [`https://consensa-omega.vercel.app/en/q/${open.slug}`] },
      { postId: "1990000000000000102", poll: { yes: 5, no: 5 }, endsAt: null, links: [] },
    ]);
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(["/2/users/by/username/CANsensus", "/2/users/777/tweets"]);
    const q = new URL(calls[1]!.url).searchParams;
    expect(q.get("exclude")).toBe("replies,retweets");
    expect(q.get("max_results")).toBe(String(POLL_SCAN_SIZE));
  });

  it("pays for what it read, and nothing when the cap is used up or X fails", async () => {
    const spend = new MemorySpend();
    const { fetch } = fakeFetch(routes());
    await new XProvider({ bearer: "b", spend: new SpendCap(spend, "x", 5_000_000), fetch }).findOwnPolls("CANsensus", NOW);
    // One account lookup plus the four posts X returned.
    expect([...spend.totals.values()]).toEqual([5 * X_READ_COST_MICROS]);

    const none = fakeFetch(routes());
    expect(await new XProvider({ bearer: "b", spend: new SpendCap(new MemorySpend(), "x", 0), fetch: none.fetch }).findOwnPolls("CANsensus", NOW)).toEqual([]);
    expect(none.calls).toEqual([]);

    const down = new MemorySpend();
    const failing = fakeFetch([[/users\/by\/username/, { data: { id: "777" } }]]);
    expect(await new XProvider({ bearer: "b", spend: new SpendCap(down, "x", 5_000_000), fetch: failing.fetch }).findOwnPolls("CANsensus", NOW)).toEqual([]);
    expect([...down.totals.values()]).toEqual([X_READ_COST_MICROS]); // the lookup worked; the failed timeline read was handed back
  });

  it("refuses a handle that isn't one", async () => {
    const { fetch, calls } = fakeFetch(routes());
    expect(await new XProvider({ bearer: "b", spend: new SpendCap(new MemorySpend(), "x", 5_000_000), fetch }).findOwnPolls("../admin", NOW)).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe("tying a found poll to a question", () => {
  it("reads only https question links on our own hosts", () => {
    expect(questionFromLink(`https://consensa-omega.vercel.app/fr/q/${open.slug}?utm=x`, SITE)).toEqual({ locale: "fr", slug: open.slug });
    for (const bad of [
      `http://consensa-omega.vercel.app/en/q/${open.slug}`,
      `https://evil.ca/en/q/${open.slug}`,
      `https://consensa-omega.vercel.app.evil.ca/en/q/${open.slug}`,
      `https://consensa-omega.vercel.app:8443/en/q/${open.slug}`,
      `https://consensa-omega.vercel.app/de/q/${open.slug}`,
      "https://consensa-omega.vercel.app/en/board",
      "not a link",
    ]) expect(questionFromLink(bad, SITE), bad).toBeNull();
  });

  it("keeps polls on open questions only, one question per post", () => {
    const base = { poll: { yes: 3, no: 1 }, endsAt: null };
    const matched = matchOwnPolls(
      [
        { ...base, postId: "1", links: [`https://consensa-omega.vercel.app/en/q/${open.slug}`] },
        { ...base, postId: "2", links: ["https://consensa-omega.vercel.app/en/q/no-such-question"] },
        { ...base, postId: "3", links: [`https://consensa-omega.vercel.app/en/q/${open.slug}`, "https://consensa-omega.vercel.app/en/q/giller-debut-2026"] },
        { ...base, postId: "4", links: [] },
      ],
      sampleQuestions,
      SITE,
      NOW,
    );
    expect(matched.map((m) => [m.postId, m.slug, m.locale, m.platform])).toEqual([["1", open.slug, "en", "x"]]);
  });

  it("knows our hosts from the site settings, never localhost", () => {
    expect([...ownHostsFrom(["https://cansensus.ca", "consensa-omega.vercel.app", undefined, "http://localhost:3000", "::"])]).toEqual(["cansensus.ca", "consensa-omega.vercel.app"]);
  });
});

describe("a saved X poll on the question page", () => {
  const row = { platform: "x" as const, post_id: "1990000000000000101", poll_yes: 120, poll_no: 80, poll_read_at: "2026-11-21T15:00:00Z" };

  it("links our own post, dated by its end once it has ended, by the last read while it runs", () => {
    const ended = pollFromRead({ ...row, poll_ends_at: "2026-11-20T14:00:00Z" });
    expect(ended).toMatchObject({ platform: "x", yes: 120, no: 80, closedAt: "2026-11-20T14:00:00.000Z", endsAt: "2026-11-20T14:00:00.000Z", url: "https://x.com/CANsensus/status/1990000000000000101" });
    expect(socialPollSchema.safeParse(ended).success).toBe(true);
    expect(pollFromRead({ ...row, poll_ends_at: "2026-11-25T14:00:00Z" })?.closedAt).toBe("2026-11-21T15:00:00.000Z");
    expect(pollFromRead({ ...row, poll_ends_at: null })?.endsAt).toBeUndefined();
  });

  it("shows nothing for a poll with no votes yet", () => {
    expect(pollFromRead({ ...row, poll_yes: 0, poll_no: 0 })).toBeNull();
  });
});
