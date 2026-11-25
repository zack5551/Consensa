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
  "To review: Supabase → Table Editor → engine_queue. Set status to approved or rejected. Nothing publishes until you approve it.";

function ottawa(at: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", dateStyle: "full", timeStyle: "short" }).format(new Date(at));
}

const deskName = (id: string) => DESKS.find((d) => d.id === id)?.name ?? id;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function estimateCost(usage: CycleReport["usage"]): number {
  return (usage.inputTokens * PRICE.input + usage.outputTokens * PRICE.output + usage.cacheReadTokens * PRICE.cacheRead) / 1_000_000;
}

export interface RunSummary {
  report: CycleReport;
  /** Open questions on the site right now, for the "never runs dry" check. */
  openOnSite?: number;
  published: readonly string[];
}

/** The email after every run. */
export function summaryEmail({ report, openOnSite, published }: RunSummary): Email {
  const queued = report.decisions.filter((d) => d.decision === "queued");
  const skipped = report.decisions.filter((d) => d.decision === "skipped").length;
  const blocked = report.decisions.filter((d) => d.decision === "blockedStory" || d.decision === "autoRejected").length;
  const errors = report.decisions.filter((d) => d.decision === "error");
  const flagged = report.alerts;
  const low = openOnSite !== undefined && openOnSite < SLATE_TARGET;

  const subject =
    queued.length === 0
      ? `PULSE: no new drafts this run${errors.length > 0 ? " (errors)" : ""}`
      : `PULSE: ${plural(queued.length, "new draft")}${flagged.length > 0 ? `, ${flagged.length} flagged` : ""}${low ? ", slate running low" : ""}`;

  const lines: string[] = [`PULSE ran on ${ottawa(report.startedAt)} (Ottawa time).`, ""];
  lines.push(`New drafts waiting for you: ${queued.length}`);
  lines.push(`Flagged by the checker (risk ${report.threshold}/10 or more, or couldn't be rated): ${flagged.length}`);
  lines.push(`Turned down by the writers: ${skipped} · Blocked by the safety rules: ${blocked} · Errors: ${errors.length}`);
  if (openOnSite !== undefined) lines.push(`Open questions on the site: ${openOnSite} (target ${SLATE_TARGET} or more)`);
  if (published.length > 0) lines.push(`Went live this run: ${published.join(", ")}`);
  lines.push("");

  if (queued.length === 0) {
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
  lines.push(`Rough Claude cost this run: about US$${estimateCost(report.usage).toFixed(2)}.`, "", REVIEW_HOW);
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
