import { describe, expect, it } from "vitest";
import { applyRead, CONFIRM_GAP_MS, editorResult, MAX_ERRORS, newRecord, toResult } from "@/engine/resolve/policy";
import { compare, readResolver, VALET_SERIES } from "@/engine/resolve/resolvers";
import type { ResolverRead } from "@/engine/types";
import { fakeHttp } from "./helpers";

const valet = (points: Array<[string, string]>) => ({ observations: points.map(([d, v]) => ({ d, [VALET_SERIES]: { v } })) });
const boc = { kind: "boc-policy-rate", decisionDate: "2026-12-09", direction: "cut" } as const;
const after = new Date("2026-12-10T12:00:00Z");

describe("Bank of Canada resolver (Valet shape as served on 2026-11-06)", () => {
  it("says YES when the target drops on the decision date", async () => {
    const http = fakeHttp([{ match: /valet\/observations\/V39079/, body: valet([["2026-12-08", "2.50"], ["2026-12-09", "2.25"], ["2026-12-10", "2.25"]]) }]);
    const read = await readResolver(boc, http, after);
    expect(read).toMatchObject({ status: "answer", outcome: "yes", observed: "2.50% → 2.25% (2026-12-09)", margin: 0.25 });
  });

  it("says NO on a hold, and YES for a 'hold' question", async () => {
    const http = fakeHttp([{ match: /valet/, body: valet([["2026-12-08", "2.50"], ["2026-12-09", "2.50"]]) }]);
    expect(await readResolver(boc, http, after)).toMatchObject({ outcome: "no" });
    expect(await readResolver({ ...boc, direction: "hold" }, http, after)).toMatchObject({ outcome: "yes" });
  });

  it("waits until the decision day is over, without calling the API", async () => {
    const http = fakeHttp([]);
    expect((await readResolver(boc, http, new Date("2026-12-09T15:00:00Z"))).status).toBe("pending");
    expect(http.calls).toEqual([]);
  });

  it("turns a changed API shape or an outage into an error, never an answer", async () => {
    expect((await readResolver(boc, fakeHttp([{ match: /valet/, body: { nope: true } }]), after)).status).toBe("error");
    expect((await readResolver(boc, fakeHttp([{ match: /valet/, body: {}, status: 503 }]), after)).status).toBe("error");
  });
});

describe("Statistics Canada resolver (WDS shape from the user guide)", () => {
  const r = { kind: "statcan-vector", vectorId: 2062815, refPeriod: "2026-11", comparator: ">=", threshold: 7, unit: "%" } as const;
  const wds = (points: Array<[string, string | null]>) => [
    { status: "SUCCESS", object: { vectorId: 2062815, vectorDataPoint: points.map(([refPer, value]) => ({ refPer, value, releaseTime: "2026-12-04T08:30" })) } },
  ];

  it("reads the reference month and compares to the threshold", async () => {
    const http = fakeHttp([{ match: /getDataFromVectorsAndLatestNPeriods/, method: "POST", body: wds([["2026-10-01", "6.9"], ["2026-11-01", "7.1"]]) }]);
    expect(await readResolver(r, http, after)).toMatchObject({ status: "answer", outcome: "yes", margin: 0.1 });
    expect(http.calls[0]).toMatch(/^POST /);
  });

  it("is pending until the month is published", async () => {
    const http = fakeHttp([{ match: /wds/, body: wds([["2026-10-01", "6.9"]]) }]);
    expect((await readResolver(r, http, after)).status).toBe("pending");
  });

  it("errors when WDS reports a failure", async () => {
    expect((await readResolver(r, fakeHttp([{ match: /wds/, body: [{ status: "FAILED" }] }]), after)).status).toBe("error");
  });
});

describe("ECCC daily climate resolver", () => {
  const r = { kind: "eccc-daily-climate", climateId: "6158731", element: "TOTAL_SNOW", aggregate: "sum", from: "2026-12-01", to: "2026-12-03", comparator: ">=", threshold: 10 } as const;
  const days = (snow: Array<number | null>) => ({ features: snow.map((s, i) => ({ properties: { LOCAL_DATE: `2026-12-0${i + 1}`, TOTAL_SNOW: s } })) });
  const late = new Date("2026-12-06T00:00:00Z");

  it("sums the window", async () => {
    expect(await readResolver(r, fakeHttp([{ match: /climate-daily/, body: days([4, 3.5, 2.5]) }]), late)).toMatchObject({ outcome: "yes", margin: 0 });
    expect(await readResolver(r, fakeHttp([{ match: /climate-daily/, body: days([4, 3.5, 2]) }]), late)).toMatchObject({ outcome: "no" });
  });

  it("refuses to answer with missing days", async () => {
    expect((await readResolver(r, fakeHttp([{ match: /climate-daily/, body: days([4, null, 9]) }]), late)).status).toBe("error");
  });

  it("waits for ECCC's posting lag", async () => {
    expect((await readResolver(r, fakeHttp([]), new Date("2026-12-04T06:00:00Z"))).status).toBe("pending");
  });
});

describe("compare", () => {
  it.each([[7, ">=", 7, true], [7, ">", 7, false], [6.9, "<", 7, true], [7, "<=", 7, true]] as const)("%d %s %d", (v, c, t, want) => expect(compare(v, c, t)).toBe(want));
});

describe("resolution policy", () => {
  const yes: ResolverRead = { status: "answer", outcome: "yes", observed: "7.1%", evidenceUrl: "https://www150.statcan.gc.ca/x", margin: 0.1 };
  const t0 = new Date("2026-12-04T14:00:00Z");
  const t1 = new Date(t0.getTime() + CONFIRM_GAP_MS);

  it("resolves only after two matching reads at least the gap apart", () => {
    let rec = applyRead(newRecord("q"), yes, t0);
    expect(rec.state).toBe("confirming");
    expect(applyRead(rec, yes, new Date(t0.getTime() + 60_000)).state).toBe("confirming");
    rec = applyRead(rec, yes, t1);
    expect(rec).toMatchObject({ state: "resolved", outcome: "yes", resolvedBy: "engine" });
    expect(toResult(rec)).toEqual({ outcome: "yes", publishedAt: t1.toISOString(), disputed: false });
  });

  it("sends disagreements, values on the line, repeated errors and manual questions to an editor", () => {
    const first = applyRead(newRecord("q"), yes, t0);
    expect(applyRead(first, { ...yes, outcome: "no" }, t1).state).toBe("needsEditor");
    expect(applyRead(newRecord("q"), { ...yes, margin: 0 }, t0).state).toBe("needsEditor");
    let rec = newRecord("q");
    for (let i = 0; i < MAX_ERRORS; i++) rec = applyRead(rec, { status: "error", reason: "503" }, t0);
    expect(rec.state).toBe("needsEditor");
    expect(applyRead(newRecord("q"), { status: "pending", reason: "editor" }, t0, true).state).toBe("needsEditor");
  });

  it("never changes a settled record, and records who settled it", () => {
    const settled = editorResult(newRecord("q"), "no", "ed-1", t0, true);
    expect(applyRead(settled, yes, t1)).toBe(settled);
    expect(toResult(settled)).toEqual({ outcome: "no", publishedAt: t0.toISOString(), disputed: true });
    expect(toResult(newRecord("q"))).toBeNull();
  });
});
