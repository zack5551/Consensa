import { describe, expect, it } from "vitest";
import { parseVote } from "@/lib/social-voting/parse";
import { MetaProvider, metaTime } from "@/lib/social-voting/providers/meta";
import { XProvider, X_READ_COST_MICROS } from "@/lib/social-voting/providers/x";
import { SpendCap } from "@/lib/social-voting/spend";
import { fakeFetch, fixture, MemorySpend, NOW, OUR_POST } from "./helpers";

const xRoutes = (): Array<[RegExp, unknown]> => [
  [/search\/recent.*next_token=page2token/, fixture("x-replies-page2.json")],
  [/search\/recent/, fixture("x-replies-page1.json")],
  [/tweets\/1980000000000000000\?expansions/, fixture("x-poll.json")],
  [/tweets\?ids=/, fixture("x-lookup.json")],
];
const cap = (usd = 50) => new SpendCap(new MemorySpend(), "x", usd * 1_000_000);

describe("reading a reply as YES or NO", () => {
  it.each([
    ["yes", "yes"], ["YES", "yes"], ["Yes!", "yes"], ["oui", "yes"], ["OUI.", "yes"], ["  Oui  ", "yes"], ["@Cansensa yes", "yes"], ["#Yes ✅", "yes"],
    ["no", "no"], ["NO", "no"], ["Non", "no"], ["non!!", "no"], ["No.", "no"], ["« non »", "no"],
  ] as const)("%s → %s", (text, vote) => {
    expect(parseVote(text)).toBe(vote);
  });

  it.each(["", "maybe", "yes no", "yes, probably", "not sure", "oui et non", "62%", "yesss", "nope", "y", "https://example.ca/yes", "@yes", "x".repeat(400)])("ignores an unclear reply: %s", (text) => {
    expect(parseVote(text)).toBeNull();
  });

  it("ignores anything that isn't text", () => {
    expect(parseVote(null)).toBeNull();
    expect(parseVote(undefined)).toBeNull();
  });
});

describe("X adapter", () => {
  it("returns only direct YES/NO replies, as {replyId, authorId, vote, at}, across pages", async () => {
    const { fetch, calls } = fakeFetch(xRoutes());
    const read = await new XProvider({ bearer: "app-bearer", spend: cap(), fetch }).readReplies(OUR_POST, null, NOW);
    expect(read.complete).toBe(true);
    expect(read.replies).toEqual([
      { replyId: "1990000000000000001", authorId: "111", vote: "yes", at: "2026-11-18T14:00:00.000Z" },
      { replyId: "1990000000000000002", authorId: "222", vote: "no", at: "2026-11-18T14:05:00.000Z" },
      { replyId: "1990000000000000006", authorId: "999", vote: "yes", at: "2026-11-18T15:00:00.000Z" },
      { replyId: "1990000000000000007", authorId: "111", vote: "no", at: "2026-11-18T16:00:00.000Z" },
    ]);
    // The unclear sentence, the reply to someone else's reply and the malformed row are gone; no text or username came through.
    expect(JSON.stringify(read)).not.toMatch(/maple_reader|probably|Cansensa|text|username/);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toMatch(/^https:\/\/api\.x\.com\/2\/tweets\/search\/recent\?/);
    expect(decodeURIComponent(calls[0]!.url)).toContain(`conversation_id:${OUR_POST}`);
    expect((calls[0]!.init?.headers as Record<string, string>).Authorization).toBe("Bearer app-bearer");
  });

  it("asks only for replies since the reader's place, never further back than X's 7 days", async () => {
    const { fetch, calls } = fakeFetch(xRoutes());
    const x = new XProvider({ bearer: "b", spend: cap(), fetch });
    await x.readReplies(OUR_POST, new Date("2026-11-18T14:05:00Z"), NOW);
    expect(decodeURIComponent(calls[0]!.url)).toContain("start_time=2026-11-18T14:05:00Z");
    await x.readReplies(OUR_POST, new Date("2026-10-01T00:00:00Z"), NOW);
    expect(decodeURIComponent(calls.at(-2)!.url)).toContain("start_time=2026-11-12T15:05:00Z");
  });

  it("reads a two-way YES/NO poll as totals only", async () => {
    const { fetch } = fakeFetch(xRoutes());
    expect(await new XProvider({ bearer: "b", spend: cap(), fetch }).readPollTotals(OUR_POST, NOW)).toEqual({ yes: 412, no: 655 });
  });

  it("leaves a poll alone when it isn't a plain YES/NO poll", async () => {
    const { fetch } = fakeFetch([[/tweets\//, { includes: { polls: [{ options: [{ label: "Cut", votes: 3 }, { label: "Hold", votes: 4 }, { label: "Raise", votes: 1 }] }] } }]]);
    expect(await new XProvider({ bearer: "b", spend: cap(), fetch }).readPollTotals(OUR_POST, NOW)).toBeNull();
  });

  it("tells a deleted reply from one that is merely hidden", async () => {
    const { fetch } = fakeFetch(xRoutes());
    const gone = await new XProvider({ bearer: "b", spend: cap(), fetch }).findDeleted(["1990000000000000001", "1990000000000000002", "1990000000000000007"], NOW);
    expect(gone).toEqual(["1990000000000000007"]);
  });

  it("stops, incomplete, on a failed or malformed answer, and refuses a post id that isn't digits", async () => {
    const down = fakeFetch([[/search/, { title: "Too Many Requests" }, 429]]);
    expect(await new XProvider({ bearer: "b", spend: cap(), fetch: down.fetch }).readReplies(OUR_POST, null, NOW)).toEqual({ replies: [], complete: false });
    const odd = fakeFetch([[/search/, { data: "nope" }]]);
    expect((await new XProvider({ bearer: "b", spend: cap(), fetch: odd.fetch }).readReplies(OUR_POST, null, NOW)).complete).toBe(false);
    const never = fakeFetch(xRoutes());
    expect((await new XProvider({ bearer: "b", spend: cap(), fetch: never.fetch }).readReplies("abc; drop", null, NOW)).complete).toBe(false);
    expect(never.calls).toHaveLength(0);
  });

  it("hands back the unused part of each reservation, so the counter matches what was read", async () => {
    const store = new MemorySpend();
    const { fetch } = fakeFetch(xRoutes());
    await new XProvider({ bearer: "b", spend: new SpendCap(store, "x", 50_000_000), fetch }).readReplies(OUR_POST, null, NOW);
    expect(store.totals.get("x:2026-11-01")).toBe(7 * X_READ_COST_MICROS); // 5 rows on page one, 2 on page two
  });
});

describe("Meta adapter (fixtures only until Meta approves the app)", () => {
  it("Facebook: keeps comments with a numeric author id and a clear YES/NO, nothing else about them", async () => {
    const { fetch, calls } = fakeFetch([[/graph\.facebook\.com\/5001\/comments/, fixture("meta-facebook-comments.json")]]);
    const read = await new MetaProvider({ platform: "facebook", accessToken: "page-token", fetch }).readReplies("5001", null);
    expect(read).toEqual({
      complete: true,
      replies: [
        { replyId: "5001_7001", authorId: "8101", vote: "yes", at: "2026-11-18T14:00:00.000Z" },
        { replyId: "5001_7002", authorId: "8102", vote: "no", at: "2026-11-18T14:30:00.000Z" },
      ],
    });
    expect(JSON.stringify(read)).not.toMatch(/Tremblay|Jordan|sure/);
    // The token travels in a header, never in the address.
    expect(calls[0]!.url).not.toContain("page-token");
    expect((calls[0]!.init?.headers as Record<string, string>).Authorization).toBe("Bearer page-token");
  });

  it("Instagram: a comment that carries only a username can't be matched, so it is dropped (AEGIS note 3)", async () => {
    const { fetch } = fakeFetch([[/graph\.facebook\.com\/17890\/comments/, fixture("meta-instagram-comments.json")]]);
    const read = await new MetaProvider({ platform: "instagram", accessToken: "t", fetch }).readReplies("17890", null);
    expect(read.replies).toEqual([{ replyId: "17900000000000001", authorId: "8201", vote: "yes", at: "2026-11-18T14:00:00.000Z" }]);
    expect(JSON.stringify(read)).not.toMatch(/north_shore_amy|prairie_dan/);
  });

  it("Threads: replies carry no author id, so none is kept", async () => {
    const { fetch, calls } = fakeFetch([[/graph\.threads\.net\/18001\/replies/, fixture("meta-threads-replies.json")]]);
    const read = await new MetaProvider({ platform: "threads", accessToken: "t", fetch }).readReplies("18001", null);
    expect(read).toEqual({ replies: [], complete: true });
    expect(calls).toHaveLength(1);
  });

  it("skips comments older than the reader's place, has no poll totals to read, and reads Meta's time format", async () => {
    const { fetch } = fakeFetch([[/comments/, fixture("meta-facebook-comments.json")]]);
    const meta = new MetaProvider({ platform: "facebook", accessToken: "t", fetch });
    expect((await meta.readReplies("5001", new Date("2026-11-18T14:10:00Z"))).replies.map((r) => r.replyId)).toEqual(["5001_7002"]);
    expect(await meta.readPollTotals()).toBeNull();
    expect(metaTime("2026-11-18T14:00:00+0000")).toBe("2026-11-18T14:00:00.000Z");
    expect(metaTime("soon")).toBeNull();
  });

  it("stops, incomplete, when Meta refuses", async () => {
    const { fetch } = fakeFetch([[/comments/, { error: { message: "(#10) permission" } }, 403]]);
    expect(await new MetaProvider({ platform: "facebook", accessToken: "t", fetch }).readReplies("5001", null)).toEqual({ replies: [], complete: false });
  });
});
