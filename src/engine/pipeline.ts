/**
 * One engine cycle. A scheduler calls `runCycle` every 15 minutes (see `src/app/api/engine/cycle/route.ts`).
 *
 *   1. Ingest: fetch every feed, keep new signals.
 *   2. Cluster: group the last 48 hours of signals into stories and score their heat.
 *   3. Screen: drop stories about deaths, violence, crime or private lives before any model call.
 *   4. Pick: the hottest stories not drafted before, with at most two per category so one big story can't flood
 *      the queue, and a hard cap on drafts per cycle so cost stays predictable.
 *   5. Draft: one bilingual question per story, or a decline.
 *   6. Check: safety screen, structural validation and dedup on every draft. Blocked drafts are kept but never shown.
 *   7. Queue: everything else waits for an editor.
 *   8. Resolve: read the official source for published questions whose result is due.
 *
 * The cycle never publishes anything by itself. Only `publishApproved` does, and only for items an editor approved.
 */
import type { Question } from "@/lib/question";
import { duplicateFlag, findDuplicate } from "@/engine/dedup";
import type { DraftUsage, Drafter } from "@/engine/draft/drafter";
import { applyRead, newRecord, type toResult } from "@/engine/resolve/policy";
import { readResolver, type Http } from "@/engine/resolve/resolvers";
import { newItem, publish } from "@/engine/review";
import { isBlocked, screenDraft, screenStory } from "@/engine/safety/safety";
import type { Release } from "@/engine/sources/calendar";
import type { FeedResult } from "@/engine/sources/feed";
import type { EngineStore } from "@/engine/store";
import { clusterSignals } from "@/engine/stories";
import type { Flag, QueueItem, Resolver, Story } from "@/engine/types";
import { validateDraft } from "@/engine/validate";

export interface CycleConfig {
  /** Stories cooler than this aren't worth a question yet. */
  minHeat: number;
  /** Most drafts (model calls) per cycle. */
  maxDrafts: number;
  /** Most drafts per category per cycle. */
  perCategory: number;
  /** How far back signals count toward a story. */
  lookbackHours: number;
  /** Parallel model calls. */
  concurrency: number;
}

export const DEFAULT_CYCLE: CycleConfig = { minHeat: 25, maxDrafts: 6, perCategory: 2, lookbackHours: 48, concurrency: 3 };

export interface CycleDeps {
  store: EngineStore;
  drafter: Drafter;
  /** Returns this cycle's feed results. In production, `() => fetchFeeds(sources, fetch)`. */
  ingest: () => Promise<FeedResult[]>;
  /** For auto-resolution. Leave out to skip the resolve step. */
  http?: Http;
  releases: readonly Release[];
  now: Date;
  config?: Partial<CycleConfig>;
}

export type StoryDecision =
  | { storyId: string; headline: string; heat: number; decision: "blockedStory"; flags: Flag[] }
  | { storyId: string; headline: string; heat: number; decision: "skipped"; reason: string }
  | { storyId: string; headline: string; heat: number; decision: "error"; reason: string }
  | { storyId: string; headline: string; heat: number; decision: "queued" | "autoRejected"; itemId: string; flags: Flag[] };

export interface CycleReport {
  startedAt: string;
  finishedAt: string;
  drafter: string;
  feeds: { ok: number; failed: Array<{ sourceId: string; error: string }>; newSignals: number; droppedItems: number };
  stories: { total: number; aboveHeat: number };
  decisions: StoryDecision[];
  resolutions: Array<{ slug: string; state: string; outcome?: "yes" | "no" }>;
  usage: DraftUsage;
}

/** Priority in the queue: heat, plus a bonus when the question can settle itself from official data. */
export function priorityOf(story: Story, resolver: Resolver): number {
  return Math.min(100, story.heat + (resolver.kind === "manual" ? 0 : 15));
}

/** Hottest first, at most `perCategory` per category hint, at most `max` overall. */
export function pickStories(stories: readonly Story[], max: number, perCategory: number): Story[] {
  const counts = new Map<string, number>();
  const picked: Story[] = [];
  for (const story of stories) {
    if (picked.length >= max) break;
    const key = story.categoryHint ?? "other";
    if ((counts.get(key) ?? 0) >= perCategory) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    picked.push(story);
  }
  return picked;
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function runCycle(deps: CycleDeps): Promise<CycleReport> {
  const cfg = { ...DEFAULT_CYCLE, ...deps.config };
  const { store, drafter, now } = deps;
  const startedAt = new Date().toISOString();
  const usage: DraftUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

  // 1. Ingest
  const results = await deps.ingest();
  let newSignals = 0;
  for (const r of results) newSignals += await store.addSignals(r.signals);
  const feeds = {
    ok: results.filter((r) => !r.error).length,
    failed: results.filter((r) => r.error).map((r) => ({ sourceId: r.sourceId, error: r.error! })),
    newSignals,
    droppedItems: results.reduce((n, r) => n + r.dropped, 0),
  };

  // 2. Cluster
  const recent = await store.recentSignals(new Date(now.getTime() - cfg.lookbackHours * 3_600_000));
  const stories = clusterSignals(recent, now);
  const hot = stories.filter((s) => s.heat >= cfg.minHeat);

  // 3. Screen, skipping stories already handled
  const decisions: StoryDecision[] = [];
  const candidates: Story[] = [];
  for (const story of hot) {
    if (await store.wasDrafted(story.id)) continue;
    const flags = screenStory(story);
    if (isBlocked(flags)) {
      decisions.push({ storyId: story.id, headline: story.headline, heat: story.heat, decision: "blockedStory", flags });
      await store.markDrafted(story.id, "blockedStory", now);
    } else {
      candidates.push(story);
    }
  }

  // 4–7. Pick, draft, check, queue
  const picked = pickStories(candidates, cfg.maxDrafts, cfg.perCategory);
  const existing = await store.comparables();
  const outcomes = await mapLimit(picked, cfg.concurrency, (story) =>
    drafter.draft(story, { now, releases: deps.releases, existing: existing.map((c) => c.question.en) }).then((o) => ({ story, o })),
  );

  for (const { story, o } of outcomes) {
    if (o.usage) {
      usage.inputTokens += o.usage.inputTokens;
      usage.outputTokens += o.usage.outputTokens;
      usage.cacheReadTokens += o.usage.cacheReadTokens;
    }
    const base = { storyId: story.id, headline: story.headline, heat: story.heat };
    if (o.status === "error") {
      // Not marked as drafted: the next cycle retries it.
      decisions.push({ ...base, decision: "error", reason: o.reason });
      continue;
    }
    await store.markDrafted(story.id, o.status, now);
    if (o.status === "skip") {
      decisions.push({ ...base, decision: "skipped", reason: o.reason });
      continue;
    }

    const flags = [...screenDraft(o.draft), ...validateDraft(o.draft, now)];
    const dup = findDuplicate(o.draft, [...existing, ...(await store.comparables()).filter((c) => !existing.includes(c))]);
    if (dup) flags.push(duplicateFlag(dup));

    const item = newItem({
      id: `${o.draft.slug}--${story.id}`,
      storyId: story.id,
      draft: o.draft,
      flags,
      provenance: story.signals.map((s) => s.url),
      priority: priorityOf(story, o.draft.resolver),
      drafter: o.drafter,
      at: now,
    });
    await store.putItem(item);
    decisions.push({ ...base, decision: item.status === "autoRejected" ? "autoRejected" : "queued", itemId: item.id, flags });
  }

  // 8. Resolve
  const resolutions: CycleReport["resolutions"] = [];
  if (deps.http) {
    for (const item of await store.items()) {
      if (item.status !== "published") continue;
      if (Date.parse(item.draft.resolution.resolvesAt) > now.getTime()) continue;
      const record = (await store.getResolution(item.draft.slug)) ?? newRecord(item.draft.slug);
      if (record.state === "resolved" || record.state === "needsEditor") continue;
      const read = await readResolver(item.draft.resolver, deps.http, now);
      const next = applyRead(record, read, now, item.draft.resolver.kind === "manual");
      await store.putResolution(next);
      resolutions.push({ slug: next.slug, state: next.state, ...(next.outcome ? { outcome: next.outcome } : {}) });
    }
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    drafter: drafter.id,
    feeds,
    stories: { total: stories.length, aboveHeat: hot.length },
    decisions,
    resolutions,
    usage,
  };
}

/** A question as the site shows it, minus the crowd (FORGE's data layer joins calls on). */
export type PublishedQuestion = Pick<Question, "slug" | "category" | "question" | "scored" | "closesAt"> & {
  resolution: Omit<Question["resolution"], "result"> & { result?: NonNullable<Question["resolution"]["result"]> };
  resolver: Resolver;
  /** Signal URLs the question was written from, for the public log. */
  provenance: string[];
  /** "AI-drafted, editor-approved": disclosed on the methodology page (LEX: AI features are disclosed). */
  drafter: string;
  approvedBy: string;
};

export function toPublished(item: QueueItem, result?: ReturnType<typeof toResult>): PublishedQuestion {
  const approval = [...item.history].reverse().find((h) => h.to === "approved");
  return {
    slug: item.draft.slug,
    category: item.draft.category,
    question: item.draft.question,
    scored: item.draft.scored,
    closesAt: item.draft.closesAt,
    resolution: { ...item.draft.resolution, ...(result ? { result } : {}) },
    resolver: item.draft.resolver,
    provenance: item.provenance,
    drafter: item.drafter,
    approvedBy: approval?.actor ?? "unknown",
  };
}

/** Publishes every approved item. Returns the questions that went live. */
export async function publishApproved(store: EngineStore, now: Date): Promise<PublishedQuestion[]> {
  const live: PublishedQuestion[] = [];
  for (const item of await store.items()) {
    if (item.status !== "approved") continue;
    const published = publish(item, now);
    await store.putItem(published);
    live.push(toPublished(published));
  }
  return live;
}
