/**
 * One engine cycle. A scheduler calls `runCycle` every 15 minutes (see `src/app/api/engine/cycle/route.ts`).
 *
 *   1. Ingest: fetch every feed, keep new signals.
 *   2. Cluster: group the last 48 hours of signals into stories and score their heat.
 *   3. Screen: drop stories about deaths, violence, crime or private lives before any model call.
 *   4. Plan: five writing desks (economy and business; provinces, cities and housing; weather and science; culture
 *      and trends; sports), fed by six news scouts (`sources/registry.ts`), each take their own stories, hottest
 *      first, then the official release calendar when the news runs thin.
 *   5. Draft: each desk drafts until it has queued its target (4 per cycle) or tried its limit, under a hard cap on
 *      writer calls per cycle (and per day, in `run.ts`) and a time limit, so cost and run time stay predictable.
 *   6. Check: safety screen, structural validation and dedup on every draft. Blocked drafts are kept but never shown.
 *      Then the risk checker rates every draft an editor could see, 1–10 in five areas; at or over the line it is
 *      flagged and listed in the cycle's alerts (emailed by `run.ts`).
 *   7. Queue: low-risk drafts are approved automatically when auto-approve is on (`autoApprovable`); everything else
 *      waits for an editor.
 *   8. Resolve: read the official source for published questions whose result is due.
 *
 * Only `publishApproved` publishes, and only approved items.
 */
import type { Question } from "@/lib/question";
import { duplicateFlag, findDuplicate } from "@/engine/dedup";
import { checkFlag, DEFAULT_THRESHOLD, describeCheck, type CheckOutcome, type Checker } from "@/engine/check/checker";
import { calendarStories, deskFor, DESKS, type Desk } from "@/engine/draft/desks";
import type { DraftUsage, Drafter } from "@/engine/draft/drafter";
import { explainItem } from "@/engine/explain";
import { resolveDue, type ResolveStep } from "@/engine/resolve/due";
import type { toResult } from "@/engine/resolve/policy";
import type { Http } from "@/engine/resolve/resolvers";
import { approve, newItem, publish } from "@/engine/review";
import { isBlocked, screenDraft, screenStory } from "@/engine/safety/safety";
import type { Release } from "@/engine/sources/calendar";
import type { FeedResult } from "@/engine/sources/feed";
import type { EngineStore } from "@/engine/store";
import { clusterSignals } from "@/engine/stories";
import type { CheckResult, Draft, Flag, QueueItem, Resolver, Story } from "@/engine/types";
import { validateDraft } from "@/engine/validate";

export interface CycleConfig {
  /** Stories cooler than this aren't worth a question yet. */
  minHeat: number;
  /** Most writer calls per cycle, across all desks. The hard cost cap. */
  maxDrafts: number;
  /** Supply target: each desk stops once it has queued this many questions in a cycle. */
  perDesk: number;
  /** Most stories one desk tries per cycle (declines count), so one desk can't spend the whole budget. */
  deskAttempts: number;
  /** How far back signals count toward a story. */
  lookbackHours: number;
  /** Desks stop starting new drafts after this long, so the run finishes inside the host's time limit. */
  deadlineMs: number;
  /** The checker's flag line: a draft whose highest risk score reaches this (1–10) is flagged and emailed. */
  checkThreshold: number;
  /** zack's switch (ENGINE_AUTO_APPROVE, on in production by default): approve drafts that pass `autoApprovable`. */
  autoApprove: boolean;
  /**
   * Most release-calendar stories a desk may write per run, after its news (zack, 2026-11-25: too many questions were
   * data releases). The news people are talking about comes first; the calendar only tops up a quiet desk.
   */
  calendarPerDesk: number;
  /** Writers working at once per desk (times the desk's share). */
  lanesPerDesk: number;
}

/** The engine's name in a review history when it approves a draft by itself. */
export const AUTO_EDITOR = "pulse-auto";
/** Stricter line for the areas LEX cares most about: above this, a person decides even under the flag line. */
export const AUTO_STRICT = 4;
/** Review flags the engine may acknowledge by itself. Every other review flag (sports, elections, minors, disaster,
 * trading words, a missing threshold, a poll, a long gap to the result) keeps the draft for a person. */
const AUTO_OK_FLAGS = new Set(["manualResolver"]);
/**
 * Sports (zack, 2026-11-25: "yes auto approve"): a sports draft may go live by itself when its only extra flag is the
 * standing "sports" reminder and the checker rates gambling feel at 2 or less, stricter than other topics. LEX's
 * sports rules still hold through the fixed checks: pre-game only (closes by the start), no sportsbook-style wording
 * (the sports word list flags it for a person), official result sources only.
 */
export const SPORTS_STRICT = 2;

/**
 * Whether the engine may approve a draft without a person (only when zack's switch is on). All of these must hold:
 * it passed every fixed check with no blocking flag; its only review flags are on the short list above; it isn't
 * a risky sports draft (see SPORTS_STRICT); the checker rated it, every area under the flag line, and legal,
 * gambling and sensitive at 4 or less. Anything else waits in the queue and, when risky, in the email.
 */
export function autoApprovable(item: QueueItem, check: CheckOutcome | undefined, threshold: number): boolean {
  if (item.status !== "pending") return false;
  const sports = item.draft.category === "sports";
  if (item.flags.some((f) => f.severity === "block" || !(AUTO_OK_FLAGS.has(f.code) || (sports && f.code === "sports")))) return false;
  if (!check?.ok) return false;
  const { scores, overall } = check.result;
  const strict = sports ? SPORTS_STRICT : AUTO_STRICT;
  return overall < threshold && scores.legal.score <= AUTO_STRICT && scores.gambling.score <= strict && scores.sensitive.score <= AUTO_STRICT;
}

export const DEFAULT_CYCLE: CycleConfig = {
  minHeat: 15,
  maxDrafts: 24,
  perDesk: 4,
  deskAttempts: 6,
  lookbackHours: 48,
  deadlineMs: 170_000,
  checkThreshold: DEFAULT_THRESHOLD,
  autoApprove: false,
  calendarPerDesk: 1,
  lanesPerDesk: 2,
};

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
  /** Rates each queued draft's risk. Leave out to skip the check (mock runs, tests). */
  checker?: Checker;
  /** The writing desks. Defaults to the five in `draft/desks.ts`. */
  desks?: readonly Desk[];
}

type DecisionBase = { storyId: string; headline: string; heat: number; desk?: string };
export type StoryDecision =
  | (DecisionBase & { decision: "blockedStory"; flags: Flag[] })
  | (DecisionBase & { decision: "skipped"; reason: string })
  | (DecisionBase & { decision: "error"; reason: string })
  | (DecisionBase & { decision: "queued" | "autoRejected"; itemId: string; flags: Flag[]; why: string; autoApproved?: boolean });

export interface CycleReport {
  startedAt: string;
  finishedAt: string;
  drafter: string;
  feeds: { ok: number; failed: Array<{ sourceId: string; error: string }>; newSignals: number; droppedItems: number };
  stories: { total: number; aboveHeat: number };
  decisions: StoryDecision[];
  resolutions: ResolveStep[];
  usage: DraftUsage;
  /** Queued drafts the checker rated at or over the threshold, or couldn't rate. These go in the alert email. */
  alerts: CycleAlert[];
  /** The flag line used this cycle (1–10). */
  threshold: number;
}

export interface CycleAlert {
  itemId: string;
  desk: string;
  draft: Draft;
  check?: CheckResult;
  checkError?: string;
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

/**
 * Each desk's reading list for this cycle: its own news stories, hottest first, then calendar backfill. Desks run in
 * parallel and each works down its own list, so a quiet beat still gets its turn and a busy one can't take them all.
 */
export function planDesks(news: readonly Story[], backfill: readonly Story[], desks: readonly Desk[] = DESKS, calendarPerDesk = DEFAULT_CYCLE.calendarPerDesk): Array<{ desk: Desk; stories: Story[] }> {
  const byHeat = [...news].sort((a, b) => b.heat - a.heat);
  return desks.map((desk) => ({
    desk,
    stories: [...byHeat.filter((s) => deskFor(s, desks).id === desk.id), ...backfill.filter((s) => deskFor(s, desks).id === desk.id).slice(0, calendarPerDesk)],
  }));
}

async function undrafted(store: EngineStore, stories: readonly Story[]): Promise<Story[]> {
  const out: Story[] = [];
  for (const s of stories) if (!(await store.wasDrafted(s.id))) out.push(s);
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

  // 4–7. Each desk drafts its hottest stories until it meets its target, then checks and queues them.
  const desks = deps.desks ?? DESKS;
  const backlog = await undrafted(store, calendarStories(deps.releases, now, desks));
  const plan = planDesks(candidates, backlog, desks, cfg.calendarPerDesk);
  const existing = await store.comparables();
  const known = existing.map((c) => c.question.en);
  const budget = { left: cfg.maxDrafts };
  const clockStart = Date.now();
  const alerts: CycleAlert[] = [];
  const add = (u?: DraftUsage) => {
    if (!u) return;
    usage.inputTokens += u.inputTokens;
    usage.outputTokens += u.outputTokens;
    usage.cacheReadTokens += u.cacheReadTokens;
  };

  // Each desk's share of the run (zack, 2026-11-25: lean into pop culture). A desk with a bigger share gets a bigger
  // slice of the writer calls and a higher target; desks with nothing to write don't hold a slice.
  const busy = plan.filter((p) => p.stories.length > 0);
  const shares = busy.reduce((n, p) => n + (p.desk.share ?? 1), 0);
  const slice = new Map(busy.map((p) => [p.desk.id, Math.floor((cfg.maxDrafts * (p.desk.share ?? 1)) / Math.max(1, shares))]));
  const state = new Map(plan.map((p) => [p.desk.id, { next: 0, queued: 0, attempts: 0, inflight: 0 }]));

  const runDesk = async (desk: Desk, stories: readonly Story[], cap: number) => {
    const st = state.get(desk.id)!;
    const share = desk.share ?? 1;
    // Each desk writes on a few lanes at once (zack, 2026-11-25: about 10 good questions a run). One writer call plus
    // its check takes about a minute, so one lane per desk managed only two or three tries before the start limit.
    // The lanes share the desk's counters, which are read and bumped before any await, so the caps still hold.
    await Promise.all(Array.from({ length: Math.max(1, cfg.lanesPerDesk * share) }, () => lane(desk, stories, cap, st, share)));
  };
  const lane = async (desk: Desk, stories: readonly Story[], cap: number, st: { next: number; queued: number; attempts: number; inflight: number }, share: number) => {
    while (st.next < stories.length) {
      if (st.queued + st.inflight >= cfg.perDesk * share || st.attempts >= Math.min(cap, cfg.deskAttempts * share) || budget.left <= 0) break;
      if (Date.now() - clockStart > cfg.deadlineMs) break;
      const story = stories[st.next++]!;
      budget.left--;
      st.attempts++;
      // The 1st, 4th, 7th… try at each desk asks for a fast question (closing within 7 days), so about a third of every
      // run settles within the week and even a quiet desk gives one.
      const fast = st.attempts % 3 === 1;
      st.inflight++;
      try {
        if (await draftOne(desk, story, fast)) st.queued++;
      } catch (err) {
        // A hiccup saving one story (Supabase busy, a network blip) costs that story only: the desk moves on, the other
        // desks never notice, and the story isn't marked drafted, so the next run tries it again.
        decisions.push({ storyId: story.id, headline: story.headline, heat: story.heat, desk: desk.id, decision: "error", reason: err instanceof Error ? err.message : String(err) });
      } finally {
        st.inflight--;
      }
    }
  };
  /** Drafts, checks and saves one story. True when it joined the queue. */
  const draftOne = async (desk: Desk, story: Story, fast: boolean): Promise<boolean> => {
    {
      const o = await drafter.draft(story, { now, releases: deps.releases, existing: known, fast });
      add(o.usage);
      const base = { storyId: story.id, headline: story.headline, heat: story.heat, desk: o.desk ?? desk.id };
      if (o.status === "error") {
        // Not marked as drafted: the next cycle retries it.
        decisions.push({ ...base, decision: "error", reason: o.reason });
        return false;
      }
      await store.markDrafted(story.id, o.status, now);
      if (o.status === "skip") {
        decisions.push({ ...base, decision: "skipped", reason: o.reason });
        return false;
      }

      const flags = [...screenDraft(o.draft), ...validateDraft(o.draft, now)];
      const dup = findDuplicate(o.draft, [...existing, ...(await store.comparables()).filter((c) => !existing.includes(c))]);
      if (dup) flags.push(duplicateFlag(dup));

      // The checker reads only drafts an editor could see; a blocked draft is never shown, so it isn't worth a call.
      let check: CheckOutcome | undefined;
      if (deps.checker && !isBlocked(flags)) {
        check = await deps.checker.check(o.draft, story, now);
        add(check.usage);
        const flag = checkFlag(check, cfg.checkThreshold);
        if (flag) flags.push(flag);
      }

      const drafted = newItem({
        id: `${o.draft.slug}--${story.id}`,
        storyId: story.id,
        draft: o.draft,
        flags,
        provenance: story.signals.map((s) => s.url),
        priority: priorityOf(story, o.draft.resolver),
        drafter: o.drafter,
        at: now,
      });
      const explained = explainItem({ story, draft: o.draft, flags, status: drafted.status, priority: drafted.priority });
      const auto = cfg.autoApprove && autoApprovable(drafted, check, cfg.checkThreshold);
      const why = [
        explained,
        ...(check ? [describeCheck(check, cfg.checkThreshold)] : []),
        ...(auto ? [`Auto-approved: every risk score under ${cfg.checkThreshold}, legal, gambling and sensitive at ${AUTO_STRICT} or less, and no flag that needs a person.`] : []),
      ].join(" ");
      const reviewed = auto ? approve(drafted, AUTO_EDITOR, now, flags.filter((f) => f.severity === "review").map((f) => f.code)) : drafted;
      const item: QueueItem = { ...reviewed, why, desk: base.desk, ...(check?.ok ? { check: check.result } : {}) };
      await store.putItem(item);
      decisions.push({ ...base, decision: item.status === "autoRejected" ? "autoRejected" : "queued", itemId: item.id, flags, why, ...(auto ? { autoApproved: true } : {}) });
      if (item.status === "autoRejected") return false;
      known.push(o.draft.question.en);
      if (check && (!check.ok || check.result.overall >= cfg.checkThreshold)) {
        alerts.push({ itemId: item.id, desk: base.desk, draft: o.draft, ...(check.ok ? { check: check.result } : { checkError: check.reason }) });
      }
      return true;
    }
  };
  // First pass: every desk writes within its slice, in parallel. Second pass: whatever a quiet desk didn't use goes
  // to the desks that still have stories, so the run still makes its full count.
  await Promise.all(plan.map(({ desk, stories }) => runDesk(desk, stories, slice.get(desk.id) ?? 0)));
  if (budget.left > 0) await Promise.all(plan.map(({ desk, stories }) => runDesk(desk, stories, Infinity)));

  // 8. Resolve
  const due = (await store.items())
    .filter((item) => item.status === "published")
    .map((item) => ({ slug: item.draft.slug, resolver: item.draft.resolver, resolvesAt: item.draft.resolution.resolvesAt }));
  const resolutions: CycleReport["resolutions"] = deps.http ? await resolveDue(due, store, deps.http, now) : [];

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    drafter: drafter.id,
    feeds,
    stories: { total: stories.length, aboveHeat: hot.length },
    decisions,
    resolutions,
    usage,
    alerts,
    threshold: cfg.checkThreshold,
  };
}

/** A question as the site shows it, minus the crowd (FORGE's data layer joins calls on). */
export type PublishedQuestion = Pick<Question, "slug" | "category" | "question" | "scored" | "closesAt" | "startsAt"> & {
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
    ...(item.draft.startsAt ? { startsAt: item.draft.startsAt } : {}),
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
