import type { QuestionState } from "@/lib/question";

const tone: Record<QuestionState, string> = {
  open: "bg-sunken text-ink-2",
  closingSoon: "bg-canada-soft text-ink",
  closed: "bg-sunken text-ink-2",
  resolved: "bg-side-a-soft text-side-a-text",
  disputed: "bg-side-b-soft text-side-b-text",
};

/** A small pill naming where a question is in its life. The text carries the meaning; colour only supports it. */
export function StateBadge({ state, label }: { state: QuestionState; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-caption font-semibold ${tone[state]}`}>
      {state === "closingSoon" && <span className="size-1.5 rounded-full bg-canada" aria-hidden="true" />}
      {label}
    </span>
  );
}
