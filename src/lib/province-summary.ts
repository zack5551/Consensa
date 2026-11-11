/**
 * The text summary of a province split (for screen readers and the map's label). Hidden regions (too few real
 * calls) are left out, and when fewer than two regions can be shown it says so instead of naming extremes.
 */
import { provinceExtremes, type Province } from "@/lib/question";
import { fill } from "@/lib/text";

type Split = { provinces: Record<Province, number>; hiddenProvinces?: readonly Province[] };
type Strings = { summary: string; notEnough: string; names: Record<Province, string> };

export function provinceSummary(q: Split, t: Strings, pct: (v: number) => string): string {
  const ext = provinceExtremes(q.provinces, q.hiddenProvinces);
  if (!ext) return t.notEnough;
  return fill(t.summary, { high: t.names[ext.high], highValue: pct(q.provinces[ext.high]), low: t.names[ext.low], lowValue: pct(q.provinces[ext.low]) });
}
