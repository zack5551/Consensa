import { describe, expect, it, vi } from "vitest";
import { SPONSOR_MIN_CELL, sponsorReportable, sponsorSocialCounts } from "@/lib/social-voting/sponsor";

const questions = [
  { slug: "housing-starts-q4" },
  { slug: "rate-cut-december", political: false },
  { slug: "federal-vote-2027", political: true },
];
const noPolls = async () => [];

describe("sponsor numbers", () => {
  it("the minimum cell size is 50", () => {
    expect(SPONSOR_MIN_CELL).toBe(50);
  });

  it("political questions are never sponsor-reportable, and unknown slugs are dropped", () => {
    expect(sponsorReportable(questions, ["housing-starts-q4", "federal-vote-2027", "rate-cut-december", "made-up", "housing-starts-q4"])).toEqual(["housing-starts-q4", "rate-cut-december"]);
  });

  it("the database is asked only about non-political questions, and not at all when none is left", async () => {
    const counts = vi.fn<(slugs: string[]) => Promise<unknown[]>>(async () => []);
    await sponsorSocialCounts(questions, ["federal-vote-2027", "housing-starts-q4"], { counts, polls: noPolls });
    expect(counts).toHaveBeenCalledWith(["housing-starts-q4"]);
    counts.mockClear();
    expect(await sponsorSocialCounts(questions, ["federal-vote-2027"], { counts, polls: noPolls })).toEqual([]);
    expect(counts).not.toHaveBeenCalled();
  });

  it("passes on cells of 50 or more, per question and source", async () => {
    const rows = [
      { slug: "housing-starts-q4", source: "web", people: 70 },
      { slug: "housing-starts-q4", source: "other", people: 55 },
      { slug: "housing-starts-q4", source: "total", people: 125 },
    ];
    const out = await sponsorSocialCounts(questions, ["housing-starts-q4"], { counts: async () => rows, polls: async () => [{ slug: "housing-starts-q4", platform: "x", yes: 412, no: 655 }] });
    expect(out).toEqual([{ slug: "housing-starts-q4", cells: { web: 70, other: 55 }, total: 125, polls: { x: { yes: 412, no: 655 } } }]);
  });

  it("never passes on a cell under 50, even if the database sent one, and hides the total with it", async () => {
    const rows = [
      { slug: "housing-starts-q4", source: "web", people: 60 },
      { slug: "housing-starts-q4", source: "x", people: 49 },
      { slug: "housing-starts-q4", source: "other", people: null },
      { slug: "housing-starts-q4", source: "total", people: 109 },
    ];
    const [out] = await sponsorSocialCounts(questions, ["housing-starts-q4"], { counts: async () => rows, polls: noPolls });
    expect(out).toEqual({ slug: "housing-starts-q4", cells: { web: 60, x: null, other: null }, total: null, polls: {} });
  });

  it("returns aggregates only: no field that could name a person", async () => {
    const rows = [{ slug: "housing-starts-q4", source: "web", people: 80, user_id: "u1", email: "a@example.ca" }];
    const out = await sponsorSocialCounts(questions, ["housing-starts-q4"], { counts: async () => rows, polls: noPolls });
    expect(JSON.stringify(out)).not.toMatch(/u1|example\.ca|user/);
  });

  it("refuses rows it doesn't recognise", async () => {
    await expect(sponsorSocialCounts(questions, ["housing-starts-q4"], { counts: async () => [{ slug: "housing-starts-q4", source: "fax", people: 80 }], polls: noPolls })).rejects.toThrow();
  });
});
