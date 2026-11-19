/**
 * Sponsor-ready numbers (monetization): per question and per source (website calls, linked replies per platform),
 * plus the native poll totals. Aggregates only, never user-level, and only from people who opted into data
 * licensing (the database function enforces that). Every shown cell holds at least 50 people; smaller cells are
 * folded into "other" by the database, and hidden with the total when "other" is still under 50.
 *
 * Political questions are never sponsor-reportable: they are filtered out here, before the database is asked.
 * A sponsor quotes a number as "X% of CANsensus participants", never as "X% of Canadians".
 * Pure: the database call is injected. The server-only wrapper is `sponsor-server.ts`. No UI and no export yet.
 */
import { z } from "zod";
import { platforms, type Platform, type PollTotals } from "./types";

export const SPONSOR_MIN_CELL = 50;

type SponsorQuestion = { slug: string; political?: boolean };

/** Slugs that may appear in a sponsor report: known to content and not political. Unknown slugs are dropped. */
export function sponsorReportable(questions: readonly SponsorQuestion[], slugs: readonly string[]): string[] {
  const allowed = new Set(questions.filter((q) => q.political !== true).map((q) => q.slug));
  return [...new Set(slugs)].filter((s) => allowed.has(s));
}

const rowSchema = z.object({
  slug: z.string(),
  source: z.enum(["web", ...platforms, "other", "total"]),
  people: z.number().int().nonnegative().nullable(),
});

export interface SponsorCounts {
  slug: string;
  /** People per source; null means hidden (under the minimum cell size). */
  cells: Partial<Record<"web" | Platform | "other", number | null>>;
  /** Null when a hidden cell could otherwise be worked out by subtraction. */
  total: number | null;
  /** Native poll totals per platform, as the platform reports them. Not verified, not part of the counts above. */
  polls: Partial<Record<Platform, PollTotals>>;
}

export interface SponsorSources {
  counts(slugs: string[]): Promise<unknown>;
  polls(slugs: string[]): Promise<Array<{ slug: string; platform: Platform; yes: number; no: number }>>;
}

export async function sponsorSocialCounts(questions: readonly SponsorQuestion[], slugs: readonly string[], sources: SponsorSources): Promise<SponsorCounts[]> {
  const allowed = sponsorReportable(questions, slugs);
  if (allowed.length === 0) return [];
  const rows = z.array(rowSchema).parse(await sources.counts(allowed));
  const polls = await sources.polls(allowed);
  return allowed.map((slug) => {
    const out: SponsorCounts = { slug, cells: {}, total: null, polls: {} };
    for (const row of rows) {
      if (row.slug !== slug) continue;
      // Belt and braces: the database already hides small cells; a number under the minimum is never passed on.
      const people = row.people !== null && row.people >= SPONSOR_MIN_CELL ? row.people : null;
      if (row.source === "total") out.total = people;
      else out.cells[row.source] = people;
    }
    // If any cell is hidden, the total is too, so the hidden cell can't be found by subtraction.
    if (Object.values(out.cells).some((n) => n === null)) out.total = null;
    for (const p of polls) if (p.slug === slug) out.polls[p.platform] = { yes: p.yes, no: p.no };
    return out;
  });
}
