/**
 * The editorial review queue. No AI-drafted question reaches forecasters without a person approving it
 * (BUILD_PLAN M4: "No unreviewed AI text reaches users").
 *
 *   pending ──approve──▶ approved ──publish──▶ published
 *      │  ╲──reject───▶ rejected
 *      │   ╲─changes──▶ needsChanges ──edit──▶ pending
 *   autoRejected (blocked by a safety or validity check; kept for the audit, never shown)
 *
 * Every transition is appended to the item's history with who did it and why. Nothing is ever deleted.
 */
import { isBlocked, screenDraft } from "@/engine/safety/safety";
import { validateDraft } from "@/engine/validate";
import type { Draft, Flag, QueueItem, ReviewStatus } from "@/engine/types";

const TRANSITIONS: Record<ReviewStatus, readonly ReviewStatus[]> = {
  pending: ["approved", "rejected", "needsChanges"],
  needsChanges: ["pending", "rejected"],
  approved: ["published", "pending"],
  published: [],
  rejected: [],
  autoRejected: [],
};

export class ReviewError extends Error {}

export function canMove(from: ReviewStatus, to: ReviewStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

function move(item: QueueItem, to: ReviewStatus, actor: string, at: Date, note?: string): QueueItem {
  if (!canMove(item.status, to)) throw new ReviewError(`Can't move ${item.id} from ${item.status} to ${to}.`);
  return { ...item, status: to, history: [...item.history, { at: at.toISOString(), actor, from: item.status, to, ...(note ? { note } : {}) }] };
}

/** An editor approves. Blocked flags can't be approved; every review flag must be acknowledged by code. */
export function approve(item: QueueItem, editor: string, at: Date, acknowledged: readonly string[] = []): QueueItem {
  if (isBlocked(item.flags)) throw new ReviewError(`${item.id} has blocking flags and can't be approved.`);
  const open = item.flags.filter((f) => f.severity === "review" && !acknowledged.includes(f.code));
  if (open.length > 0) throw new ReviewError(`Acknowledge these flags first: ${open.map((f) => f.code).join(", ")}.`);
  return move(item, "approved", editor, at, acknowledged.length ? `acknowledged ${acknowledged.join(", ")}` : undefined);
}

export function reject(item: QueueItem, editor: string, at: Date, reason: string): QueueItem {
  if (!reason.trim()) throw new ReviewError("Say why, for the audit log.");
  return move(item, "rejected", editor, at, reason);
}

export function requestChanges(item: QueueItem, editor: string, at: Date, note: string): QueueItem {
  return move(item, "needsChanges", editor, at, note);
}

/**
 * An editor rewrites the draft. The new text goes through every check again, and the item returns to pending, so
 * an approval always covers the exact words that ship.
 */
export function edit(item: QueueItem, editor: string, at: Date, draft: Draft): QueueItem {
  if (item.status !== "needsChanges" && item.status !== "pending") throw new ReviewError(`Can't edit ${item.id} while ${item.status}.`);
  const flags = [...screenDraft(draft), ...validateDraft(draft, at)];
  const edited: QueueItem = { ...item, draft, flags, history: [...item.history, { at: at.toISOString(), actor: editor, from: item.status, to: "pending", note: "edited" }] };
  return { ...edited, status: "pending" };
}

export function publish(item: QueueItem, at: Date): QueueItem {
  return move(item, "published", "engine", at);
}

export function newItem(args: {
  id: string;
  storyId: string;
  draft: Draft;
  flags: Flag[];
  provenance: string[];
  priority: number;
  drafter: string;
  at: Date;
}): QueueItem {
  const status: ReviewStatus = isBlocked(args.flags) ? "autoRejected" : "pending";
  const note = status === "autoRejected" ? args.flags.filter((f) => f.severity === "block").map((f) => f.code).join(", ") : undefined;
  return {
    id: args.id,
    storyId: args.storyId,
    draft: args.draft,
    flags: args.flags,
    provenance: args.provenance,
    priority: args.priority,
    status,
    drafter: args.drafter,
    createdAt: args.at.toISOString(),
    history: [{ at: args.at.toISOString(), actor: "engine", from: null, to: status, ...(note ? { note } : {}) }],
  };
}

/** What an editor sees first: open items, highest priority, then oldest. */
export function queueOrder(items: readonly QueueItem[]): QueueItem[] {
  const rank: Partial<Record<ReviewStatus, number>> = { pending: 0, needsChanges: 1, approved: 2 };
  return items
    .filter((i) => i.status in rank)
    .sort((a, b) => rank[a.status]! - rank[b.status]! || b.priority - a.priority || a.createdAt.localeCompare(b.createdAt));
}
