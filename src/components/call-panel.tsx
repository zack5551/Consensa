"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { ShareBar } from "@/components/share-bar";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { track } from "@/lib/analytics";
import { setBotWidgetStrings } from "@/lib/bot-check-client";
import { crowdLeansOtherWay, crowdOnSide, fromProbability, SURE_DEFAULT, SURE_MAX, SURE_MIN, sureGap, toProbability, type Side } from "@/lib/call-side";
import { isBotCheckFailed, isOutsideCanada, isTermsOutdated, isVpnRefused, readCall, saveCall, subscribeOutsideCanada } from "@/lib/calls-store";
import { formatBrier, formatCount, formatPercent } from "@/lib/format";
import { PROFILE_STORAGE_KEY } from "@/lib/onboarding";
import { hasStarted, provinces, type Province, type QuestionOutcome, type QuestionState } from "@/lib/question";
import { brierScore, gapToCrowd, versusCrowd } from "@/lib/scoring";
import type { ShareLinks } from "@/lib/social";
import { accountsEnabled } from "@/lib/supabase/env";
import { welcomeHref } from "@/lib/return-path";
import { fill } from "@/lib/text";

type Props = {
  slug: string;
  crowd: number;
  locale: Locale;
  t: Dictionary["call"];
  canadaSays: string;
  /** The two answers, in the page's language: "Yes" and "No". */
  sides: Record<Side, string>;
  /** How many calls the crowd number is built from. */
  calls: number;
  /** When calls close, already worded and formatted for the locale, e.g. "Closes Dec. 9". */
  closes?: string;
  /** False where the page shows no crowd number: the answer bars then carry no percentages. */
  crowdShown?: boolean;
  state?: QuestionState;
  /** Sports: when the game starts. The page may have been rendered earlier, so the panel stops offering a call at this time on its own. */
  startsAt?: string;
  scored?: boolean;
  outcome?: QuestionOutcome;
  /** Already formatted for the locale, e.g. "October 21, 2026". */
  closedOn?: string;
  /** This question's region numbers. With the region from onboarding, your own region shows beside Canada. */
  regions?: { values: Record<Province, number>; hidden?: readonly Province[]; names: Record<Province, string> };
  /** Set on a resolved question: what "Share your call" posts if this browser's call was on the right side. */
  calledItShare?: CalledItShare;
};

/** The called-it page address (question and side only), the post line already filled, and the plain share links. */
export type CalledItShare = { t: Dictionary["share"]; text: string; url: string; links: ShareLinks };

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

/** Each side's colours, written out in full so Tailwind sees every class. Teal is yes, violet is no. */
const tone = {
  yes: {
    text: "text-side-a-text",
    soft: "bg-side-a-soft",
    fill: "bg-side-a",
    accent: "accent-[var(--cn-side-a)]",
    choice: "text-side-a-text hover:bg-side-a-soft aria-pressed:border-side-a aria-pressed:bg-side-a-soft",
  },
  no: {
    text: "text-side-b-text",
    soft: "bg-side-b-soft",
    fill: "bg-side-b",
    accent: "accent-[var(--cn-side-b)]",
    choice: "text-side-b-text hover:bg-side-b-soft aria-pressed:border-side-b aria-pressed:bg-side-b-soft",
  },
} as const satisfies Record<Side, Record<string, string>>;

const sideOrder = ["yes", "no"] as const;

/** Asked once per page load, and only after a call is saved: is this visitor signed in? null when the answer isn't known. */
let accountCheck: Promise<boolean | null> | null = null;
function signedInOnce(): Promise<boolean | null> {
  accountCheck ??= fetch("/api/session", { cache: "no-store" })
    .then((res) => (res.ok ? (res.json() as Promise<{ signedIn?: unknown } | null>) : null))
    .then((body) => (typeof body?.signedIn === "boolean" ? body.signedIn : null))
    .catch(() => null);
  return accountCheck;
}

/**
 * The one action on a question page, asked the way a poll asks it: tap Yes or No, say how sure you are, save.
 * After saving, the same panel shows where Canada stands as two answer bars. The stored call is still a 1–99
 * probability of yes (see src/lib/call-side.ts).
 * Once a question closes, the panel shows your call and, after the result, "Called it!" or "Not this time."
 * A cancelled question shows neither and no score: nobody is scored on a game that was not played.
 */
export function CallPanel({ slug, crowd, locale, t, canadaSays, sides, calls, closes = "", crowdShown = true, state = "open", startsAt, scored = true, outcome, closedOn = "", regions, calledItShare }: Props) {
  const [side, setSide] = useState<Side | null>(null);
  const [sure, setSure] = useState<number>(SURE_DEFAULT);
  const [saved, setSaved] = useState(false);
  const [stored, setStored] = useState<number | null>(null);
  const [region, setRegion] = useState<Province | null>(null);
  // null until the answer is known. A call is only scored on a record once it is saved to an account (LEX).
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const outside = useSyncExternalStore(subscribeOutsideCanada, isOutsideCanada, () => false);
  const botFailed = useSyncExternalStore(subscribeOutsideCanada, isBotCheckFailed, () => false);
  const vpn = useSyncExternalStore(subscribeOutsideCanada, isVpnRefused, () => false);
  const termsOld = useSyncExternalStore(subscribeOutsideCanada, isTermsOutdated, () => false);
  const id = useId();
  // The nudge brings people back here after signing up (checked with returnPath: a plain path only).
  const pathname = usePathname();
  const sliderRef = useRef<HTMLInputElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  // Where keyboard focus goes after a step changes, so it never falls back to the top of the page.
  const focusNext = useRef<"slider" | "change" | null>(null);
  const pct = (v: number) => formatPercent(v, locale);
  const [started, setStarted] = useState(false);
  const accepting = (state === "open" || state === "closingSoon") && !started;
  // Pre-game only (LEX): once the game starts, the panel shows the closed view even if the page is older than that.
  const shownState: QuestionState = started && (state === "open" || state === "closingSoon") ? "closed" : state;

  useEffect(() => {
    if (!startsAt) return;
    if (hasStarted(startsAt, new Date())) {
      setStarted(true);
      return;
    }
    const ms = Date.parse(startsAt) - Date.now();
    if (ms > 2 ** 31 - 1) return;
    const timer = window.setTimeout(() => setStarted(true), ms);
    return () => window.clearTimeout(timer);
  }, [startsAt]);

  useEffect(() => {
    setRegion(myRegion());
  }, []);

  useEffect(() => {
    setBotWidgetStrings(locale, t.botWidget);
  }, [locale, t.botWidget]);

  useEffect(() => {
    const existing = readCall(slug);
    setStored(existing);
    if (existing !== null) {
      const from = fromProbability(existing);
      setSide(from.side);
      setSure(from.sure);
      setSaved(true);
    }
  }, [slug]);

  useEffect(() => {
    if (!accountsEnabled || !saved) return;
    let live = true;
    void signedInOnce().then((answer) => {
      if (live) setSignedIn(answer);
    });
    return () => {
      live = false;
    };
  }, [saved]);

  useEffect(() => {
    if (focusNext.current === "slider") sliderRef.current?.focus();
    if (focusNext.current === "change") changeRef.current?.focus();
    focusNext.current = null;
  }, [saved]);

  if (!accepting) {
    return (
      <section aria-labelledby={`${id}-title`} className="rounded-card border border-line border-t-4 border-t-ink bg-surface p-5">
        <h2 id={`${id}-title`} className="m-0 font-display text-title font-bold tracking-tight">
          {t.closedTitle}
        </h2>
        <p className="mt-1 text-body-sm text-ink-2">{fill(t.closedBody, { date: closedOn })}</p>
        <ClosedResult stored={stored} crowd={crowd} state={shownState} outcome={outcome} scored={scored} t={t} canadaSays={canadaSays} pct={pct} locale={locale} calledItShare={calledItShare} />
      </section>
    );
  }

  function save(chosen: Side) {
    const value = toProbability(chosen, sure);
    saveCall(slug, value);
    track("call_made", { locale, slug, value, gapToCrowd: gapToCrowd(value, crowd), scored, changed: stored !== null });
    setStored(value);
    focusNext.current = "change";
    setSaved(true);
  }

  // Before a call: "22,980 calls · Closes Dec. 9". Under the results (LEX): "Average of 22,980 calls · Closes Dec. 9", because
  // Canada's number is the average of the calls, not a count of votes. Without a crowd number to show, only when it closes.
  const count = formatCount(calls, locale);
  const meta = [crowdShown ? (saved ? fill(t.averageOf, { n: count }) : calls === 1 ? t.callsOne : fill(t.calls, { n: count })) : "", closes].filter(Boolean);
  // Each part stays on one line with its dot, so a narrow panel breaks between parts and never inside "Closes Apr 15, 7:00 p.m. ET".
  const metaLine = meta.map((part, i) => (
    <Fragment key={part}>
      <span className="whitespace-nowrap">{i < meta.length - 1 ? `${part}\u00A0·` : part}</span>{" "}
    </Fragment>
  ));
  // Your region's number shows once you've saved a call, so it informs the result, not the call itself.
  const regionValue = saved && region !== null && regions && !regions.hidden?.includes(region) ? regions.values[region] : null;

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-card border border-line border-t-4 border-t-ink bg-surface p-5">
      <h2 id={`${id}-title`} className="m-0 font-display text-title font-bold tracking-tight">
        {t.title}
      </h2>

      {saved && side !== null ? (
        <div className="mt-4 grid gap-3">
          <ResultBars crowd={crowdShown ? crowd : null} chosen={side} sides={sides} summary={`${crowdShown ? `${fill(t.resultsCrowd, { label: canadaSays, yes: pct(crowd), n: count })} ` : ""}${fill(t.resultsYou, { side: sides[side] })}`} pct={pct} />
          <p className="m-0 text-caption text-ink-2 tabular">
            {crowdShown && <span className="whitespace-nowrap font-bold uppercase tracking-wide text-canada">{canadaSays}</span>}
            {crowdShown && meta.length > 0 ? "\u00A0· " : null}
            {metaLine}
          </p>
          <p role="status" className={`m-0 rounded-control p-3 text-body-sm ${tone[side].soft}`}>
            <strong>{fill(t.saved, { side: sides[side], value: pct(sure) })}</strong>{" "}
            {crowdShown && <>{crowdLeansOtherWay(side, crowd) ? fill(t.otherWay, { yes: pct(crowd) }) : sureGapText(t, sureGap(side, sure, crowd))} </>}
            {/* A call kept only in this browser is not scored on a record, so the line waits for a signed-in answer. */}
            {scored ? (!accountsEnabled || signedIn === true ? t.scoredWhen : null) : t.pollNote}
          </p>
          {signedIn === false && (
            <p className="m-0 text-body-sm text-ink-2">
              {t.nudge.before}{" "}
              <Link href={welcomeHref(locale, pathname)} className="font-semibold text-link underline underline-offset-2">
                {t.nudge.link}
              </Link>{" "}
              {t.nudge.after}
            </p>
          )}
          {regionValue !== null && region !== null && regions ? (
            <p className="m-0 flex items-baseline justify-between gap-3 border-t border-line pt-3 text-body-sm text-ink-2">
              <span>{fill(t.yourRegion, { region: regions.names[region] })}</span>
              <span className="font-display text-title-sm font-bold text-ink tabular">
                {sides.yes} {pct(regionValue)}
              </span>
            </p>
          ) : null}
          <button
            ref={changeRef}
            type="button"
            onClick={() => {
              focusNext.current = "slider";
              setSaved(false);
            }}
            className="min-h-11 justify-self-start rounded-control border border-control px-4 py-2 text-body-sm font-semibold hover:bg-sunken"
          >
            {t.change}
          </button>
        </div>
      ) : (
        <>
          <p id={`${id}-hint`} className="mt-1 mb-0 text-body-sm text-ink-2">
            {t.hint}
          </p>
          {/* Two answers of equal weight, like a poll. The other side stays one tap away after you choose. */}
          <div role="group" aria-labelledby={`${id}-title`} aria-describedby={`${id}-hint`} className="mt-4 grid gap-3">
            {sideOrder.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={side === s}
                onClick={() => setSide(s)}
                className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-full border-2 border-control bg-surface px-5 py-2 text-body-lg font-bold ${tone[s].choice}`}
              >
                {sides[s]}
                {side === s && <span aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>

          {side === null ? (
            meta.length > 0 && <p className="mt-3 mb-0 text-caption text-ink-2 tabular">{metaLine}</p>
          ) : (
            <>
              <label htmlFor={`${id}-slider`} className="mt-5 block text-body font-semibold">
                {t.howSure}
              </label>
              <output htmlFor={`${id}-slider`} className={`mt-1 block text-center font-display text-display-sm font-bold tabular ${tone[side].text}`} aria-live="polite">
                {fill(t.chance, { value: pct(sure) })}
              </output>
              <input
                ref={sliderRef}
                id={`${id}-slider`}
                type="range"
                min={SURE_MIN}
                max={SURE_MAX}
                step={1}
                value={sure}
                aria-valuetext={fill(t.sideChance, { side: sides[side], value: pct(sure) })}
                onChange={(e) => setSure(Number(e.target.value))}
                className={`mt-2 h-8 w-full cursor-pointer ${tone[side].accent}`}
              />
              <div className="flex justify-between gap-3 text-caption text-ink-2" aria-hidden="true">
                <span>{t.sure.low}</span>
                <span>{t.sure.high}</span>
              </div>

              {/* What this call would score either way, so the scoring rule is clear before saving. Scored questions only. */}
              {scored && (
                <p className="mt-3 mb-0 text-caption text-ink-2 tabular">
                  {fill(t.ifResult, { yes: formatBrier(brierScore(toProbability(side, sure) / 100, 1), locale), no: formatBrier(brierScore(toProbability(side, sure) / 100, 0), locale) })}
                </p>
              )}

              <button type="button" onClick={() => save(side)} className="mt-4 min-h-12 w-full rounded-control bg-ink px-4 py-3 text-body font-bold text-paper hover:opacity-90">
                {t.save}
              </button>
            </>
          )}
        </>
      )}
      <p role="status" className="mt-3 mb-0 text-caption text-ink-2 empty:hidden">
        {outside ? (
          t.outsideCanada
        ) : vpn ? (
          t.vpnRefused
        ) : botFailed ? (
          t.botCheckFailed
        ) : termsOld ? (
          <>
            {t.termsOutdated.before}{" "}
            <Link href={`/${locale}/terms#accept`} className="font-semibold text-link underline underline-offset-2">
              {t.termsOutdated.link}
            </Link>{" "}
            {t.termsOutdated.after}
          </>
        ) : null}
      </p>
      {!accountsEnabled && <p className="mt-3 mb-0 text-caption text-ink-2">{t.demoNote}</p>}
    </section>
  );
}

function sureGapText(t: Dictionary["call"], gap: number): string {
  if (gap === 0) return t.sameAsCrowd;
  if (Math.abs(gap) === 1) return gap > 0 ? t.moreThanOne : t.lessThanOne;
  return fill(gap > 0 ? t.moreThan : t.lessThan, { n: Math.abs(gap) });
}

/**
 * Where Canada stands, drawn like a poll's results: a soft track, a fill as wide as the answer's share, the answer
 * inside the fill and the percent beside it. A check marks the side you chose. With no crowd number to show
 * (`crowd` is null), the rows stay as plain answers with no percent. The picture is hidden from screen readers,
 * which get `summary` as one sentence instead.
 */
function ResultBars({ crowd, chosen, sides, summary, pct }: { crowd: number | null; chosen: Side; sides: Record<Side, string>; summary: string; pct: (v: number) => string }) {
  // The fills start at their label's width and grow to their share; the duration token is 0 for reduced motion.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div data-testid="result-bars">
      <p className="sr-only">{summary}</p>
      <div className="grid gap-2" aria-hidden="true">
        {sideOrder.map((s) => {
          const share = crowd === null ? null : crowdOnSide(s, crowd);
          return (
            <div key={s} className="flex items-center gap-3">
              <div className={`h-11 min-w-0 flex-1 overflow-hidden rounded-full ${tone[s].soft}`}>
                {/* The fill never gets narrower than its label, so "Yes" at 3% is still readable. */}
                <div
                  className={`flex h-full min-w-24 items-center gap-2 rounded-full pl-4 text-body font-bold transition-[width] duration-[var(--cn-duration-reveal)] ease-[var(--cn-ease-out)] ${share === null ? `w-full ${tone[s].text}` : `${tone[s].fill} text-paper`}`}
                  style={share === null ? undefined : { width: grown ? `${share}%` : undefined }}
                >
                  {sides[s]}
                  {chosen === s && <span>✓</span>}
                </div>
              </div>
              {share !== null && <span className={`w-16 shrink-0 text-right font-display text-title font-bold tabular ${tone[s].text}`}>{pct(share)}</span>}
            </div>
          );
        })}
      </div>
    </div>
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
  calledItShare,
}: {
  stored: number | null;
  crowd: number;
  state: QuestionState;
  outcome?: QuestionOutcome;
  scored: boolean;
  t: Dictionary["call"];
  canadaSays: string;
  pct: (v: number) => string;
  locale: Locale;
  calledItShare?: CalledItShare;
}) {
  // A cancelled question has no answer: no verdict and no score for anyone.
  const resolved = state === "resolved" && (outcome === "yes" || outcome === "no");
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
        {verdict && <p className={`m-0 font-display font-bold tracking-tight ${hit ? "text-title text-side-a-text" : "text-title-sm"}`}>{verdict}</p>}
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
        {state === "cancelled" && <p className="m-0 mt-1 text-ink-2">{t.cancelled}</p>}
      </div>
      {/* "Share your call", only beside a "Called it!": the link names the question and the side that happened, never the person or their number. */}
      {hit && calledItShare && <ShareBar t={calledItShare.t} title={calledItShare.t.calledItTitle} text={calledItShare.text} url={calledItShare.url} links={calledItShare.links} />}
    </div>
  );
}
