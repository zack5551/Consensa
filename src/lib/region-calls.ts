/**
 * The call panel's region row: "Your region · Ontario · average of 12 calls". Framework-free and unit-tested.
 *
 * The count comes apart from the words so the panel can set it in tabular digits. Without a count (sample data, or
 * a database that doesn't return one yet), the row keeps its countless wording.
 */
import type { Locale } from "@/i18n/config";
import { formatCount } from "@/lib/format";
import { fill } from "@/lib/text";

type Strings = { yourRegion: string; yourRegionCount: string; yourRegionCountOne: string };

/** `n` is null when there is no count to show; otherwise the line reads before + n + after. */
export type RegionCallsLine = { before: string; n: string | null; after: string };

export function regionCallsLine(t: Strings, region: string, count: number | undefined, locale: Locale): RegionCallsLine {
  if (count === undefined || !Number.isInteger(count) || count < 1) return { before: fill(t.yourRegion, { region }), n: null, after: "" };
  const template = fill(count === 1 ? t.yourRegionCountOne : t.yourRegionCount, { region });
  const at = template.indexOf("{n}");
  if (at === -1) return { before: template, n: null, after: "" };
  return { before: template.slice(0, at), n: formatCount(count, locale), after: template.slice(at + 3) };
}
