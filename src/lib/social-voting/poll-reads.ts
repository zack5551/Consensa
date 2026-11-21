/**
 * A saved X poll read (public.social_post_reads) as a poll on the question page. Framework-free, so it is tested
 * without a database.
 */
import { z } from "zod";
import { OFFICIAL_HANDLE_DISPLAY, type SocialPoll } from "@/lib/social";

const at = z.string().refine((v) => !Number.isNaN(Date.parse(v)));
export const pollReadRow = z.object({
  platform: z.literal("x"),
  post_id: z.string().regex(/^[0-9]{1,30}$/),
  poll_yes: z.number().int().nonnegative(),
  poll_no: z.number().int().nonnegative(),
  poll_read_at: at,
  poll_ends_at: at.nullable().optional(),
});
export type PollReadRow = z.infer<typeof pollReadRow>;

const iso = (v: string) => new Date(v).toISOString();

/**
 * The poll's line date is when its totals were taken: the end, once the poll has ended, otherwise the last read.
 * `endsAt` is kept for the sports pre-game rule. Our handle goes in the address, so the logo opens our own post.
 */
export function pollFromRead(row: PollReadRow): SocialPoll | null {
  if (row.poll_yes + row.poll_no === 0) return null;
  const read = iso(row.poll_read_at);
  const ends = row.poll_ends_at ? iso(row.poll_ends_at) : undefined;
  return {
    platform: "x",
    yes: row.poll_yes,
    no: row.poll_no,
    closedAt: ends && Date.parse(ends) <= Date.parse(read) ? ends : read,
    ...(ends ? { endsAt: ends } : {}),
    url: `https://x.com/${OFFICIAL_HANDLE_DISPLAY}/status/${row.post_id}`,
  };
}
