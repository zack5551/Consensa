/**
 * Social voting settings from the environment, validated once per read. Everything is off until SOCIAL_VOTING=1:
 * with the flag off no outside service is called, the routes answer 404 and the screens are hidden.
 *
 * - SOCIAL_VOTING=1: the feature flag. Run the sprint-11 migration first.
 * - SOCIAL_AUTO_REPLY=1: the public auto-reply. Off unless zack turns it on (it posts publicly).
 * - SOCIAL_LINK_SECRET: signs the 10-minute linking cookie and keys the hashed ids. At least 32 characters.
 * - X_CLIENT_ID (+ X_CLIENT_SECRET for a confidential app): OAuth 2.0 PKCE for linking an X account.
 * - X_BEARER_TOKEN: app-only token for reading replies and poll totals on our own posts.
 * - X_MONTHLY_CAP_USD: the hard monthly spend cap for X reads. 0 or unset means nothing is read.
 * - X_REPLY_TOKEN: the official account's own token, used only by the auto-reply.
 * - X_ACCOUNT_ID: our own X account's numeric id (optional). Saves the poll finder one paid lookup a day (AEGIS).
 * - META_PAGE_TOKEN, META_INSTAGRAM_TOKEN, META_THREADS_TOKEN: our own accounts' read tokens (after Meta's review).
 * - META_INSTAGRAM_ID: our Instagram professional account's id, which the Instagram finder reads its posts from.
 */
import { z } from "zod";

const text = z.string().min(1).optional();
const envSchema = z.object({
  SOCIAL_VOTING: z.enum(["0", "1"]).default("0"),
  SOCIAL_AUTO_REPLY: z.enum(["0", "1"]).default("0"),
  SOCIAL_LINK_SECRET: z.string().min(32).optional(),
  X_CLIENT_ID: text,
  X_CLIENT_SECRET: text,
  X_BEARER_TOKEN: text,
  X_MONTHLY_CAP_USD: z.coerce.number().min(0).max(10_000).default(0),
  X_REPLY_TOKEN: text,
  X_ACCOUNT_ID: z.string().regex(/^[0-9]{1,30}$/).optional(),
  META_INSTAGRAM_ID: z.string().regex(/^[0-9]{1,30}$/).optional(),
  META_PAGE_TOKEN: text,
  META_INSTAGRAM_TOKEN: text,
  META_THREADS_TOKEN: text,
});

export type SocialEnv = z.infer<typeof envSchema>;
type Env = Record<string, string | undefined>;

const OFF: SocialEnv = { SOCIAL_VOTING: "0", SOCIAL_AUTO_REPLY: "0", X_MONTHLY_CAP_USD: 0 };

/** A value that doesn't validate turns the whole feature off: a typo never half-enables it. */
export function socialEnv(env: Env = process.env): SocialEnv {
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ""));
  const parsed = envSchema.safeParse(cleaned);
  return parsed.success ? parsed.data : OFF;
}

export function socialVotingOn(env: Env = process.env): boolean {
  return socialEnv(env).SOCIAL_VOTING === "1";
}

/** The auto-reply needs both flags: it can never run with social voting off. */
export function autoReplyOn(env: Env = process.env): boolean {
  const e = socialEnv(env);
  return e.SOCIAL_VOTING === "1" && e.SOCIAL_AUTO_REPLY === "1";
}

/** One thing that still has to be set before social voting can do anything, named by its setting, never its value. */
export type SocialGap = "link-secret" | "x-link" | "x-read" | "x-cap";

/**
 * What is still missing for social voting to work end to end on X, checked from the settings alone. The flag can be
 * on with gaps: the daily step then names them in the log (see `runSocialStep`) instead of failing quietly, and a
 * missing link secret keeps it from running at all. Meta has no gaps here: its sign-in doesn't exist yet.
 */
export function socialGaps(env: Env = process.env): SocialGap[] {
  const e = socialEnv(env);
  const gaps: SocialGap[] = [];
  if (!e.SOCIAL_LINK_SECRET) gaps.push("link-secret");
  if (!e.X_CLIENT_ID) gaps.push("x-link");
  if (!e.X_BEARER_TOKEN) gaps.push("x-read");
  if (e.X_MONTHLY_CAP_USD <= 0) gaps.push("x-cap");
  return gaps;
}

