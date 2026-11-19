import "server-only";
import { z } from "zod";
import { sampleQuestions } from "@/content/sample-questions";
import { adminSupabase } from "@/lib/supabase/admin";
import { socialVotingOn } from "./env";
import { sponsorSocialCounts, type SponsorCounts } from "./sponsor";
import { platformSchema } from "./types";

const pollRow = z.object({ slug: z.string(), platform: platformSchema, poll_yes: z.number().int().nonnegative(), poll_no: z.number().int().nonnegative() });

/**
 * Sponsor numbers for these questions, read with the secret key. Server only: there is no route, no UI and no
 * export for it yet. Returns nothing while social voting is off or the database isn't set up.
 */
export async function sponsorCountsFor(slugs: readonly string[]): Promise<SponsorCounts[]> {
  const admin = adminSupabase();
  if (!socialVotingOn() || !admin) return [];
  return sponsorSocialCounts(sampleQuestions, slugs, {
    counts: async (allowed) => {
      const { data, error } = await admin.rpc("sponsor_social_counts", { p_slugs: allowed });
      if (error) throw new Error("sponsor counts unavailable");
      return data;
    },
    polls: async (allowed) => {
      const { data, error } = await admin.from("social_post_reads").select("slug, platform, poll_yes, poll_no").in("slug", allowed).not("poll_read_at", "is", null);
      if (error) return [];
      return z
        .array(pollRow)
        .catch([])
        .parse(data)
        .map((r) => ({ slug: r.slug, platform: r.platform, yes: r.poll_yes, no: r.poll_no }));
    },
  });
}
