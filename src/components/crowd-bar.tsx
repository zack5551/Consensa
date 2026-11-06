/** The yes/no split bar. Teal is yes, violet is no; the numbers carry the meaning for colour-blind readers. */
export function CrowdBar({ yes, yesLabel, noLabel }: { yes: number; yesLabel: string; noLabel: string }) {
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-side-b" aria-hidden="true">
        <span className="block h-full bg-side-a transition-[width] duration-[var(--cn-duration-reveal)] ease-[var(--cn-ease-out)]" style={{ width: `${yes}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-caption font-semibold tabular">
        <span className="text-side-a-text">{yesLabel}</span>
        <span className="text-side-b-text">{noLabel}</span>
      </div>
    </div>
  );
}
