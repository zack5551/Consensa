import type { Dictionary } from "@/i18n/dictionaries/en";
import { officialPublisher, statcanTable } from "@/lib/source-credit";
import { fill } from "@/lib/text";

/** The source line and non-endorsement note that Statistics Canada and Bank of Canada data need. Nothing for other sources. */
export function SourceCredit({ url, t, className = "" }: { url: string; t: Dictionary["resolution"]["credit"]; className?: string }) {
  const publisher = officialPublisher(url);
  if (!publisher) return null;
  const table = publisher === "statcan" ? statcanTable(url) : null;
  const line = publisher === "boc" ? t.boc : table ? fill(t.statcanTable, { table }) : t.statcan;
  const name = publisher === "boc" ? t.bocName : t.statcanName;
  return (
    <p className={`m-0 text-caption text-ink-2 ${className}`}>
      {line} {fill(t.notEndorsed, { name })}
    </p>
  );
}
