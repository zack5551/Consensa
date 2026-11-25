/**
 * Wires a cycle from the environment: live or sample feeds, Claude or the mock drafter. Kept apart from the route
 * so the same wiring serves the scheduler, scripts and tests.
 */
import { ClaudeChecker, type Checker } from "@/engine/check/checker";
import { DeskTeam } from "@/engine/draft/desks";
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
import { COST_PER_CALL, summaryEmail } from "@/engine/notify/digest";
import type { Mailer } from "@/engine/notify/ses";
import type { Comparable } from "@/engine/dedup";
import type { Story } from "@/engine/types";

export interface RunOptions {
  apiKey?: string;
  /** Write only these stories (the editor's ideas from the review page). See `CycleDeps.only`. */
  only?: readonly Story[];
  liveFeeds: boolean;
  maxDrafts: number;
  /** Most writer calls per Toronto day, across runs. Leave out for no daily cap. */
  dailyDrafts?: number;
  /** Stop drafting once this month's estimated spend (writer calls x COST_PER_CALL) reaches this, in US$. */
  monthlyBudgetUsd?: number;
  now: Date;
  /** Without a store (no Supabase keys), each run gets a fresh in-memory store: a dry run that reports what it would queue. */
  store?: EngineStore;
  live?: readonly Comparable[];
  /** Vercel deploy hook: called when a result lands (and, without `onPublished`, when a question goes live). */
  deployHook?: string;
  /**
   * Called with the slugs that went live this run. The site reads live questions at request time, so the route uses
   * this to refresh its cache instead of rebuilding the whole site for each new question.
   */
  onPublished?: (slugs: readonly string[]) => Promise<void> | void;
  fetch?: typeof fetch;
  /**
   * Automatic results for the site's hand-written questions (see `site-results.ts`). Runs on every cycle, with or
   * without the paid drafter: it only reads free official data. Needs a store that persists between cycles, because
   * a result is confirmed by two reads on separate cycles.
   */
  results?: { questions: readonly DueQuestion[]; store: Pick<EngineStore, "getResolution" | "putResolution">; now: Date };
  /** The checker's flag line, 1–10. */
  checkThreshold?: number;
  /** Approve low-risk drafts without a person (zack's switch). Needs the checker, so only with an API key. */
  autoApprove?: boolean;
  /** Builds the review page link for the summary email. */
  reviewLink?: () => string | undefined;
  /** Overrides the checker (tests). With an API key and no override, the Claude checker runs. */
  checker?: Checker;
  /** Sends the run summary email. Leave out and nothing is emailed. */
  mailer?: Mailer;
  /** Counts open questions on the site, for the summary's "running low" line. */
  openOnSite?: (published: readonly string[]) => Promise<number> | number;
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
  /** Writer calls this run was allowed after the daily cap. */
  draftAllowance: number;
  /** Whether the run summary email went out (null: no email set up). */
  emailed: boolean | null;
  emailError?: string;
}

/** Midnight today in Toronto (the editor's day), so the morning and evening runs share one daily allowance. */
export function torontoDayStart(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return new Date(now.getTime() - ((n("hour") * 60 + n("minute")) * 60 + n("second")) * 1000 - now.getUTCMilliseconds());
}

export async function runFromEnv(opts: RunOptions): Promise<RunResult> {
  // With a key: the five-desk writing team and the risk checker. Without one: the mock drafter, no checker.
  const drafter: Drafter = opts.apiKey ? DeskTeam.claude({ apiKey: opts.apiKey }) : new MockDrafter();
  const checker = opts.checker ?? (opts.apiKey ? new ClaudeChecker({ apiKey: opts.apiKey }) : undefined);
  const store = opts.store ?? new MemoryStore(opts.live);
  // The daily cap: whatever earlier runs used today (Toronto time) comes off this run's allowance.
  // And the monthly budget: writer calls since the 1st, at the cautious average price, against the cap.
  const usedToday = opts.dailyDrafts === undefined ? 0 : await store.draftedSince(torontoDayStart(opts.now));
  const monthStart = new Date(Date.UTC(opts.now.getUTCFullYear(), opts.now.getUTCMonth(), 1));
  const usedThisMonth = opts.monthlyBudgetUsd === undefined ? 0 : await store.draftedSince(monthStart);
  const maxDrafts = Math.max(
    0,
    Math.min(
      opts.maxDrafts,
      opts.dailyDrafts === undefined ? Infinity : opts.dailyDrafts - usedToday,
      opts.monthlyBudgetUsd === undefined ? Infinity : Math.floor(opts.monthlyBudgetUsd / COST_PER_CALL) - usedThisMonth,
    ),
  );
  const report = await runCycle({
    store,
    drafter,
    ingest: opts.liveFeeds ? () => fetchFeeds(sources, fetch) : async () => sampleFeedResults(),
    http: opts.liveFeeds ? httpFrom(fetch) : undefined,
    releases: upcoming(opts.now, 120, releases),
    now: opts.now,
    config: {
      maxDrafts,
      autoApprove: Boolean(opts.autoApprove && checker),
      ...(opts.checkThreshold ? { checkThreshold: opts.checkThreshold } : {}),
    },
    ...(checker ? { checker } : {}),
    ...(opts.only ? { only: opts.only } : {}),
  });

  // Publish what editors approved since the last run, then refresh every live question (a result may have landed).
  const published = (await publishApproved(store, opts.now)).map((q) => q.slug);
  for (const item of await store.items()) {
    if (item.status !== "published") continue;
    await store.putLiveQuestion(toSiteQuestion(item, await store.getResolution(item.draft.slug)));
  }

  const siteResults = opts.results ? await resolveDue(opts.results.questions, opts.results.store, httpFrom(opts.fetch ?? fetch), opts.results.now) : [];

  const resolved = [...report.resolutions, ...siteResults].some((r) => r.state === "resolved");
  if (opts.onPublished && published.length > 0) await opts.onPublished(published);
  let redeploy = false;
  // Results still ship with a build (the results log is built in). New questions don't need one with `onPublished`.
  if (opts.deployHook && (resolved || (published.length > 0 && !opts.onPublished))) {
    const res = await (opts.fetch ?? fetch)(opts.deployHook, { method: "POST" });
    redeploy = res.ok;
  }

  let emailed: boolean | null = null;
  let emailError: string | undefined;
  if (opts.mailer) {
    const openOnSite = opts.openOnSite ? await opts.openOnSite(published) : undefined;
    const reviewUrl = opts.reviewLink?.();
    const spend = opts.monthlyBudgetUsd === undefined ? undefined : { monthToDate: (await store.draftedSince(monthStart)) * COST_PER_CALL, budget: opts.monthlyBudgetUsd };
    const sent = await opts.mailer(
      summaryEmail({ report, published, ...(openOnSite !== undefined ? { openOnSite } : {}), ...(reviewUrl ? { reviewUrl } : {}), ...(spend ? { spend } : {}) }),
    );
    emailed = sent.ok;
    emailError = sent.error;
  }

  return {
    mode: { drafter: drafter.id, feeds: opts.liveFeeds ? "live" : "sample", persisted: Boolean(opts.store) },
    report,
    published,
    siteResults,
    redeploy,
    draftAllowance: maxDrafts,
    emailed,
    ...(emailError ? { emailError } : {}),
  };
}
