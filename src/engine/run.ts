/**
 * Wires a cycle from the environment: live or sample feeds, Claude or the mock drafter. Kept apart from the route
 * so the same wiring serves the scheduler, scripts and tests.
 */
import { ClaudeDrafter } from "@/engine/draft/claude";
import type { Drafter } from "@/engine/draft/drafter";
import { MockDrafter } from "@/engine/draft/mock";
import { toSiteQuestion } from "@/engine/live";
import { publishApproved, runCycle, type CycleReport } from "@/engine/pipeline";
import { resolveDue, type DueQuestion, type ResolveStep } from "@/engine/resolve/due";
import { httpFrom } from "@/engine/resolve/resolvers";
import { releases, upcoming } from "@/engine/sources/calendar";
import { fetchFeeds } from "@/engine/sources/feed";
import { sources } from "@/engine/sources/registry";
import { sampleFeedResults } from "@/engine/sources/sample-feeds";
import { MemoryStore, type EngineStore } from "@/engine/store";
import type { Comparable } from "@/engine/dedup";

export interface RunOptions {
  apiKey?: string;
  liveFeeds: boolean;
  maxDrafts: number;
  now: Date;
  /** Without a store (no Supabase keys), each run gets a fresh in-memory store: a dry run that reports what it would queue. */
  store?: EngineStore;
  live?: readonly Comparable[];
  /** Vercel deploy hook: called when a question goes live or resolves, so the static site rebuilds with it. */
  deployHook?: string;
  fetch?: typeof fetch;
  /**
   * Automatic results for the site's hand-written questions (see `site-results.ts`). Runs on every cycle, with or
   * without the paid drafter: it only reads free official data. Needs a store that persists between cycles, because
   * a result is confirmed by two reads on separate cycles.
   */
  results?: { questions: readonly DueQuestion[]; store: Pick<EngineStore, "getResolution" | "putResolution">; now: Date };
}

export interface RunResult {
  mode: { drafter: string; feeds: "live" | "sample"; persisted: boolean };
  report: CycleReport;
  /** Slugs that went live this run (approved by an editor since the last run). */
  published: string[];
  /** Automatic results for the site's own questions this run. */
  siteResults: ResolveStep[];
  /** Whether the site was asked to rebuild. */
  redeploy: boolean;
}

export async function runFromEnv(opts: RunOptions): Promise<RunResult> {
  const drafter: Drafter = opts.apiKey ? new ClaudeDrafter({ apiKey: opts.apiKey }) : new MockDrafter();
  const store = opts.store ?? new MemoryStore(opts.live);
  const report = await runCycle({
    store,
    drafter,
    ingest: opts.liveFeeds ? () => fetchFeeds(sources, fetch) : async () => sampleFeedResults(),
    http: opts.liveFeeds ? httpFrom(fetch) : undefined,
    releases: upcoming(opts.now, 120, releases),
    now: opts.now,
    config: { maxDrafts: opts.maxDrafts },
  });

  // Publish what editors approved since the last run, then refresh every live question (a result may have landed).
  const published = (await publishApproved(store, opts.now)).map((q) => q.slug);
  for (const item of await store.items()) {
    if (item.status !== "published") continue;
    await store.putLiveQuestion(toSiteQuestion(item, await store.getResolution(item.draft.slug)));
  }

  const siteResults = opts.results ? await resolveDue(opts.results.questions, opts.results.store, httpFrom(opts.fetch ?? fetch), opts.results.now) : [];

  const resolved = [...report.resolutions, ...siteResults].some((r) => r.state === "resolved");
  let redeploy = false;
  if (opts.deployHook && (published.length > 0 || resolved)) {
    const res = await (opts.fetch ?? fetch)(opts.deployHook, { method: "POST" });
    redeploy = res.ok;
  }

  return {
    mode: { drafter: drafter.id, feeds: opts.liveFeeds ? "live" : "sample", persisted: Boolean(opts.store) },
    report,
    published,
    siteResults,
    redeploy,
  };
}
