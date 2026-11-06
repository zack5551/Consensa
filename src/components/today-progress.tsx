"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Locale } from "@/i18n/config";
import { track } from "@/lib/analytics";
import { readAllCalls, subscribeCalls } from "@/lib/calls-store";

type Props = { slugs: readonly string[]; locale: Locale; template: string; done: string };

/**
 * "2 of 5 called today": the 60-second daily habit, made visible. Counts calls kept in this browser.
 * The server renders 0, so the bar never shifts the layout when it hydrates.
 */
export function TodayProgress({ slugs, locale, template, done }: Props) {
  const key = slugs.join(",");
  const count = useSyncExternalStore(
    subscribeCalls,
    () => Object.keys(readAllCalls(key.split(","))).length,
    () => 0,
  );
  const total = slugs.length;
  const complete = count >= total;
  const sent = useRef(false);

  useEffect(() => {
    if (complete && !sent.current) {
      sent.current = true;
      track("today_completed", { locale, calls: count });
    }
  }, [complete, count, locale]);

  return (
    <div className="grid gap-2">
      <p className="m-0 text-body-sm font-semibold tabular" aria-live="polite">
        {complete ? done : template.replace("{n}", String(count)).replace("{total}", String(total))}
      </p>
      <ol className="m-0 grid list-none grid-cols-5 gap-1.5 p-0" aria-hidden="true">
        {slugs.map((s, i) => (
          <li key={s} className={`h-1.5 rounded-full transition-colors duration-[var(--cn-duration-reveal)] ${i < count ? "bg-side-a" : "bg-line"}`} />
        ))}
      </ol>
    </div>
  );
}
