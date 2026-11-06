import type { Verdict } from "@/lib/record";

const tone: Record<Verdict, string> = {
  calledIt: "bg-side-a-soft text-side-a-text",
  missed: "bg-sunken text-ink-2",
  tossUp: "bg-sunken text-ink-2",
};

/** "Called it!" / "Not this time." A miss is shown calmly, never as a failure state. */
export function VerdictBadge({ verdict, label }: { verdict: Verdict; label: string }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-caption font-semibold ${tone[verdict]}`}>{label}</span>;
}
