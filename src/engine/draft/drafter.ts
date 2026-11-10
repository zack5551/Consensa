/**
 * The drafter contract. A drafter reads one story and either writes one bilingual question or declines.
 * Declining is a good outcome: most news has no checkable, harmless question in it.
 */
import type { Release } from "@/engine/sources/calendar";
import type { Draft, Story } from "@/engine/types";

export interface DraftContext {
  now: Date;
  /** Official releases coming up, so the drafter can tie a story to a source that will settle it. */
  releases: readonly Release[];
  /** Questions already live or queued (EN text), so the drafter doesn't repeat them. */
  existing: readonly string[];
}

export type DraftOutcome =
  | { status: "draft"; draft: Draft; drafter: string; usage?: DraftUsage }
  | { status: "skip"; reason: string; drafter: string; usage?: DraftUsage }
  | { status: "error"; reason: string; drafter: string; usage?: DraftUsage };

export interface DraftUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface Drafter {
  readonly id: string;
  draft(story: Story, ctx: DraftContext): Promise<DraftOutcome>;
}
