/**
 * A saved poll read (public.social_post_reads) as a poll on the question page: an X or Threads poll, an Instagram
 * poll or YES/NO comment count, or a Facebook reaction count. Framework-free, so it is tested without a database.
 */
import { z } from "zod";
import { isOfficialPost, OFFICIAL_HANDLE_DISPLAY, type SocialPoll } from "@/lib/social";
import { platformSchema, pollSources } from "./types";

const at = z.string().refine((v) => !Number.isNaN(Date.parse(v)));
export const pollReadRow = z.object({
  platform: platformSchema,
  post_id: z.string().regex(/^[0-9_]{1,64}$/),
  poll_yes: z.number().int().nonnegative(),
  poll_no: z.number().int().nonnegative(),
  poll_read_at: at,
  poll_ends_at: at.nullable().optional(),
  poll_source: z.enum(pollSources).nullable().optional(),
  post_url: z.string().max(300).nullable().optional(),
});
export type PollReadRow = z.infer<typeof pollReadRow>;

const iso = (v: string) => new Date(v).toISOString();

/**
 * The poll's line date is when its totals were taken: the end, once the poll has ended, otherwise the last read.
 * `endsAt` is kept for the sports pre-game rule. The address is our own post: built from the id on X, otherwise the
 * saved one, and only when it is a post on our own account (LEX). A row without one isn't shown.
 */
export function pollFromRead(row: PollReadRow): SocialPoll | null {
  if (row.poll_yes + row.poll_no === 0) return null;
  const url = row.platform === "x" ? (/^[0-9]{1,30}$/.test(row.post_id) ? `https://x.com/${OFFICIAL_HANDLE_DISPLAY}/status/${row.post_id}` : null) : (row.post_url ?? null);
  if (!url || !isOfficialPost(row.platform, url)) return null;
  const read = iso(row.poll_read_at);
  const ends = row.poll_ends_at ? iso(row.poll_ends_at) : undefined;
  return {
    platform: row.platform,
    yes: row.poll_yes,
    no: row.poll_no,
    closedAt: ends && Date.parse(ends) <= Date.parse(read) ? ends : read,
    ...(ends ? { endsAt: ends } : {}),
    url,
    ...(row.poll_source && row.poll_source !== "poll" ? { source: row.poll_source } : {}),
  };
}
