/**
 * Wires a cycle from the environment: live or sample feeds, Claude or the mock drafter. Kept apart from the route
 * so the same wiring serves the scheduler, scripts and tests.
 */
import { ClaudeDrafter } from "@/engine/draft/claude";
import type { Drafter } from "@/engine/draft/drafter";
import { MockDrafter } from "@/engine/draft/mock";
import { runCycle, type CycleReport } from "@/engine/pipeline";
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
  /** Until Supabase lands, each run gets a fresh in-memory store: a dry run that reports what it would queue. */
  store?: EngineStore;
  live?: readonly Comparable[];
}

export interface RunResult {
  mode: { drafter: string; feeds: "live" | "sample"; persisted: boolean };
  report: CycleReport;
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
  return { mode: { drafter: drafter.id, feeds: opts.liveFeeds ? "live" : "sample", persisted: Boolean(opts.store) }, report };
}
