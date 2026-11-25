/**
 * The editor emails PULSE sends after each run: a short summary (so zack can tell it ran without opening any
 * dashboard), the drafts the checker flagged, and a separate alert when a run fails outright. Plain text, English:
 * these go to the editor, never to forecasters.
 */
import { AREA_NAMES, hotAreas } from "@/engine/check/checker";
import { DESKS } from "@/engine/draft/desks";
import type { CycleReport } from "@/engine/pipeline";
import type { Email } from "@/engine/notify/ses";

/** Open questions the site should always have. Below this the summary says the slate is running low. */
export const SLATE_TARGET = 8;

/** Opus 5.5 list prices (US$ per million tokens), for the rough cost line. */
const PRICE = { input: 4, output: 20, cacheRead: 0.2 };

const REVIEW_HOW =
  "Drafts that passed every check were approved automatically and go live with this run. Everything else waits for you: open the review page link above, or Supabase → Table Editor → engine_queue and set status to approved or rejected.";

function ottawa(at: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", dateStyle: "full", timeStyle: "short" }).format(new Date(at));
}

const deskName = (id: string) => DESKS.find((d) => d.id === id)?.name ?? id;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * What one writer call costs on average, with its risk check, rounded up so the budget errs on the safe side: a
 * draft is about 4-6 US cents, a decline 2-3, a check about 3 (see docs/engine/README.md). The monthly budget counts
 * writer calls at this price; the real bill is on console.anthropic.com.
 */
export const COST_PER_CALL = 0.08;

export function estimateCost(usage: CycleReport["usage"]): number {
  return (usage.inputTokens * PRICE.input + usage.outputTokens * PRICE.output + usage.cacheReadTokens * PRICE.cacheRead) / 1_000_000;
}

export interface RunSummary {
  report: CycleReport;
  /** Open questions on the site right now, for the "never runs dry" check. */
  openOnSite?: number;
  published: readonly string[];
  /** The review page link (signed, lasts a week). */
  reviewUrl?: string;
  /** This month's estimated Claude spend (including this run) and the cap, in US$. */
  spend?: { monthToDate: number; budget: number };
}

/** The email after every run. */
export function summaryEmail({ report, openOnSite, published, reviewUrl, spend }: RunSummary): Email {
  const all = report.decisions.filter((d) => d.decision === "queued");
  const auto = all.filter((d) => "autoApproved" in d && d.autoApproved);
  const queued = all.filter((d) => !auto.includes(d));
  const skipped = report.decisions.filter((d) => d.decision === "skipped").length;
  const blocked = report.decisions.filter((d) => d.decision === "blockedStory" || d.decision === "autoRejected").length;
  const errors = report.decisions.filter((d) => d.decision === "error");
  const flagged = report.alerts;
  const low = openOnSite !== undefined && openOnSite < SLATE_TARGET;

  const parts = [
    ...(auto.length > 0 ? [`${auto.length} auto-approved`] : []),
    ...(queued.length > 0 ? [`${queued.length} waiting for you`] : []),
    ...(flagged.length > 0 ? [`${flagged.length} flagged`] : []),
    ...(low ? ["slate running low"] : []),
  ];
  const subject =
    all.length === 0 ? `PULSE: no new drafts this run${errors.length > 0 ? " (errors)" : ""}${low ? ", slate running low" : ""}` : `PULSE: ${parts.join(", ")}`;

  const lines: string[] = [`PULSE ran on ${ottawa(report.startedAt)} (Ottawa time).`, ""];
  lines.push(`Auto-approved (passed every check, going live): ${auto.length}`);
  lines.push(`New drafts waiting for you: ${queued.length}`);
  lines.push(`Flagged by the checker (risk ${report.threshold}/10 or more, or couldn't be rated): ${flagged.length}`);
  lines.push(`Turned down by the writers: ${skipped} · Blocked by the safety rules: ${blocked} · Errors: ${errors.length}`);
  if (openOnSite !== undefined) lines.push(`Open questions on the site: ${openOnSite} (target ${SLATE_TARGET} or more)`);
  if (published.length > 0) lines.push(`Went live this run: ${published.join(", ")}`);
  if (reviewUrl) lines.push(`Review and approve: ${reviewUrl}`);
  lines.push("");

  if (all.length === 0) {
    lines.push(
      errors.length > 0
        ? "No new drafts, and some stories hit errors (listed below). If the errors say the key is bad or the account is out of credit, that needs fixing."
        : "No new drafts this run. Usually that means a quiet news day and nothing new on the official calendar. If it happens two runs in a row, ask Claude to look.",
      "",
    );
  }
  if (low) lines.push(`The site has fewer than ${SLATE_TARGET} open questions. Approving a few drafts keeps it from running dry.`, "");

  if (flagged.length > 0) {
    lines.push("FLAGGED FOR A CLOSE LOOK");
    flagged.forEach((a, i) => {
      lines.push(`${i + 1}. [${deskName(a.desk)}] ${a.draft.question.en}`, `   FR: ${a.draft.question.fr}`);
      if (a.check) {
        lines.push(`   Highest risk: ${a.check.overall}/10. ${a.check.summary}`);
        for (const area of hotAreas(a.check, report.threshold)) lines.push(`   - ${AREA_NAMES[area]} ${a.check.scores[area].score}/10: ${a.check.scores[area].reason}`);
      } else {
        lines.push(`   The checker couldn't rate it (${a.checkError ?? "unknown reason"}). Read it with extra care.`);
      }
      lines.push(`   Queue id: ${a.itemId}`);
    });
    lines.push("");
  }

  if (auto.length > 0) {
    lines.push("AUTO-APPROVED AND PUBLISHED (to take one down, ask Claude)");
    for (const d of auto) lines.push(`- [${deskName(d.desk ?? "")}] ${"itemId" in d ? d.itemId : d.headline} (from "${d.headline}")`);
    lines.push("");
  }

  const clean = queued.filter((d) => !flagged.some((a) => "itemId" in d && a.itemId === d.itemId));
  if (clean.length > 0) {
    lines.push("OTHER NEW DRAFTS");
    for (const d of clean) lines.push(`- [${deskName(d.desk ?? "")}] ${"itemId" in d ? d.itemId : d.headline} (from "${d.headline}")`);
    lines.push("");
  }

  if (errors.length > 0) {
    lines.push("ERRORS (these stories are retried next run)");
    for (const e of errors) lines.push(`- ${e.headline}: ${"reason" in e ? e.reason : ""}`);
    lines.push("");
  }

  lines.push("BY DESK");
  for (const desk of DESKS) {
    const mine = report.decisions.filter((d) => d.desk === desk.id);
    lines.push(`- ${desk.name}: ${mine.filter((d) => d.decision === "queued").length} queued of ${plural(mine.length, "story", "stories")} tried`);
  }
  lines.push("");
  lines.push(`Feeds read: ${report.feeds.ok} of ${report.feeds.ok + report.feeds.failed.length}. New headlines: ${report.feeds.newSignals}.`);
  lines.push(`Rough Claude cost this run: about US$${estimateCost(report.usage).toFixed(2)}.`);
  if (spend) {
    const out = spend.monthToDate >= spend.budget ? " The budget is used up, so writing is paused until next month." : "";
    lines.push(`This month so far: about US$${spend.monthToDate.toFixed(2)} of the US$${spend.budget.toFixed(0)} budget.${out}`);
  }
  lines.push("", REVIEW_HOW);
  return { subject, text: lines.join("\n") };
}

/** The email when a run fails before it can report anything. */
export function failureEmail(error: string, at: Date): Email {
  return {
    subject: "PULSE run failed",
    text: [
      `PULSE tried to run on ${ottawa(at.toISOString())} (Ottawa time) and stopped with an error:`,
      "",
      error.slice(0, 500),
      "",
      "Nothing was published or lost. The next run tries again. If this email comes twice in a row, ask Claude to look; the full error is in Vercel → Logs.",
    ].join("\n"),
  };
}
