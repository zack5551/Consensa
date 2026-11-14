import { describe, expect, it } from "vitest";
import { describeResolver, explainRecord } from "@/engine/explain";
import { applyRead, newRecord } from "@/engine/resolve/policy";
import type { Resolver, ResolverRead } from "@/engine/types";

const boc: Resolver = { kind: "boc-policy-rate", decisionDate: "2026-12-09", direction: "cut" };
const yes = (margin: number | null = 0.25): ResolverRead => ({ status: "answer", outcome: "yes", observed: "2.50% → 2.25%", evidenceUrl: "https://www.bankofcanada.ca/valet/", margin });
const no: ResolverRead = { status: "answer", outcome: "no", observed: "2.50% → 2.50%", evidenceUrl: "https://www.bankofcanada.ca/valet/", margin: 0.25 };
const t = (m: number) => new Date(Date.UTC(2026, 11, 10, 15, m));

describe("PULSE explains its results", () => {
  it("names the rule for every resolver kind", () => {
    expect(describeResolver(boc)).toBe("Bank of Canada decision on 2026-12-09: YES if it cuts the rate (Valet series V39079)");
    expect(describeResolver({ kind: "manual", check: "Winner on the prize site" })).toBe("An editor checks: Winner on the prize site");
  });

  it("says why a question is waiting, confirming or settled", () => {
    const waiting = applyRead(newRecord("q"), { status: "pending", reason: "no reading after 2026-12-09 yet" }, t(0));
    expect(explainRecord(waiting, boc)).toMatch(/^Not settled yet: no reading after 2026-12-09 yet\. Rule: Bank of Canada/);
    const first = applyRead(waiting, yes(), t(1));
    expect(explainRecord(first, boc)).toMatch(/^Official source reads YES: 2\.50% → 2\.25%\. Waiting for a second matching read at least 10 minutes later/);
    const done = applyRead(first, yes(), t(15));
    expect(explainRecord(done, boc)).toMatch(/^Settled YES by the engine: 2\.50% → 2\.25% \(https:\/\/www\.bankofcanada\.ca\/valet\/\)\. Two reads agreed, at .+ and .+\./);
  });

  it("says why an editor has to decide", () => {
    const split = applyRead(applyRead(newRecord("q"), yes(), t(0)), no, t(15));
    expect(explainRecord(split, boc)).toMatch(/^Needs an editor: two reads disagreed \(YES then NO/);
    expect(explainRecord(applyRead(newRecord("q"), yes(0), t(0)), boc)).toMatch(/^Needs an editor: the reading sits exactly on the line/);
    let failing = newRecord("q");
    for (let i = 0; i < 3; i++) failing = applyRead(failing, { status: "error", reason: "HTTP 503" }, t(i * 15));
    expect(explainRecord(failing, boc)).toMatch(/^Needs an editor: the source failed 3 times in a row \(last: HTTP 503\)/);
  });
});
