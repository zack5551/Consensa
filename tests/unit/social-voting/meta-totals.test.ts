/**
 * Facebook reactions, Threads and Instagram polls, and Instagram YES/NO comments on our own posts (zack, 2026-11-21).
 * Fixtures only: nothing here calls Meta.
 */
import { describe, expect, it } from "vitest";
import { sampleQuestions } from "@/content/sample-questions";
import { socialPollSchema } from "@/lib/social";
import { matchOwnPosts } from "@/lib/social-voting/discover";
import { pollFromRead } from "@/lib/social-voting/poll-reads";
import en from "@/i18n/dictionaries/en";
import fr from "@/i18n/dictionaries/fr";
import { asksForVotes, linksIn, MetaProvider, metaPoll, ownPostUrl, REACTION_VOTES } from "@/lib/social-voting/providers/meta";
import { fakeFetch, NOW } from "./helpers";

const SITE = new Set(["consensa-omega.vercel.app"]);
const open = sampleQuestions.find((q) => q.slug === "boc-cut-dec-2026")!;
const link = `https://consensa-omega.vercel.app/fr/q/${open.slug}`;
const recent = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "+0000");
const old = new Date(NOW.getTime() - 9 * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "+0000");
const poll = (a: string, b: string, share: number, total: number) => ({
  option_a: a,
  option_b: b,
  option_a_votes_percentage: share,
  option_b_votes_percentage: 1 - share,
  total_votes: total,
  expiration_timestamp: "2026-11-22T15:00:00+0000",
});

describe("Meta totals for the question page", () => {
  it("counts Facebook reactions and vote comments, one per person, the token in a header only (zack, 2026-11-23)", async () => {
    const reactions = {
      data: [
        { id: "1", type: "LIKE", name: "A" }, // 👍 only: yes
        { id: "2", type: "WOW" }, // 😮 only: no
        { id: "3", type: "LIKE" }, // 👍, then comments ❌: the comment wins, no
        { id: "4", type: "LIKE" }, // 👍 and ✅ YES: counted once, yes
        { id: "5", type: "SAD" }, // not a vote reaction
        { id: "6", type: "LOVE" }, // not a vote reaction
      ],
    };
    const comments = {
      data: [
        { from: { id: "3", name: "C" }, message: "❌", created_time: "2026-11-21T10:00:00+0000" },
        { from: { id: "4" }, message: "✅ YES", created_time: "2026-11-21T10:00:00+0000" },
        { from: { id: "7" }, message: "OUI", created_time: "2026-11-21T10:00:00+0000" }, // comment only: yes
        { from: { id: "7" }, message: "great question", created_time: "2026-11-21T12:00:00+0000" }, // not a vote, earlier vote stands
        { from: { id: "8" }, message: "yes", created_time: "2026-11-21T10:00:00+0000" },
        { from: { id: "8" }, message: "❌ non", created_time: "2026-11-21T11:00:00+0000" }, // changed their mind: no
        { from: { id: "9" }, message: "✅ NO", created_time: "2026-11-21T10:00:00+0000" }, // unclear: ignored
        { message: "great post", created_time: "2026-11-21T10:00:00+0000" }, // no author id, but not a vote: no effect
      ],
    };
    const { fetch, calls } = fakeFetch([
      [/graph\.facebook\.com\/111_222\/reactions\?/, reactions],
      [/graph\.facebook\.com\/111_222\/comments\?/, comments],
    ]);
    const fb = new MetaProvider({ platform: "facebook", accessToken: "page-token", fetch });
    const totals = await fb.readPollTotals("111_222");
    // yes: 1, 4, 7 · no: 2, 3, 8
    expect(totals).toEqual({ yes: 3, no: 3, source: "reactions" });
    expect(JSON.stringify(totals)).not.toMatch(/name|"A"|"C"/);
    expect(calls[0]!.url).toContain("fields=id%2Ctype");
    expect(calls[1]!.url).toContain("fields=from%7Bid%7D%2Cmessage%2Ccreated_time");
    for (const c of calls) expect(c.url).not.toContain("page-token");
    expect(REACTION_VOTES).toEqual({ yes: "LIKE", no: "WOW" });
  });

  it("shows no Facebook total when Meta hides who voted, rather than a total that is too low (AEGIS)", async () => {
    const ok = { data: [{ id: "1", type: "LIKE" }] };
    const cases = [
      { reactions: { data: [{ id: "1", type: "LIKE" }, { type: "WOW" }] }, comments: { data: [] } },
      { reactions: ok, comments: { data: [{ message: "❌", created_time: "2026-11-21T10:00:00+0000" }] } },
    ];
    for (const c of cases) {
      const { fetch } = fakeFetch([
        [/\/reactions\?/, c.reactions],
        [/\/comments\?/, c.comments],
      ]);
      expect(await new MetaProvider({ platform: "facebook", accessToken: "t", fetch }).readPollTotals("111_222")).toBeNull();
    }
    // A hidden id on a reaction that isn't a vote changes nothing.
    const { fetch } = fakeFetch([
      [/\/reactions\?/, { data: [{ id: "1", type: "LIKE" }, { type: "LOVE" }] }],
      [/\/comments\?/, { data: [] }],
    ]);
    expect(await new MetaProvider({ platform: "facebook", accessToken: "t", fetch }).readPollTotals("111_222")).toEqual({ yes: 1, no: 0, source: "reactions" });
  });

  it("shows no Facebook total when either the reactions or the comments can't be read in full", async () => {
    const ok = { data: [{ id: "1", type: "LIKE" }] };
    for (const failing of [/\/reactions\?/, /\/comments\?/]) {
      const { fetch } = fakeFetch([
        [failing, { error: "no" }, 500],
        [/\/(?:reactions|comments)\?/, ok],
      ]);
      expect(await new MetaProvider({ platform: "facebook", accessToken: "t", fetch }).readPollTotals("111_222")).toBeNull();
    }
    const endless = { data: [{ id: "1", type: "LIKE" }], paging: { cursors: { after: "c" }, next: "https://graph.facebook.com/next" } };
    const { fetch } = fakeFetch([[/\/reactions\?/, endless]]);
    expect(await new MetaProvider({ platform: "facebook", accessToken: "t", fetch }).readPollTotals("111_222")).toBeNull();
  });

  it("reads a Threads or Instagram YES/NO poll from Meta's shares, and leaves any other poll alone", async () => {
    expect(metaPoll(poll("Oui", "Non", 0.6, 502))).toEqual({ yes: 301, no: 201 });
    expect(metaPoll(poll("No", "Yes", 0.25, 100))).toEqual({ yes: 75, no: 25 });
    expect(metaPoll(poll("Cut", "Hold", 0.5, 10))).toBeNull();
    expect(metaPoll({ ...poll("Yes", "No", 0.5, 10), option_c: "Maybe" })).toBeNull();
    const { fetch } = fakeFetch([[/graph\.threads\.net\/18001\?fields=poll_attachment/, { poll_attachment: poll("Yes", "No", 0.61, 502) }]]);
    expect(await new MetaProvider({ platform: "threads", accessToken: "t", fetch }).readPollTotals("18001")).toEqual({ yes: 306, no: 196 });
  });

  it("counts Instagram YES/NO comments without a poll, each account's latest one, and hands on only the totals", async () => {
    const comments = {
      data: [
        { text: "YES", timestamp: "2026-11-21T10:00:00+0000", from: { id: "1", username: "a" } },
        { text: "NO", timestamp: "2026-11-21T11:00:00+0000", from: { id: "1", username: "a" } },
        { text: "Oui!", timestamp: "2026-11-21T10:30:00+0000", from: { id: "2", username: "b" } },
        { text: "great question", timestamp: "2026-11-21T10:30:00+0000", from: { id: "3", username: "c" } },
        { text: "yes", timestamp: "2026-11-21T10:30:00+0000" },
      ],
    };
    const { fetch, calls } = fakeFetch([
      [/graph\.facebook\.com\/17890\?fields=poll_attachment/, { poll_attachment: null }],
      [/graph\.facebook\.com\/17890\/comments\?/, comments],
    ]);
    const totals = await new MetaProvider({ platform: "instagram", accessToken: "t", fetch }).readPollTotals("17890");
    expect(totals).toEqual({ yes: 1, no: 1, source: "comments" });
    expect(JSON.stringify(totals)).not.toMatch(/username|"a"|"b"/);
    expect(calls[1]!.url).toContain("fields=text%2Ctimestamp%2Cfrom");
  });

  it("shows nothing when Meta refuses, rather than a partial count", async () => {
    const { fetch } = fakeFetch([[/./, { error: "no" }, 500]]);
    for (const platform of ["facebook", "instagram", "threads"] as const) {
      expect(await new MetaProvider({ platform, accessToken: "t", fetch }).readPollTotals("17890")).toBeNull();
      expect(await new MetaProvider({ platform, accessToken: "t", fetch, accountId: "42" }).findOwnPosts(NOW)).toEqual([]);
    }
  });

  it("finds our own recent posts, their links and our own address, and ties them to an open question", async () => {
    const { fetch, calls } = fakeFetch([
      [
        /graph\.threads\.net\/me\/threads\?/,
        {
          data: [
            { id: "18001", text: `Will it? Votez ci-dessous : ${link}.`, permalink: "https://www.threads.com/@cansensus/post/AbC_1", timestamp: recent, poll_attachment: poll("Oui", "Non", 0.5, 10) },
            { id: "18002", text: `Old ${link}`, permalink: "https://www.threads.com/@cansensus/post/Old", timestamp: old },
          ],
        },
      ],
    ]);
    const found = await new MetaProvider({ platform: "threads", accessToken: "t", fetch }).findOwnPosts(NOW);
    expect(found).toEqual([{ postId: "18001", links: [link], url: "https://www.threads.com/@cansensus/post/AbC_1", poll: { yes: 5, no: 5 }, endsAt: "2026-11-22T15:00:00.000Z", asksVote: false }]);
    expect(calls[0]!.url).toContain("since=");
    const matched = matchOwnPosts("threads", found, sampleQuestions, SITE, NOW);
    expect(matched.map((m) => m.post)).toEqual([{ platform: "threads", postId: "18001", slug: open.slug, locale: "fr", closesAt: expect.any(String) }]);
  });

  it("reads Instagram posts only from our own account id", async () => {
    const { fetch, calls } = fakeFetch([[/graph\.facebook\.com\/42\/media\?/, { data: [{ id: "17890", caption: link, permalink: "https://www.instagram.com/p/XyZ/", timestamp: recent }] }]]);
    expect(await new MetaProvider({ platform: "instagram", accessToken: "t", fetch }).findOwnPosts(NOW)).toEqual([]);
    expect(calls).toHaveLength(0);
    const found = await new MetaProvider({ platform: "instagram", accessToken: "t", fetch, accountId: "42" }).findOwnPosts(NOW);
    expect(found[0]).toMatchObject({ postId: "17890", url: "https://www.instagram.com/cansensus/p/XyZ/", poll: null, asksVote: false });
  });

  it("reads reactions or comments only on a post that asks for votes, as our own texts do (AEGIS)", () => {
    for (const d of [en, fr]) {
      expect(asksForVotes("facebook", d.social.reactPost)).toBe(true);
      expect(asksForVotes("instagram", d.social.commentPost)).toBe(true);
      expect(asksForVotes("facebook", d.social.pollPostShort)).toBe(false);
      expect(asksForVotes("instagram", d.social.pollPostShort)).toBe(false);
    }
    expect(asksForVotes("facebook", "New question 👍")).toBe(false);
    expect(asksForVotes("instagram", "yes or no?")).toBe(false);
    expect(asksForVotes("threads", en.social.reactPost)).toBe(false);
  });

  it("builds only our own post addresses, and reads links out of plain text", () => {
    expect(ownPostUrl("facebook", "111_222", undefined)).toBe("https://www.facebook.com/cansensus/posts/222");
    expect(ownPostUrl("facebook", "222", undefined)).toBeNull();
    expect(ownPostUrl("instagram", "1", "https://evil.example/p/XyZ/")).toBeNull();
    expect(ownPostUrl("threads", "1", undefined)).toBeNull();
    expect(linksIn(`a ${link}, b (https://x.ca/y) »`)).toEqual([link, "https://x.ca/y"]);
    expect(linksIn("http://plain.ca")).toEqual([]);
  });

  it("turns a saved Meta read into a page poll on our own post, and drops one with no address of ours", () => {
    const row = { platform: "facebook" as const, post_id: "111_222", poll_yes: 940, poll_no: 610, poll_read_at: "2026-11-21T15:00:00Z", poll_source: "reactions" as const, post_url: "https://www.facebook.com/cansensus/posts/222" };
    const p = pollFromRead(row);
    expect(p).toMatchObject({ platform: "facebook", source: "reactions", url: row.post_url });
    expect(socialPollSchema.safeParse(p).success).toBe(true);
    expect(pollFromRead({ ...row, post_url: null })).toBeNull();
    expect(pollFromRead({ ...row, post_url: "https://www.facebook.com/someoneelse/posts/1" })).toBeNull();
    expect(pollFromRead({ ...row, platform: "threads", poll_source: "poll", post_url: "https://www.threads.com/@cansensus/post/AbC" })?.source).toBeUndefined();
  });
});
