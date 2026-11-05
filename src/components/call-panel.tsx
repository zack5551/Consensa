"use client";

import { useEffect, useId, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { formatPercent } from "@/lib/format";
import { gapToCrowd } from "@/lib/scoring";
import { fill } from "@/lib/text";

type Props = { slug: string; crowd: number; locale: Locale; t: Dictionary["call"]; canadaSays: string };

const storageKey = (slug: string) => `consensa:call:${slug}`;

/** The one action on a question page: set a probability and save it. Preview only stores it in this browser. */
export function CallPanel({ slug, crowd, locale, t, canadaSays }: Props) {
  const [value, setValue] = useState(50);
  const [saved, setSaved] = useState(false);
  const hintId = useId();

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey(slug));
      if (stored !== null) {
        const n = Number(stored);
        if (Number.isInteger(n) && n >= 1 && n <= 99) {
          setValue(n);
          setSaved(true);
        }
      }
    } catch {
      /* storage unavailable: start fresh */
    }
  }, [slug]);

  function save() {
    setSaved(true);
    try {
      window.localStorage.setItem(storageKey(slug), String(value));
    } catch {
      /* storage unavailable: keep in memory */
    }
  }

  const gap = gapToCrowd(value, crowd);
  const gapText = gap === 0 ? t.sameAsCrowd : fill(gap > 0 ? t.moreThan : t.lessThan, { n: Math.abs(gap) });

  return (
    <section aria-labelledby={`${hintId}-title`} className="rounded-lg border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
      <h2 id={`${hintId}-title`} className="text-4 font-bold">
        {t.title}
      </h2>
      <p id={hintId} className="mt-1 text-2 text-ink-2">
        {t.hint}
      </p>

      <output htmlFor={`${hintId}-slider`} className={`mt-4 block text-center font-mono text-6 font-semibold tabular ${value < 50 ? "text-no" : "text-yes"}`} aria-live="polite">
        {formatPercent(value, locale)}
      </output>

      <input
        id={`${hintId}-slider`}
        type="range"
        min={1}
        max={99}
        step={1}
        value={value}
        disabled={saved}
        aria-label={t.sliderLabel}
        aria-describedby={hintId}
        aria-valuetext={formatPercent(value, locale)}
        onChange={(e) => setValue(Number(e.target.value))}
        className="mt-3 h-8 w-full cursor-pointer accent-[var(--color-yes)] disabled:cursor-not-allowed disabled:opacity-60"
      />

      <div className="mt-2 flex flex-wrap gap-2">
        {([
          [10, t.quick.unlikely],
          [50, t.quick.tossUp],
          [75, t.quick.likely],
        ] as const).map(([v, label]) => (
          <button
            key={v}
            type="button"
            disabled={saved}
            onClick={() => setValue(v)}
            className="rounded-pill border border-line bg-surface px-3 py-1 font-mono text-1 text-ink hover:bg-surface-2 disabled:opacity-50"
          >
            {label} · {formatPercent(v, locale)}
          </button>
        ))}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-md border border-line p-3">
          <dt className="text-1 font-bold text-accent">{canadaSays}</dt>
          <dd className="m-0 font-mono text-4 tabular">{formatPercent(crowd, locale)}</dd>
        </div>
        <div className="rounded-md border border-line p-3">
          <dt className="text-1 text-ink-2">{t.you}</dt>
          <dd className="m-0 font-mono text-4 tabular">{formatPercent(value, locale)}</dd>
        </div>
      </dl>

      {saved ? (
        <div className="mt-4 grid gap-3">
          <p role="status" className="m-0 rounded-md bg-yes-soft p-3 text-2">
            <strong>{t.saved}.</strong> {gapText} {t.scoredWhen}
          </p>
          <button type="button" onClick={() => setSaved(false)} className="justify-self-start rounded-md border border-line px-4 py-2 text-2 font-semibold hover:bg-surface-2">
            {t.change}
          </button>
        </div>
      ) : (
        <button type="button" onClick={save} className="mt-4 w-full rounded-md bg-ink px-4 py-3 text-3 font-bold text-paper hover:opacity-90">
          {t.save}
        </button>
      )}
      <p className="mt-3 text-1 text-ink-2">{t.demoNote}</p>
    </section>
  );
}
