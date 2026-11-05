/** The yes/no split bar. Teal is yes, violet is no; the numbers carry the meaning for colour-blind readers. */
export function CrowdBar({ yes, yesLabel, noLabel }: { yes: number; yesLabel: string; noLabel: string }) {
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-pill bg-no" aria-hidden="true">
        <span className="block h-full bg-yes transition-[width] duration-[var(--duration-base)] ease-[var(--ease-out)]" style={{ width: `${yes}%` }} />
      </div>
      <div className="mt-1 flex justify-between font-mono text-1 font-semibold tabular">
        <span className="text-yes">{yesLabel}</span>
        <span className="text-no">{noLabel}</span>
      </div>
    </div>
  );
}
