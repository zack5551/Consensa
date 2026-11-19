import { describe, expect, it } from "vitest";
import { XProvider, X_READ_COST_MICROS } from "@/lib/social-voting/providers/x";
import { monthOf, SpendCap, usdToMicros } from "@/lib/social-voting/spend";
import { fakeFetch, fixture, MemorySpend, NOW, OUR_POST } from "./helpers";

describe("the monthly spend cap", () => {
  it("keeps its counter in the injected store, by platform and month", async () => {
    const store = new MemorySpend();
    const cap = new SpendCap(store, "x", usdToMicros(1));
    expect(await cap.reserve(600_000, NOW)).toBe(true);
    expect(await cap.reserve(500_000, NOW)).toBe(false); // would pass US$1
    await cap.release(200_000, NOW);
    expect(await cap.reserve(500_000, NOW)).toBe(true);
    expect([...store.totals.entries()]).toEqual([["x:2026-11-01", 900_000]]);
    // A second instance (another server, another cycle) sees the same total: nothing is held in memory.
    expect(await new SpendCap(store, "x", usdToMicros(1)).reserve(200_000, NOW)).toBe(false);
    // A new month starts from zero.
    expect(await cap.reserve(600_000, new Date("2026-12-01T00:00:00Z"))).toBe(true);
    expect(monthOf(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12-01");
  });

  it("with no cap set, nothing is reserved and the store isn't even asked", async () => {
    const store = new MemorySpend();
    for (const usd of [0, -5, Number.NaN]) expect(await new SpendCap(store, "x", usdToMicros(usd)).reserve(5_000, NOW)).toBe(false);
    expect(store.asked).toBe(0);
  });

  it("refuses when the counter can't be reached, and refuses odd amounts", async () => {
    const broken = { reserve: async () => Promise.reject(new Error("down")) };
    expect(await new SpendCap(broken, "x", 1_000_000).reserve(5_000, NOW)).toBe(false);
    const cap = new SpendCap(new MemorySpend(), "x", 1_000_000);
    expect(await cap.reserve(0, NOW)).toBe(false);
    expect(await cap.reserve(1.5, NOW)).toBe(false);
    expect(await cap.reserve(2_000_000, NOW)).toBe(false);
  });

  it("X makes no request at all without a cap", async () => {
    const { fetch, calls } = fakeFetch([[/./, fixture("x-replies-page2.json")]]);
    const x = new XProvider({ bearer: "b", spend: new SpendCap(new MemorySpend(), "x", 0), fetch });
    expect(await x.readReplies(OUR_POST, null, NOW)).toEqual({ replies: [], complete: false });
    expect(await x.readPollTotals(OUR_POST, NOW)).toBeNull();
    expect(await x.findDeleted(["1990000000000000001"], NOW)).toEqual({ gone: [], checked: 0, complete: false });
    expect(calls).toHaveLength(0);
  });

  it("X stops reading when the next page would pass the cap, and says the read is incomplete", async () => {
    const store = new MemorySpend();
    const { fetch, calls } = fakeFetch([
      [/next_token=page2token/, fixture("x-replies-page2.json")],
      [/search\/recent/, fixture("x-replies-page1.json")],
    ]);
    // Room for one full page (100 reads) and the 5 actually read, but not for a second page's worst case.
    const x = new XProvider({ bearer: "b", spend: new SpendCap(store, "x", 104 * X_READ_COST_MICROS), fetch });
    const read = await x.readReplies(OUR_POST, null, NOW);
    expect(calls).toHaveLength(1);
    expect(read.complete).toBe(false);
    expect(read.replies).toHaveLength(2);
    expect(store.totals.get("x:2026-11-01")).toBe(5 * X_READ_COST_MICROS);
  });
});
