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
import { duplicateFlag, findDuplicate, type Comparable } from "@/engine/dedup";
import { AREA_NAMES, checkFlag, DEFAULT_THRESHOLD, describeCheck, type CheckOutcome, type Checker } from "@/engine/check/checker";
import { calendarStories, deskFor, DESKS, type Desk } from "@/engine/draft/desks";
import type { DraftUsage, Drafter } from "@/engine/draft/drafter";
import { explainItem } from "@/engine/explain";
import { isIdea } from "@/engine/ideas";
import { resolveDue, type ResolveStep } from "@/engine/resolve/due";
import type { toResult } from "@/engine/resolve/policy";
import type { Http } from "@/engine/resolve/resolvers";
import { approve, newItem, publish } from "@/engine/review";
import { isBlocked, screenDraft, screenStory } from "@/engine/safety/safety";
import type { Release } from "@/engine/sources/calendar";
import type { FeedResult } from "@/engine/sources/feed";
import type { EngineStore } from "@/engine/store";
import { BIG_EVENTS, eventFor, eventStories, type BigEvent } from "@/engine/sources/events";
import { clusterSignals } from "@/engine/stories";
import type { CheckArea, CheckResult, Draft, Flag, QueueItem, Resolver, Spotlight, Story } from "@/engine/types";
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
  /** A desk with fewer than this many open questions on the site in one of its categories gets an extra share. */
  thinBelow: number;
  /**
   * Most questions from trending searches queued per run (zack, 2026-11-25: trending is good, but it mustn't hog the
   * spotlight). A trending story past the cap waits for a later run.
   */
  trendingPerRun: number;
}

/** The engine's name in a review history when it approves a draft by itself. */
export const AUTO_EDITOR = "pulse-auto";
/** Stricter line for the areas LEX cares most about: above this, a person decides even under the flag line. */
export const AUTO_STRICT = 4;
/** Review flags the engine may acknowledge by itself. Every other review flag (sports, elections, minors, disaster,
 * trading words, a missing threshold, a poll, a long gap to the result) keeps the draft for a person. */
const AUTO_OK_FLAGS = new Set(["manualResolver"]);
/** Blocking problems a writer can fix in a second try: dates, sports timing, the source link, French spacing. */
/**
 * Review flags a writer can fix the same way (2026-11-26: the test run kept 7 drafts and only 2 went live). Each one
 * stops auto-approval, yet each is wording only: a rule that doesn't open "Resolves YES if…", EN and FR carrying
 * different numbers, a question over the length limit. The writer gets them back once, like the blocks below, so a
 * good question isn't left waiting for a person over a phrasing slip. The approval rule itself doesn't change.
 */
const FIXABLE_REVIEW = new Set(["frRuleOpening", "enRuleOpening", "numbersDiffer.question", "numbersDiffer.rule", "long.en", "long.fr", "thresholdNotInRule"]);
const FIXABLE = new Set(["closesTooSoon", "closesTooLate", "closesAfterResult", "sportsNoStart", "sportsClosesAfterStart", "sportsStartsAfterResult", "sourceNotOfficial", "sourceNotHttps", "frTypography", "resolverAfterResult", "resolverRange", "thresholdNotInRule"]);
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
  // 10, not 15 (2026-11-26): the 10 AM run found too little to write. A story one outlet reported overnight is
  // 12–16 hours old by morning and had cooled under 15, so the morning run saw only the few stories it hadn't done.
  minHeat: 10,
  maxDrafts: 24,
  perDesk: 4,
  deskAttempts: 6,
  lookbackHours: 48,
  deadlineMs: 150_000,
  checkThreshold: DEFAULT_THRESHOLD,
  autoApprove: false,
  calendarPerDesk: 1,
  lanesPerDesk: 2,
  thinBelow: 3,
  trendingPerRun: 2,
};

export interface CycleDeps {
  /** Big dates the events scout writes about (see `sources/events.ts`). Defaults to the checked list. */
  events?: readonly BigEvent[];
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
  /**
   * Write only these stories (the editor's own ideas, `ideas.ts`): no feeds, no calendar, no resolving. They still go
   * through every screen, check and approval rule.
   */
  only?: readonly Story[];
  /**
   * Called the moment a draft is approved automatically, so it can go live right away instead of at the end of the
   * run. A run that runs out of time then loses nothing it already approved. A failure here is reported, never thrown.
   */
  onApproved?: (item: QueueItem) => Promise<void>;
}

/** Questions a person approved (not the automatic approver), newest first: the style the editor likes. */
export function likedQuestions(items: readonly QueueItem[], max = 12): string[] {
  const approvedAt = (i: QueueItem) => i.history.filter((e) => e.to === "approved" && e.actor !== AUTO_EDITOR).at(-1)?.at;
  return items
    .filter((i) => approvedAt(i))
    .sort((a, b) => approvedAt(b)!.localeCompare(approvedAt(a)!))
    .slice(0, max)
    .map((i) => i.draft.question.en);
}

/**
 * What held recent drafts back, so the writers learn from it (zack, 2026-11-26: "we gotta learn and adapt … train our
 * engine"). Looks at the last few days of drafts that didn't go live on their own: the flags that stopped them, the
 * checker area that scored too high, the questions an editor turned down (with the editor's note). Returns the most
 * common reasons first, each once, worded for the writer. Every run reads it fresh, so the lessons follow what the
 * engine gets wrong now, and a mistake it stops making drops off by itself. The approval rule doesn't change.
 */
export function heldLessons(items: readonly QueueItem[], now: Date, max = 6, days = 3): string[] {
  const since = now.getTime() - days * 86_400_000;
  const counts = new Map<string, { n: number; text: string }>();
  const add = (key: string, text: string) => {
    const seen = counts.get(key);
    counts.set(key, { n: (seen?.n ?? 0) + 1, text: seen?.text ?? text });
  };
  const ignore = new Set([...AUTO_OK_FLAGS, "sports", "check-risk", "check-unavailable"]);
  for (const item of items) {
    if (Date.parse(item.createdAt) < since) continue;
    const byPerson = item.history.filter((e) => e.actor !== AUTO_EDITOR && e.actor !== "engine" && (e.to === "rejected" || e.to === "needsChanges")).at(-1);
    if (byPerson) {
      add(`editor:${item.id}`, `The editor turned down "${item.draft.question.en}"${byPerson.note ? `: ${byPerson.note}` : ""}. Don't write it again or anything like it.`);
      continue;
    }
    if (item.status === "published" || item.status === "approved") continue;
    for (const f of item.flags) if (!ignore.has(f.code)) add(`flag:${f.code}`, f.code === "duplicate" ? "Repeated a question already on the site. Check the existing list first and pick a different angle." : f.detail);
    if (item.check) {
      const [area, top] = (Object.entries(item.check.scores) as [CheckArea, { score: number; reason: string }][]).sort((a, b) => b[1].score - a[1].score)[0] ?? [];
      if (area && top && top.score > AUTO_STRICT) add(`check:${area}`, `The risk checker rated "${AREA_NAMES[area]}" ${top.score}/10: ${top.reason}`);
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((c) => (c.n > 1 ? `${c.text} (${c.n} times)` : c.text));
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
  // Breaking news first (written while it's still news), then the hottest.
  const byHeat = [...news].sort((a, b) => Number(b.breaking ?? false) - Number(a.breaking ?? false) || b.heat - a.heat);
  return desks.map((desk) => ({
    desk,
    stories: [...byHeat.filter((s) => deskFor(s, desks).id === desk.id), ...backfill.filter((s) => deskFor(s, desks).id === desk.id).slice(0, calendarPerDesk)],
  }));
}

/** How big a breaking story stays in the board's eyes, at least. */
const BREAKING_SIZE = 80;
/** A big date's own story, at least. */
const EVENT_SIZE = 60;
/** A dated official release with no news behind it. */
const CALENDAR_SIZE = 20;

/** How the board should rank and tag a question from this story (publishedAt is filled when it goes live). */
export function spotlightOf(story: Story, now: Date): Spotlight {
  const calendar = story.signals.length > 0 && story.signals.every((s) => s.kind === "calendar");
  const size = Math.max(story.heat, story.breaking ? BREAKING_SIZE : 0, story.event ? EVENT_SIZE : 0, calendar ? CALENDAR_SIZE : 0);
  return {
    newsSize: Math.round(Math.min(100, size)),
    ...(story.breaking ? { breakingUntil: new Date(now.getTime() + 6 * 3_600_000).toISOString() } : {}),
    ...(story.trending ? { trending: true as const } : {}),
    ...(story.event ? { event: story.event } : {}),
  };
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
  // The start limit counts from here, feeds included: the function has 300 s in all, and a writer plus its check can
  // take two minutes after it starts.
  const clockStart = Date.now();
  const usage: DraftUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

  // 1. Ingest
  const results = deps.only ? [] : await deps.ingest();
  let newSignals = 0;
  for (const r of results) newSignals += await store.addSignals(r.signals);
  const feeds = {
    ok: results.filter((r) => !r.error).length,
    failed: results.filter((r) => r.error).map((r) => ({ sourceId: r.sourceId, error: r.error! })),
    newSignals,
    droppedItems: results.reduce((n, r) => n + r.dropped, 0),
  };

  // 2. Cluster
  const recent = deps.only ? [] : await store.recentSignals(new Date(now.getTime() - cfg.lookbackHours * 3_600_000));
  const events = deps.events ?? BIG_EVENTS;
  // News about a big date joins its group; the events scout adds a story a day for each date coming up.
  const stories = deps.only
    ? [...deps.only]
    : [
        ...clusterSignals(recent, now).map((s) => {
          const e = eventFor(s, now, events);
          return e ? { ...s, event: { id: e.id, name: e.name, at: e.at } } : s;
        }),
        ...eventStories(now, deps.desks ?? DESKS, events),
      ];
  const hot = stories.filter((s) => s.heat >= cfg.minHeat);

  // 3. Screen, skipping stories already handled
  const decisions: StoryDecision[] = [];
  const candidates: Story[] = [];
  for (const story of hot) {
    // An idea the editor typed again is a fresh request, so it's written again.
    if (!isIdea(story) && (await store.wasDrafted(story.id))) continue;
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
  const backlog = deps.only ? [] : await undrafted(store, calendarStories(deps.releases, now, desks));
  const items = await store.items();
  const liked = likedQuestions(items);
  const lessons = heldLessons(items, now);
  // Variety (zack, 2026-11-25: "every category being filled, a variety of everything"). Count the engine's open
  // questions on the site by category; a desk whose category is thin gets an extra share of the run, and a desk with
  // two categories asks each try for whichever of them is thinnest, so one easy beat (weather) can't crowd out the rest.
  const open = new Map<Draft["category"], number>();
  for (const i of items) if (i.status === "published" && Date.parse(i.draft.closesAt) > now.getTime()) open.set(i.draft.category, (open.get(i.draft.category) ?? 0) + 1);
  const thin = (d: Desk) => d.categories.some((c) => (open.get(c) ?? 0) < cfg.thinBelow);
  const shareOf = (d: Desk) => (d.share ?? 1) + (thin(d) ? 1 : 0);
  const plan = planDesks(candidates, backlog, desks, cfg.calendarPerDesk);
  const existing = await store.comparables();
  const known = existing.map((c) => c.question.en);
  const budget = { left: cfg.maxDrafts };
  /** Drafts this run has kept so far. Lanes write side by side, so a twin finished by another lane is caught here. */
  const claimed: Comparable[] = [];
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
  const shares = busy.reduce((n, p) => n + shareOf(p.desk), 0);
  const slice = new Map(busy.map((p) => [p.desk.id, Math.floor((cfg.maxDrafts * shareOf(p.desk)) / Math.max(1, shares))]));
  const state = new Map(plan.map((p) => [p.desk.id, { next: 0, queued: 0, attempts: 0, inflight: 0 }]));

  const trending = { queued: 0, inflight: 0 };
  /** Tries this run that asked for each category, so a two-category desk alternates instead of piling onto one. */
  const asked = new Map<Draft["category"], number>();
  const thinnest = (desk: Desk) =>
    [...desk.categories].sort((a, b) => (open.get(a) ?? 0) + (asked.get(a) ?? 0) - ((open.get(b) ?? 0) + (asked.get(b) ?? 0)))[0];
  const runDesk = async (desk: Desk, stories: readonly Story[], cap: number) => {
    const st = state.get(desk.id)!;
    const share = shareOf(desk);
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
      // Trending is capped per run, so it can't crowd out the news. The story isn't marked drafted: a later run can use it.
      // Lanes write side by side, so tries still in flight count too (like the desk targets).
      if (story.trending && trending.queued + trending.inflight >= cfg.trendingPerRun) continue;
      budget.left--;
      st.attempts++;
      // The 1st, 4th, 7th… try at each desk asks for a fast question (closing within 7 days), so about a third of every
      // run settles within the week and even a quiet desk gives one.
      const fast = st.attempts % 3 === 1;
      const category = desk.categories.length > 1 ? thinnest(desk) : undefined;
      if (category) asked.set(category, (asked.get(category) ?? 0) + 1);
      st.inflight++;
      try {
        if (story.trending) trending.inflight++;
        try {
          if (await draftOne(desk, story, fast, category)) {
            st.queued++;
            if (story.trending) trending.queued++;
          }
        } finally {
          if (story.trending) trending.inflight--;
        }
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
  const draftOne = async (desk: Desk, story: Story, fast: boolean, category?: Draft["category"]): Promise<boolean> => {
    {
      const ctx = {
        now,
        releases: deps.releases,
        existing: known,
        // A breaking story asks for a question about what happens next, which is a fast one.
        fast: fast || story.breaking === true,
        liked,
        lessons,
        idea: isIdea(story),
        ...(category ? { category } : {}),
        ...(story.breaking ? { breaking: true } : {}),
        ...(story.event ? { event: story.event } : {}),
      };
      let o = await drafter.draft(story, ctx);
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

      let flags = [...screenDraft(o.draft), ...validateDraft(o.draft, now)];
      // One repair try (zack, 2026-11-25: good questions were set aside over a date or a source). When the only
      // blocking problems are ones a writer can fix, it gets them back once and rewrites. Safety blocks never get one.
      const blocks = flags.filter((f) => f.severity === "block");
      const fixable = [...blocks, ...flags.filter((f) => FIXABLE_REVIEW.has(f.code))];
      if (fixable.length > 0 && blocks.every((f) => FIXABLE.has(f.code)) && budget.left > 0) {
        budget.left--;
        const again = await drafter.draft(story, { ...ctx, repair: { question: o.draft.question.en, problems: fixable.map((f) => f.detail) } });
        add(again.usage);
        if (again.status === "draft") {
          o = again;
          flags = [...screenDraft(o.draft), ...validateDraft(o.draft, now)];
        }
      }
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

      // Read and claim with no await in between, so two lanes can't both keep the same question.
      if (!flags.some((f) => f.code === "duplicate")) {
        const twin = findDuplicate(o.draft, claimed);
        if (twin) flags.push(duplicateFlag(twin));
      }
      if (!isBlocked(flags)) claimed.push({ slug: o.draft.slug, question: o.draft.question, resolver: o.draft.resolver });

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
      const item: QueueItem = { ...reviewed, why, desk: base.desk, spotlight: spotlightOf(story, now), ...(check?.ok ? { check: check.result } : {}) };
      await store.putItem(item);
      if (auto && deps.onApproved) await deps.onApproved(item).catch(() => undefined);
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
  const resolutions: CycleReport["resolutions"] = deps.http && !deps.only ? await resolveDue(due, store, deps.http, now) : [];

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
