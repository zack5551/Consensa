/**
 * Social voting (sprint 11): a YES or NO reply to an official @Cansensa post counts as a call when its author has
 * linked that social account to a confirmed Cansensa account. Framework-free types shared by the adapters, the
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
  /** Which of these counted replies have since been deleted. Null when the platform or the cap doesn't allow the check. */
  findDeleted?(replyIds: readonly string[], now: Date): Promise<string[] | null>;
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
