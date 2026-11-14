import type { crowdRecord } from "@/lib/question";

/** The landing "at a glance" band: two live counts, plus the crowd's record only when it has one. */
export type LandingStat = readonly [value: string, label: string];

type CrowdRecordSummary = ReturnType<typeof crowdRecord>;

export function buildLandingStats(input: {
  calls: string;
  open: string;
  record: CrowdRecordSummary;
  labels: { forecasters: string; questions: string; resolved: string; calledRight: string };
  formatCount: (n: number) => string;
  formatPercent: (n: number) => string;
}): { stats: LandingStat[]; columns: "lg:grid-cols-4" | "" } {
  const { calls, open, record, labels } = input;
  const stats: LandingStat[] = [
    [calls, labels.forecasters],
    [open, labels.questions],
  ];
  if (record.resolved > 0 && record.rightSide !== null) {
    stats.push([input.formatCount(record.resolved), labels.resolved], [input.formatPercent(record.rightSide), labels.calledRight]);
  }
  return { stats, columns: stats.length === 4 ? "lg:grid-cols-4" : "" };
}
