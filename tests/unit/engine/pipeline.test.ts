import { describe, expect, it } from "vitest";
import { SAMPLE_NOW, sampleQuestions } from "@/content/sample-questions";
import type { Drafter } from "@/engine/draft/drafter";
import { MockDrafter } from "@/engine/draft/mock";
import { pickStories, publishApproved, runCycle } from "@/engine/pipeline";
import { approve } from "@/engine/review";
import { releases, upcoming } from "@/engine/sources/calendar";
import { sampleFeedResults } from "@/engine/sources/sample-feeds";
import { MemoryStore } from "@/engine/store";
import { VALET_SERIES } from "@/engine/resolve/resolvers";
import { fakeHttp, goodDraft, signal, story } from "./helpers";

const live = sampleQuestions.map((q) => ({ slug: q.slug, question: q.question }));
const deps = (store: MemoryStore, drafter: Drafter = new MockDrafter()) => ({
  store,
  drafter,
  ingest: async () => sampleFeedResults(),
  releases: upcoming(SAMPLE_NOW, 120, releases),
  now: SAMPLE_NOW,
});

describe("runCycle on the sample feeds", () => {
  it("blocks the crash story before drafting, queues the checkable stories, and catches the existing rate question", async () => {
    const store = new MemoryStore(live);
    const report = await runCycle(deps(store));
    const by = Object.fromEntries(report.decisions.map((d) => [d.headline, d.decision]));

    expect(by["Two killed in highway crash near Kingston, police say"]).toBe("blockedStory");
    expect(report.decisions.filter((d) => d.decision === "queued").map((d) => "itemId" in d && d.itemId.split("--")[0])).toEqual(
      expect.arrayContaining(["unemployment-7pct-nov-2026", "yyz-snow-25cm-dec-2026"]),
    );
    // The sample slate already has boc-cut-dec-2026, so the engine's own rate draft is a duplicate.
    const rate = report.decisions.find((d) => d.headline.startsWith("Economists split"));
    expect(rate).toMatchObject({ decision: "autoRejected" });
    expect(rate && "flags" in rate && rate.flags.map((f) => f.code)).toContain("duplicate");

    expect(report.feeds.failed).toEqual([]);
    expect(report.drafter).toBe("mock");
  });

  it("doesn't pay to draft the same story twice", async () => {
    const store = new MemoryStore(live);
    let calls = 0;
    const counting: Drafter = { id: "count", draft: (s, c) => {
        calls++;
        return new MockDrafter().draft(s, c);
      },
    };
    await runCycle(deps(store, counting));
    const first = calls;
    const again = await runCycle(deps(store, counting));
    expect(calls).toBe(first);
    expect(again.feeds.newSignals).toBe(0);
  });

  it("retries a story next cycle when the drafter errors", async () => {
    const store = new MemoryStore();
    const failing: Drafter = { id: "down", draft: async () => ({ status: "error", reason: "API 529", drafter: "down" }) };
    const r1 = await runCycle(deps(store, failing));
    expect(r1.decisions.some((d) => d.decision === "error")).toBe(true);
    const r2 = await runCycle(deps(store));
    expect(r2.decisions.some((d) => d.decision === "queued")).toBe(true);
  });

  it("never publishes anything without an editor, and resolves published questions from the source", async () => {
    const store = new MemoryStore();
    const drafter: Drafter = {
      id: "fixed",
      draft: async () => ({
        status: "draft",
        drafter: "fixed",
        draft: goodDraft({
          slug: "boc-cut-dec-2026",
          question: { en: "Will the Bank of Canada cut its policy rate on Dec. 9, 2026?", fr: "La Banque du Canada baissera-t-elle son taux directeur le 9 décembre 2026?" },
          closesAt: "2026-12-09T14:30:00Z",
          resolution: {
            source: { name: { en: "Bank of Canada", fr: "Banque du Canada" }, url: "https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/" },
            rule: {
              en: "Resolves YES if the Bank of Canada announces a lower target for the overnight rate on December 9, 2026. Otherwise it resolves NO.",
              fr: "Résolue OUI si la Banque du Canada annonce une cible plus basse pour le taux du financement à un jour le 9 décembre 2026. Sinon, elle est résolue NON.",
            },
            resolvesAt: "2026-12-09T15:00:00Z",
          },
          resolver: { kind: "boc-policy-rate", decisionDate: "2026-12-09", direction: "cut" },
        }),
      }),
    };
    await runCycle({ ...deps(store, drafter), config: { maxDrafts: 1 } });
    expect(await publishApproved(store, SAMPLE_NOW)).toEqual([]);

    const [item] = (await store.items()).filter((i) => i.status === "pending");
    await store.putItem(approve(item!, "editor-1", SAMPLE_NOW));
    const [published] = await publishApproved(store, SAMPLE_NOW);
    expect(published).toMatchObject({ slug: "boc-cut-dec-2026", approvedBy: "editor-1", drafter: "fixed" });
    expect(published!.resolution.result).toBeUndefined();

    const http = fakeHttp([{ match: /valet/, body: { observations: [{ d: "2026-12-09", [VALET_SERIES]: { v: "2.50" } }, { d: "2026-12-10", [VALET_SERIES]: { v: "2.25" } }] } }]);
    const at = (iso: string) => ({ ...deps(store), ingest: async () => [], http, now: new Date(iso) });
    expect((await runCycle(at("2026-12-10T01:00:00Z"))).resolutions).toEqual([{ slug: "boc-cut-dec-2026", state: "confirming" }]);
    expect((await runCycle(at("2026-12-10T01:15:00Z"))).resolutions).toEqual([{ slug: "boc-cut-dec-2026", state: "resolved", outcome: "yes" }]);
  });
});

describe("pickStories", () => {
  it("caps drafts per category so one big story can't flood the queue", () => {
    const econ = (id: string, heat: number) => story([signal({ title: id })], { id, heat, categoryHint: "economy" });
    const picked = pickStories([econ("a", 90), econ("b", 80), econ("c", 70), story([signal({ title: "d" })], { id: "d", heat: 60, categoryHint: "weather" })], 3, 2);
    expect(picked.map((s) => s.id)).toEqual(["a", "b", "d"]);
  });
});
