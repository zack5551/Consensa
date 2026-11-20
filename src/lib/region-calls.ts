/**
 * The call panel's region row: "Your region · Ontario · average of at least 120 calls". Framework-free and
 * unit-tested. The server sends a count only from 50 calls up, rounded down to 10s (see `publishedRegionCount`),
 * and this side checks the same floor again.
 *
 * The count comes apart from the words so the panel can set it in tabular digits. Without a count (sample data, or
 * a database that doesn't return one yet), the row keeps its countless wording.
 */
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { formatCount } from "@/lib/format";
import { REGION_COUNT_MIN } from "@/lib/live-crowd";
import { fill } from "@/lib/text";

type Strings = { yourRegion: string; yourRegionCount: string };

/** `n` is null when there is no count to show; otherwise the line reads before + n + after. */
export type RegionCallsLine = { before: string; n: string | null; after: string };

export function regionCallsLine(t: Strings, region: string, count: number | undefined, locale: Locale): RegionCallsLine {
  if (count === undefined || !Number.isInteger(count) || count < REGION_COUNT_MIN) return { before: fill(t.yourRegion, { region }), n: null, after: "" };
  const template = fill(t.yourRegionCount, { region });
  const at = template.indexOf("{n}");
  if (at === -1) return { before: template, n: null, after: "" };
  return { before: template.slice(0, at), n: formatCount(count, locale), after: template.slice(at + 3) };
}

/** The answer from `/api/crowd/region`: one region's count, or null when it isn't published. */
const regionCountResponse = z.object({ n: z.number().int().nonnegative().nullable() });

/** Reads that answer. Anything malformed counts as "no count", so the row falls back to its countless wording. */
export function parseRegionCount(body: unknown): number | undefined {
  const parsed = regionCountResponse.safeParse(body);
  return parsed.success && parsed.data.n !== null ? parsed.data.n : undefined;
}

export function regionCountUrl(slug: string, region: string): string {
  return `/api/crowd/region?${new URLSearchParams({ slug, region }).toString()}`;
}
