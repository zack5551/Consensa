/**
 * PULSE explains its own calls. Every queued draft and every result record carries a short `why`: what the engine
 * did and the facts it did it on, in plain English for the editor and the audit. Written from the data, never by the
 * model, so it costs nothing and can't drift from what actually happened.
 */
import { CONFIRM_GAP_MS, MAX_ERRORS } from "@/engine/resolve/policy";
import { scan, STORY_ONLY } from "@/engine/safety/safety";
import type { Draft, Flag, ResolutionRecord, Resolver, ResolverRead, ReviewStatus, Story } from "@/engine/types";

/**
 * Guard for "why it moved" text. Any explanation gets the tip check. A sports explanation gets every wording rule
 * (gambling words, sportsbook talk, the sports tip check), so it can say what changed but never who will win or what
 * to call (CLAUDE.md rule 4, LEX's sports rules).
 * Returns the flags; an empty list means the text may go to an editor.
 */
export function screenExplanation(category: Draft["category"], text: string): Flag[] {
  return category === "sports" ? scan(text, undefined, ["all", "sports", "explanation"], STORY_ONLY) : scan(text, new Set(["tip"]));
}

/** The settling rule in one line. */
export function describeResolver(r: Resolver): string {
  switch (r.kind) {
    case "boc-policy-rate": {
      const move = r.direction === "hold" ? "holds the rate" : r.direction === "cut" ? "cuts the rate" : "raises the rate";
      return `Bank of Canada decision on ${r.decisionDate}: YES if it ${move} (Valet series V39079)`;
    }
    case "statcan-vector":
      return `Statistics Canada vector ${r.vectorId} for ${r.refPeriod}: YES if ${r.comparator} ${r.threshold}${r.unit === "%" ? "%" : ` ${r.unit}`}`;
    case "eccc-daily-climate":
      return `Environment Canada station ${r.climateId}, ${r.aggregate} of ${r.element} from ${r.from} to ${r.to}: YES if ${r.comparator} ${r.threshold}`;
    case "manual":
      return `An editor checks: ${r.check}`;
  }
}

/** Why a draft landed in the queue, or was blocked. */
export function explainItem(args: { story: Story; draft: Draft; flags: readonly Flag[]; status: ReviewStatus; priority: number }): string {
  const { story, draft, flags, status, priority } = args;
  const sources = new Set(story.signals.map((s) => s.sourceId)).size;
  const basis = `Written from "${story.headline}" (heat ${Math.round(story.heat)}, ${story.signals.length} report${story.signals.length === 1 ? "" : "s"} from ${sources} source${sources === 1 ? "" : "s"}).`;
  if (status === "autoRejected") {
    const blocks = flags.filter((f) => f.severity === "block").map((f) => `${f.code} (${f.detail})`);
    return `Blocked, never shown: ${blocks.join("; ")}. ${basis} Kept only for the audit.`;
  }
  const review = flags.filter((f) => f.severity === "review").map((f) => f.code);
  const settles = draft.resolver.kind === "manual" ? `Settles by hand from ${draft.resolution.source.name.en}.` : `Settles itself from official data: ${describeResolver(draft.resolver)}.`;
  const check = review.length ? ` Check before approving: ${review.join(", ")}.` : " No flags.";
  return `Queued for an editor at priority ${priority}. ${basis} ${settles}${check} Nothing publishes until an editor approves.`;
}

function lastAnswers(record: ResolutionRecord): Array<{ at: string; read: Extract<ResolverRead, { status: "answer" }> }> {
  return record.reads.flatMap((r) => (r.read.status === "answer" ? [{ at: r.at, read: r.read }] : []));
}

/** Where a result stands and why, after the latest read. */
export function explainRecord(record: ResolutionRecord, resolver: Resolver): string {
  const rule = describeResolver(resolver);
  const last = record.reads.at(-1)?.read;
  const answers = lastAnswers(record);
  const minutes = CONFIRM_GAP_MS / 60_000;

  switch (record.state) {
    case "resolved": {
      const [a, b] = answers.slice(-2);
      const read = b?.read ?? a?.read;
      const when = a && b ? ` Two reads agreed, at ${a.at} and ${b.at}.` : "";
      const by = record.resolvedBy === "engine" ? "the engine" : `editor ${record.resolvedBy ?? "unknown"}`;
      return `Settled ${record.outcome?.toUpperCase()} by ${by}${read ? `: ${read.observed} (${read.evidenceUrl})` : ""}.${when} Rule: ${rule}.`;
    }
    case "confirming": {
      const a = answers.at(-1)!.read;
      return `Official source reads ${a.outcome.toUpperCase()}: ${a.observed}. Waiting for a second matching read at least ${minutes} minutes later before settling. Rule: ${rule}.`;
    }
    case "needsEditor": {
      if (resolver.kind === "manual") return `Needs an editor: this rule is settled by hand. ${rule}.`;
      if (last?.status === "error") return `Needs an editor: the source failed ${MAX_ERRORS} times in a row (last: ${last.reason}). Rule: ${rule}.`;
      if (last?.status === "answer" && last.margin === 0) return `Needs an editor: the reading sits exactly on the line (${last.observed}). Rule: ${rule}.`;
      const [a, b] = answers.slice(-2);
      if (a && b && a.read.outcome !== b.read.outcome)
        return `Needs an editor: two reads disagreed (${a.read.outcome.toUpperCase()} then ${b.read.outcome.toUpperCase()}: ${b.read.observed}). Rule: ${rule}.`;
      return `Needs an editor. Rule: ${rule}.`;
    }
    case "waiting":
      if (last?.status === "error") return `Source read failed (${last.reason}); trying again next run. An editor looks after ${MAX_ERRORS} failures in a row. Rule: ${rule}.`;
      if (last?.status === "pending") return `Not settled yet: ${last.reason}. Rule: ${rule}.`;
      return `Not read yet. Rule: ${rule}.`;
  }
}
