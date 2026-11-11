"use client";

import { useEffect, useId, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { track } from "@/lib/analytics";
import { readCall, saveCall } from "@/lib/calls-store";
import { formatBrier, formatPercent } from "@/lib/format";
import { PROFILE_STORAGE_KEY } from "@/lib/onboarding";
import { provinces, type Province, type QuestionState } from "@/lib/question";
import { brierScore, gapToCrowd, versusCrowd } from "@/lib/scoring";
import { accountsEnabled } from "@/lib/supabase/env";
import { fill } from "@/lib/text";

type Props = {
  slug: string;
  crowd: number;
  locale: Locale;
  t: Dictionary["call"];
  canadaSays: string;
  state?: QuestionState;
  scored?: boolean;
  outcome?: "yes" | "no";
  /** Already formatted for the locale, e.g. "October 21, 2026". */
  closedOn?: string;
  /** This question's region numbers. With the region from onboarding, your own region shows beside Canada. */
  regions?: { values: Record<Province, number>; hidden?: readonly Province[]; names: Record<Province, string> };
};

/** The region chosen at onboarding, if this browser has one. */
function myRegion(): Province | null {
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    const region = raw ? (JSON.parse(raw) as { region?: unknown }).region : null;
    return typeof region === "string" && (provinces as readonly string[]).includes(region) ? (region as Province) : null;
  } catch {
    return null;
  }
}

const quickSets = [10, 50, 75] as const;

/**
 * The one action on a question page: set a probability and save it.
 * Once a question closes, the same panel shows your call and, after the result, "Called it!" or "Not this time."
 */
export function CallPanel({ slug, crowd, locale, t, canadaSays, state = "open", scored = true, outcome, closedOn = "", regions }: Props) {
  const [value, setValue] = useState(50);
  const [saved, setSaved] = useState(false);
  const [stored, setStored] = useState<number | null>(null);
  const [region, setRegion] = useState<Province | null>(null);
  const id = useId();
  const pct = (v: number) => formatPercent(v, locale);
  const accepting = state === "open" || state === "closingSoon";

  useEffect(() => {
    setRegion(myRegion());
  }, []);

  useEffect(() => {
    const existing = readCall(slug);
    setStored(existing);
    if (existing !== null) {
      setValue(existing);
      setSaved(true);
    }
  }, [slug]);

  function save() {
    saveCall(slug, value);
    track("call_made", { locale, slug, value, gapToCrowd: gapToCrowd(value, crowd), scored, changed: stored !== null });
    setStored(value);
    setSaved(true);
  }

  if (!accepting) {
    return (
      <section aria-labelledby={`${id}-title`} className="rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 id={`${id}-title`} className="m-0 text-title-sm font-bold">
          {t.closedTitle}
        </h2>
        <p className="mt-1 text-body-sm text-ink-2">{fill(t.closedBody, { date: closedOn })}</p>
        <ClosedResult stored={stored} crowd={crowd} state={state} outcome={outcome} scored={scored} t={t} canadaSays={canadaSays} pct={pct} locale={locale} />
      </section>
    );
  }

  // Your region's number shows once you've saved a call, so it informs the result, not the call itself.
  const regionValue = saved && region !== null && regions && !regions.hidden?.includes(region) ? regions.values[region] : null;
  const gap = gapToCrowd(value, crowd);
  const gapText = gap === 0 ? t.sameAsCrowd : fill(gap > 0 ? t.moreThan : t.lessThan, { n: Math.abs(gap) });
  const sideText = value < 50 ? "text-side-b-text" : "text-side-a-text";

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-card border border-line bg-surface p-5 shadow-card">
      <h2 id={`${id}-title`} className="m-0 text-title-sm font-bold">
        {t.title}
      </h2>
      <p id={`${id}-hint`} className="mt-1 text-body-sm text-ink-2">
        {t.hint}
      </p>

      <output htmlFor={`${id}-slider`} className={`mt-4 block text-center font-display text-display font-semibold tabular ${sideText}`} aria-live="polite">
        {pct(value)}
      </output>

      <input
        id={`${id}-slider`}
        type="range"
        min={1}
        max={99}
        step={1}
        value={value}
        disabled={saved}
        aria-label={t.sliderLabel}
        aria-describedby={`${id}-hint`}
        aria-valuetext={pct(value)}
        onChange={(e) => setValue(Number(e.target.value))}
        className="mt-3 h-8 w-full cursor-pointer accent-[var(--cn-side-a)] disabled:cursor-not-allowed disabled:opacity-60"
      />

      {/* Presets sit on one row at French length: label over number, three equal columns. */}
      <div className="mt-2 grid grid-cols-3 gap-2">
        {quickSets.map((v) => (
          <button
            key={v}
            type="button"
            disabled={saved}
            aria-pressed={value === v}
            onClick={() => setValue(v)}
            className="grid min-h-11 content-center rounded-control border border-line bg-surface px-2 py-1.5 text-center text-caption leading-tight text-ink-2 hover:bg-sunken aria-pressed:border-side-a aria-pressed:text-ink disabled:opacity-50"
          >
            <span>{v === 10 ? t.quick.unlikely : v === 50 ? t.quick.tossUp : t.quick.likely}</span>
            <span className="font-semibold text-ink tabular">{pct(v)}</span>
          </button>
        ))}
      </div>

      {/* What this call would score either way, so the scoring rule is clear before saving. Scored questions only. */}
      {scored && (
        <p className="mt-3 mb-0 text-caption text-ink-2 tabular">
          {fill(t.ifResult, { yes: formatBrier(brierScore(value / 100, 1), locale), no: formatBrier(brierScore(value / 100, 0), locale) })}
        </p>
      )}

      <dl className={`mt-4 grid gap-3 ${regionValue === null ? "grid-cols-2" : "grid-cols-3"}`}>
        <div className="border-t-2 border-canada pt-2">
          <dt className="text-caption font-bold text-canada">{canadaSays}</dt>
          <dd className="m-0 font-display text-title font-bold tabular">{pct(crowd)}</dd>
        </div>
        {regionValue !== null && region !== null && regions ? (
          <div className="border-t-2 border-line pt-2">
            <dt className="text-caption font-bold text-ink-2">{fill(t.yourRegion, { region: regions.names[region] })}</dt>
            <dd className="m-0 font-display text-title font-bold tabular">{pct(regionValue)}</dd>
          </div>
        ) : null}
        <div className="border-t-2 border-ink pt-2">
          <dt className="text-caption font-bold text-ink-2">{t.you}</dt>
          <dd className="m-0 font-display text-title font-bold tabular">{pct(value)}</dd>
        </div>
      </dl>

      {saved ? (
        <div className="mt-4 grid gap-3">
          <p role="status" className="m-0 rounded-control bg-side-a-soft p-3 text-body-sm">
            <strong>{t.saved}.</strong> {gapText} {scored ? t.scoredWhen : t.pollNote}
          </p>
          <button type="button" onClick={() => setSaved(false)} className="min-h-11 justify-self-start rounded-control border border-line px-4 py-2 text-body-sm font-semibold hover:bg-sunken">
            {t.change}
          </button>
        </div>
      ) : (
        <button type="button" onClick={save} className="mt-4 min-h-12 w-full rounded-control bg-ink px-4 py-3 text-body font-bold text-paper hover:opacity-90">
          {t.save}
        </button>
      )}
      {!accountsEnabled && <p className="mt-3 mb-0 text-caption text-ink-2">{t.demoNote}</p>}
    </section>
  );
}

function ClosedResult({
  stored,
  crowd,
  state,
  outcome,
  scored,
  t,
  canadaSays,
  pct,
  locale,
}: {
  stored: number | null;
  crowd: number;
  state: QuestionState;
  outcome?: "yes" | "no";
  scored: boolean;
  t: Dictionary["call"];
  canadaSays: string;
  pct: (v: number) => string;
  locale: Locale;
}) {
  const resolved = state === "resolved" && outcome !== undefined;
  let verdict: string | null = null;
  let hit = false;
  if (resolved && stored !== null) {
    if (stored === 50) verdict = t.tossUp;
    else {
      hit = (stored > 50) === (outcome === "yes");
      verdict = hit ? t.calledIt : t.notThisTime;
    }
  }

  return (
    <div className="mt-4 grid gap-3">
      <dl className="m-0 grid grid-cols-2 gap-3">
        <div className="border-t-2 border-canada pt-2">
          <dt className="text-caption font-bold text-canada">{canadaSays}</dt>
          <dd className="m-0 font-display text-title font-bold tabular">{pct(crowd)}</dd>
        </div>
        <div className="border-t-2 border-ink pt-2">
          <dt className="text-caption font-bold text-ink-2">{t.you}</dt>
          <dd className="m-0 font-display text-title font-bold tabular">{stored === null ? "—" : pct(stored)}</dd>
        </div>
      </dl>
      <div role="status" className={`rounded-control p-3 text-body-sm ${hit ? "bg-side-a-soft" : "bg-sunken"}`}>
        {verdict && <p className={`m-0 font-display font-extrabold ${hit ? "text-title text-side-a-text" : "text-title-sm"}`}>{verdict}</p>}
        <p className="m-0">{stored === null ? t.noCall : fill(t.yourCall, { value: pct(stored) })}</p>
        {resolved && stored !== null && scored && (
          <>
            <p className="m-0 mt-1 text-ink-2 tabular">{fill(t.score, { score: formatBrier(brierScore(stored / 100, outcome === "yes" ? 1 : 0), locale) })}</p>
            <p className="m-0 mt-1 text-ink-2 tabular">
              {fill(t.vsCrowd[versusCrowd(stored, crowd, outcome === "yes" ? 1 : 0)], { crowd: formatBrier(brierScore(crowd / 100, outcome === "yes" ? 1 : 0), locale) })}
            </p>
          </>
        )}
        {state === "closed" && stored !== null && <p className="m-0 mt-1 text-ink-2">{t.waiting}</p>}
        {state === "disputed" && <p className="m-0 mt-1 text-ink-2">{t.disputed}</p>}
      </div>
    </div>
  );
}
