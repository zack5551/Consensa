/**
 * The drafter contract. A drafter reads one story and either writes one bilingual question or declines.
 * Declining is a good outcome: most news has no checkable, harmless question in it.
 */
import type { Release } from "@/engine/sources/calendar";
import type { Draft, EventRef, Story } from "@/engine/types";

export interface DraftContext {
  now: Date;
  /** Official releases coming up, so the drafter can tie a story to a source that will settle it. */
  releases: readonly Release[];
  /** Questions already live or queued (EN text), so the drafter doesn't repeat them. */
  existing: readonly string[];
  /**
   * Ask for a fast question: one that closes within 7 days (this weekend's game, the weekend box office, this week's
   * chart or data release). The pipeline sets it on about a third of each desk's tries (zack, 2026-11-25: fast
   * questions for launch). The 24-hour minimum still applies.
   */
  fast?: boolean;
  /** Questions a person approved recently (EN): the style the editor likes. Newest first. */
  liked?: readonly string[];
  /** What held recent drafts back (flags, checker areas, editor notes), most common first. See `heldLessons`. */
  lessons?: readonly string[];
  /** The story is an idea the editor typed on the review page: write it unless a hard rule says no. */
  idea?: boolean;
  /** A second try: the writer's first draft of this story and what the automatic checks rejected it for. */
  repair?: { question: string; problems: readonly string[] };
  /**
   * For a desk with two categories (weather and science): the one this try should aim for, the thinner on the site.
   * The writer still declines rather than force a story into it.
   */
  category?: Draft["category"];
  /** Several outlets broke this story in the last few hours: ask what happens next, soon. */
  breaking?: boolean;
  /** The big date the story is about: the question should settle at or soon after it. */
  event?: EventRef;
}

export type DraftOutcome = (
  | { status: "draft"; draft: Draft; drafter: string; usage?: DraftUsage }
  | { status: "skip"; reason: string; drafter: string; usage?: DraftUsage }
  | { status: "error"; reason: string; drafter: string; usage?: DraftUsage }
) & {
  /** The writing desk that handled the story, when a team drafted it (see `desks.ts`). */
  desk?: string;
};

/** The reason a writer call gives when the Claude account has no credit left. The run stops writing at once. */
export const OUT_OF_CREDIT = "out of Claude API credit";

export interface DraftUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface Drafter {
  readonly id: string;
  draft(story: Story, ctx: DraftContext): Promise<DraftOutcome>;
}
