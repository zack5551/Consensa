import type { QuestionState } from "@/lib/question";

const tone: Record<Exclude<QuestionState, "open">, string> = {
  closingSoon: "border-canada bg-canada-soft",
  closed: "border-line-strong bg-sunken",
  resolved: "border-side-a bg-side-a-soft",
  disputed: "border-side-b bg-side-b-soft",
};

/** One line under a question's title that explains its state. Open questions don't need one. */
export function StateNote({ state, title, children }: { state: QuestionState; title: string; children: string }) {
  if (state === "open") return null;
  return (
    <p className={`m-0 rounded-control border-l-4 px-4 py-3 text-body-sm ${tone[state]}`}>
      <strong className="font-bold">{title}.</strong> {children}
    </p>
  );
}
