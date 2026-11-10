/**
 * When a reading becomes a result. A question resolves automatically only when the official source has given the
 * same answer on two reads at least `CONFIRM_GAP_MS` apart, and the value isn't sitting exactly on the threshold.
 * Anything doubtful goes to an editor: two reads that disagree, a value on the line, repeated errors, or a manual
 * resolver. A resolved question feeds FORGE's public resolution log as `{ outcome, publishedAt, disputed }`.
 */
import type { ResolutionRecord, ResolverRead } from "@/engine/types";

export const CONFIRM_GAP_MS = 10 * 60 * 1000;
/** After this many errors in a row, a person looks at it. */
export const MAX_ERRORS = 3;

export function newRecord(slug: string): ResolutionRecord {
  return { slug, reads: [], state: "waiting" };
}

/** Folds one new read into the record. Pure: returns a new record. A resolved or escalated record never changes. */
export function applyRead(record: ResolutionRecord, read: ResolverRead, at: Date, manual = false): ResolutionRecord {
  if (record.state === "resolved" || record.state === "needsEditor") return record;
  const reads = [...record.reads, { at: at.toISOString(), read }];
  const next: ResolutionRecord = { ...record, reads };

  if (manual) return { ...next, state: "needsEditor" };

  if (read.status === "error") {
    let streak = 0;
    for (let i = reads.length - 1; i >= 0 && reads[i]!.read.status === "error"; i--) streak++;
    return { ...next, state: streak >= MAX_ERRORS ? "needsEditor" : record.state };
  }
  if (read.status === "pending") return next;

  if (read.margin === 0) return { ...next, state: "needsEditor" };

  const previous = [...record.reads].reverse().find((r) => r.read.status === "answer");
  if (!previous || previous.read.status !== "answer") return { ...next, state: "confirming" };
  if (previous.read.outcome !== read.outcome) return { ...next, state: "needsEditor" };
  if (at.getTime() - Date.parse(previous.at) < CONFIRM_GAP_MS) return { ...next, state: "confirming" };

  return { ...next, state: "resolved", outcome: read.outcome, resolvedAt: at.toISOString(), resolvedBy: "engine" };
}

/** The shape `questionSchema.resolution.result` takes. Editor decisions use `editorResult`. */
export function toResult(record: ResolutionRecord): { outcome: "yes" | "no"; publishedAt: string; disputed: boolean } | null {
  if (record.state !== "resolved" || !record.outcome || !record.resolvedAt) return null;
  return { outcome: record.outcome, publishedAt: record.resolvedAt, disputed: record.disputed ?? false };
}

/** An editor settles a record the engine escalated. `disputed: true` keeps it out of scoring while under review. */
export function editorResult(record: ResolutionRecord, outcome: "yes" | "no", editor: string, at: Date, disputed = false): ResolutionRecord {
  return { ...record, state: "resolved", outcome, resolvedAt: at.toISOString(), resolvedBy: editor, disputed };
}
