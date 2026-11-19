/**
 * Social voting (sprint 11): a YES or NO reply to an official @CANsensus post counts as a call when its author has
 * linked that social account to a confirmed CANsensus account. Framework-free types shared by the adapters, the
 * counting step and the tests.
 */
import { z } from "zod";

export const platforms = ["x", "threads", "instagram", "facebook"] as const;
export type Platform = (typeof platforms)[number];
export const platformSchema = z.enum(platforms);

export type Vote = "yes" | "no";

/** All an adapter ever hands on about a reply: no text, no username, no profile. */
export interface ParsedReply {
  replyId: string;
  authorId: string;
  vote: Vote;
  /** When the reply was written (ISO). */
  at: string;
}

export interface ReadReplies {
  replies: ParsedReply[];
  /** False when the spend cap or a failed request stopped the read early, so the reader must not move its place. */
  complete: boolean;
}

/** What a deleted-reply check found. Only a reply the platform itself reports as not found is ever listed as gone. */
export interface DeletedCheck {
  gone: string[];
  /** How many of the ids the platform answered for. */
  checked: number;
  /** What the check took from the spend cap, net of what it handed back, in millionths of a US dollar. */
  spentMicros: number;
  /** False when the spend cap or a failed request stopped the check early; the rest is checked on a later day. */
  complete: boolean;
}

/** A native poll's totals as the platform reports them. Never mixed into "Canada says". */
export interface PollTotals {
  yes: number;
  no: number;
}

/** One platform's reader. It only ever reads posts listed as official in content (`socialPosts`). */
export interface SocialProvider {
  readonly platform: Platform;
  readReplies(ourPostId: string, since: Date | null, now: Date): Promise<ReadReplies>;
  readPollTotals(ourPostId: string, now: Date): Promise<PollTotals | null>;
  /**
   * Which of these counted replies have since been deleted on the platform (the daily sweep). With `maxSpendMicros`
   * the check never reserves more than that in all, and stops, incomplete, when it runs out.
   */
  findDeleted?(replyIds: readonly string[], now: Date, maxSpendMicros?: number): Promise<DeletedCheck>;
  /** A public reply under a reply on our own post (the auto-reply). True when it was posted. */
  postReply?(replyId: string, text: string): Promise<boolean>;
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/** An official post on a question: content's `socialPosts` field. Ids are digits (Meta joins two with an underscore). */
export const socialPostSchema = z.object({
  platform: platformSchema,
  postId: z.string().regex(/^[0-9_]{1,64}$/),
  locale: z.enum(["en", "fr"]),
});
export type SocialPost = z.infer<typeof socialPostSchema>;

/** The probability a plain YES or NO reply is recorded as. One place, so a product change is one line. */
export const REPLY_PROBABILITY: Record<Vote, number> = { yes: 75, no: 25 };
