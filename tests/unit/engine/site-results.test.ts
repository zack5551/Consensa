import { describe, expect, it } from "vitest";
import { sampleQuestions } from "@/content/sample-questions";
import { resolveDue } from "@/engine/resolve/due";
import { CONFIRM_GAP_MS } from "@/engine/resolve/policy";
import { readResolver, VALET_SERIES, WDS_URL } from "@/engine/resolve/resolvers";
import { siteDueQuestions, siteResolvers } from "@/engine/site-results";
import { MemoryStore } from "@/engine/store";
import { fakeHttp } from "./helpers";

const valet = (points: Array<[string, string]>) => ({ observations: points.map(([d, v]) => ({ d, [VALET_SERIES]: { v } })) });
const lfs = (refPer: string, value: string) => [{ status: "SUCCESS", object: { vectorId: 2062815, vectorDataPoint: [{ refPer, value, releaseTime: "2026-11-06T08:30" }] } }];

describe("automatic results for the site's questions", () => {
  it("only lists questions that exist on the site", () => {
    const slugs = new Set(sampleQuestions.map((q) => q.slug));
    for (const slug of Object.keys(siteResolvers)) expect(slugs.has(slug), slug).toBe(true);
  });

  it("only automates questions settled by Bank of Canada or Statistics Canada data", () => {
    for (const q of siteDueQuestions(sampleQuestions)) {
      const source = sampleQuestions.find((s) => s.slug === q.slug)!.resolution.source.url;
      expect(source, q.slug).toMatch(q.resolver.kind === "boc-policy-rate" ? /bankofcanada\.ca/ : /statcan\.gc\.ca/);
    }
  });

  it("treats a hold as a clear answer, not a value on the line", async () => {
    const http = fakeHttp([{ match: /valet/, body: valet([["2026-09-17", "2.25"], ["2026-09-18", "2.25"]]) }]);
    const read = await readResolver({ kind: "boc-policy-rate", decisionDate: "2026-09-17", direction: "hold" }, http, new Date("2026-11-11T12:00:00Z"));
    expect(read).toMatchObject({ status: "answer", outcome: "yes", margin: 0.25 });
  });

  it("reads October 28, 2026 as the hike it was (Valet as served on 2026-11-11)", async () => {
    const http = fakeHttp([{ match: /valet/, body: valet([["2026-10-27", "2.25"], ["2026-10-28", "2.25"], ["2026-10-29", "2.50"], ["2026-10-30", "2.50"]]) }]);
    const now = new Date("2026-11-11T12:00:00Z");
    expect(await readResolver(siteResolvers["boc-hold-oct-2026"]!, http, now)).toMatchObject({ outcome: "no", observed: "2.25% → 2.50% (2026-10-29)" });
    expect(await readResolver(siteResolvers["boc-cut-oct-2026"]!, http, now)).toMatchObject({ outcome: "no" });
    // With only the decision day posted, the new target isn't visible yet: wait.
    const early = fakeHttp([{ match: /valet/, body: valet([["2026-10-27", "2.25"], ["2026-10-28", "2.25"]]) }]);
    expect((await readResolver(siteResolvers["boc-hold-oct-2026"]!, early, now)).status).toBe("pending");
  });

  it("resolves the October jobs question after two matching reads on separate cycles", async () => {
    const store = new MemoryStore();
    const http = fakeHttp([{ match: new RegExp(WDS_URL), method: "POST", body: lfs("2026-10-01", "6.9") }]);
    const due = siteDueQuestions(sampleQuestions).filter((q) => q.slug === "jobs-rate-oct-2026");
    const t0 = new Date("2026-11-11T12:00:00Z");

    expect(await resolveDue(due, store, http, t0)).toEqual([{ slug: "jobs-rate-oct-2026", state: "confirming" }]);
    expect(await resolveDue(due, store, http, new Date(t0.getTime() + CONFIRM_GAP_MS))).toEqual([{ slug: "jobs-rate-oct-2026", state: "resolved", outcome: "no" }]);
    // A resolved question is never read again.
    expect(await resolveDue(due, store, http, new Date(t0.getTime() + 2 * CONFIRM_GAP_MS))).toEqual([]);
  });

  it("doesn't read a question before its result is due", async () => {
    const http = fakeHttp([]);
    const due = siteDueQuestions(sampleQuestions).filter((q) => q.slug === "boc-cut-dec-2026");
    expect(await resolveDue(due, new MemoryStore(), http, new Date("2026-11-11T12:00:00Z"))).toEqual([]);
    expect(http.calls).toEqual([]);
  });
});
