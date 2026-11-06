import type { ReactNode } from "react";

/** A designed "nothing here" moment: what's missing, why it's fine, and one way forward. */
export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-3 rounded-card border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
      <svg viewBox="0 0 48 48" className="size-12" aria-hidden="true">
        <circle cx="24" cy="24" r="22" fill="none" stroke="var(--cn-border-strong)" strokeWidth="2" strokeDasharray="4 5" />
        <path d="M22 13a11 11 0 0 0 0 22v-7.5a3.5 3.5 0 0 1 0-7Z" fill="var(--cn-side-a)" />
        <path d="M26 13a11 11 0 0 1 0 22v-7.5a3.5 3.5 0 0 0 0-7Z" fill="var(--cn-side-b)" />
      </svg>
      <h2 className="m-0 text-title-sm font-bold">{title}</h2>
      <p className="m-0 max-w-[44ch] text-body-sm text-ink-2">{body}</p>
      {action}
    </div>
  );
}
