"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Icon } from "@/components/shell/icons";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { emailSchema, isAdult, PROFILE_STORAGE_KEY, regionChoices, stepNumber, steps, todayInToronto, type RegionChoice, type Step } from "@/lib/onboarding";
import { categories, type Category } from "@/lib/question";
import { fill } from "@/lib/text";

type Props = {
  locale: Locale;
  t: Dictionary["onboarding"];
  regionNames: Dictionary["province"]["names"];
  categoryNames: Dictionary["board"]["categories"];
  pollLabel: string;
};

/** What the preview remembers on this device. No birth date: only that the age check passed (LEX §6). */
type StoredProfile = {
  locale: Locale;
  adult: true;
  region: RegionChoice;
  topics: Category[];
  email: string;
  consents: { terms: true; dataLicensing: boolean; marketing: boolean; at: string };
};

const BLOCK_KEY = "consensa:age-blocked";
const STEP_KEY = "consensa:onboarding";

type Draft = { region: RegionChoice | null; topics: Category[] };

function readDraft(): Draft {
  try {
    const raw = window.sessionStorage.getItem(STEP_KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<Draft>;
      return { region: regionChoices.includes(d.region as RegionChoice) ? (d.region as RegionChoice) : null, topics: (d.topics ?? []).filter((c): c is Category => (categories as readonly string[]).includes(c)) };
    }
  } catch {
    /* ignore */
  }
  return { region: null, topics: [] };
}

/**
 * Onboarding: language → 18+ check → region → topics → account with three separate, unticked consents → done.
 * Each step is one question with one action. Focus moves to the new step's heading so screen-reader and
 * keyboard users always know where they are. Nothing is sent anywhere until accounts exist (M2).
 */
export function OnboardingFlow({ locale, t, regionNames, categoryNames, pollLabel }: Props) {
  const [step, setStep] = useState<Step>("language");
  const [blocked, setBlocked] = useState(false);
  const [draft, setDraft] = useState<Draft>({ region: null, topics: [] });
  const [saved, setSaved] = useState<StoredProfile | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  const ids = useId();

  // Resume: a language switch reloads the page in the other locale with ?step=age.
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(BLOCK_KEY) === "1") setBlocked(true);
    } catch {
      /* ignore */
    }
    setDraft(readDraft());
    const requested = new URLSearchParams(window.location.search).get("step");
    if (requested === "age") setStep("age");
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STEP_KEY, JSON.stringify(draft));
    } catch {
      /* ignore */
    }
  }, [draft]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus();
  }, [step, blocked]);

  const go = (next: Step) => setStep(next);
  const back = () => go(steps[Math.max(0, steps.indexOf(step) - 1)] ?? "language");

  if (blocked) {
    return (
      <Panel headingRef={heading} title={t.age.underTitle} body={t.age.underBody}>
        <Link href={`/${locale}`} className="justify-self-start rounded-control bg-ink px-5 py-3 text-body font-bold text-paper hover:opacity-90">
          {t.age.underAction}
        </Link>
      </Panel>
    );
  }

  const { current, total } = stepNumber(step);
  const progress = step === "done" ? null : (
    <div className="grid gap-2">
      <p className="m-0 text-caption font-semibold text-ink-2 tabular">{fill(t.stepOf, { current, total })}</p>
      <div className="h-1.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-label={fill(t.stepOf, { current, total })} aria-valuemin={1} aria-valuemax={total} aria-valuenow={current}>
        <div className="h-full rounded-full bg-side-a transition-[width] duration-[var(--cn-duration-slow)] ease-[var(--cn-ease-out)]" style={{ width: `${(current / total) * 100}%` }} />
      </div>
    </div>
  );

  const backButton = (
    <button type="button" onClick={back} className="inline-flex min-h-11 items-center rounded-control px-3 text-body font-semibold text-ink-2 hover:bg-sunken hover:text-ink">
      {t.back}
    </button>
  );

  return (
    <div className="grid gap-6">
      {progress}

      {step === "language" && (
        <Panel headingRef={heading} title={t.language.title} body={t.language.body}>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["fr", "en"] as const).map((l) => {
              const isCurrent = l === locale;
              const label = l === "fr" ? t.language.fr : t.language.en;
              return isCurrent ? (
                <button key={l} type="button" lang={l} onClick={() => go("age")} className="flex min-h-16 items-center justify-between rounded-card border-2 border-ink bg-surface px-5 py-4 text-left text-title-sm font-bold hover:bg-sunken">
                  {label}
                  <Icon name="arrow" />
                </button>
              ) : (
                <a
                  key={l}
                  href={`/${l}/welcome?step=age`}
                  lang={l}
                  hrefLang={l}
                  onClick={() => {
                    document.cookie = `locale=${l}; path=/; max-age=31536000; samesite=lax`;
                  }}
                  className="flex min-h-16 items-center justify-between rounded-card border border-line bg-surface px-5 py-4 text-title-sm font-bold hover:bg-sunken"
                >
                  {label}
                  <Icon name="arrow" />
                </a>
              );
            })}
          </div>
        </Panel>
      )}

      {step === "age" && (
        <AgeStep
          t={t}
          headingRef={heading}
          back={backButton}
          onAdult={() => go("region")}
          onUnder={() => {
            try {
              window.sessionStorage.setItem(BLOCK_KEY, "1");
            } catch {
              /* ignore */
            }
            setBlocked(true);
          }}
        />
      )}

      {step === "region" && (
        <Panel headingRef={heading} title={t.region.title} body={t.region.body}>
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="sr-only">{t.region.legend}</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {regionChoices.map((r) => (
                <label
                  key={r}
                  className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-control border px-4 py-3 text-body font-semibold has-[:checked]:border-ink has-[:checked]:bg-sunken has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--cn-focus)] ${
                    r === "none" ? "col-span-2 border-dashed border-line-strong sm:col-span-3" : "border-line"
                  }`}
                >
                  <input type="radio" name={`${ids}-region`} value={r} checked={draft.region === r} onChange={() => setDraft((d) => ({ ...d, region: r }))} className="size-4 accent-[var(--cn-side-a)]" />
                  {r === "none" ? t.region.none : regionNames[r]}
                </label>
              ))}
            </div>
          </fieldset>
          <Actions back={backButton}>
            <button type="button" disabled={!draft.region} onClick={() => go("topics")} className="min-h-11 rounded-control bg-ink px-5 py-3 text-body font-bold text-paper hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
              {t.next}
            </button>
          </Actions>
        </Panel>
      )}

      {step === "topics" && (
        <Panel headingRef={heading} title={t.topics.title} body={t.topics.body}>
          <fieldset className="m-0 grid gap-3 border-0 p-0">
            <legend className="sr-only">{t.topics.legend}</legend>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <label
                  key={c}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-body font-semibold has-[:checked]:border-side-a has-[:checked]:bg-side-a-soft has-[:checked]:text-side-a-text has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--cn-focus)]"
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={draft.topics.includes(c)}
                    onChange={(e) => setDraft((d) => ({ ...d, topics: e.target.checked ? [...d.topics, c] : d.topics.filter((x) => x !== c) }))}
                  />
                  {draft.topics.includes(c) && <Icon name="check" className="size-4" />}
                  {categoryNames[c]}
                  {c === "sports" && <span className="text-caption font-normal opacity-80">· {pollLabel}</span>}
                </label>
              ))}
            </div>
            <p className="m-0 text-caption text-ink-2">{t.topics.sportsNote}</p>
          </fieldset>
          <Actions back={backButton}>
            <button type="button" onClick={() => go("account")} className="min-h-11 rounded-control bg-ink px-5 py-3 text-body font-bold text-paper hover:opacity-90">
              {draft.topics.length ? t.next : t.skip}
            </button>
          </Actions>
        </Panel>
      )}

      {step === "account" && (
        <AccountStep
          t={t}
          locale={locale}
          headingRef={heading}
          back={backButton}
          onDone={(email, consents) => {
            const profile: StoredProfile = {
              locale,
              adult: true,
              region: draft.region ?? "none",
              topics: draft.topics,
              email,
              consents: { terms: true, ...consents, at: new Date().toISOString() },
            };
            try {
              window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
              window.sessionStorage.removeItem(STEP_KEY);
            } catch {
              /* storage blocked: the choices last for this visit */
            }
            setSaved(profile);
            go("done");
          }}
        />
      )}

      {step === "done" && saved && (
        <Panel headingRef={heading} title={t.done.title} body={t.done.body}>
          <dl className="m-0 grid gap-px overflow-hidden rounded-card border border-line bg-line">
            <Row term={t.done.language} value={saved.locale === "fr" ? t.language.fr : t.language.en} />
            <Row term={t.done.region} value={saved.region === "none" ? t.region.none : regionNames[saved.region]} />
            <Row term={t.done.topics} value={saved.topics.length ? saved.topics.map((c) => categoryNames[c]).join(", ") : t.done.noTopics} />
            <Row
              term={t.done.summary}
              value={fill(t.done.consents, { data: saved.consents.dataLicensing ? t.done.yes : t.done.no, marketing: saved.consents.marketing ? t.done.yes : t.done.no })}
            />
          </dl>
          <Link href={`/${locale}/today`} className="inline-flex items-center justify-center gap-2 rounded-control bg-ink px-5 py-3 text-body font-bold text-paper hover:opacity-90 sm:justify-self-start">
            {t.done.action}
            <Icon name="arrow" className="size-4" />
          </Link>
        </Panel>
      )}

      <p className="m-0 text-caption text-ink-2">{t.previewNote}</p>
    </div>
  );
}

function Panel({ headingRef, title, body, children }: { headingRef: React.RefObject<HTMLHeadingElement | null>; title: string; body: string; children: ReactNode }) {
  return (
    <section className="grid gap-6">
      <div className="grid gap-2">
        <h2 ref={headingRef} tabIndex={-1} className="m-0 font-display text-headline font-extrabold tracking-tight text-balance outline-none">
          {title}
        </h2>
        <p className="m-0 text-body-lg text-ink-2">{body}</p>
      </div>
      {children}
    </section>
  );
}

function Actions({ back, children }: { back: ReactNode; children: ReactNode }) {
  return <div className="flex flex-wrap-reverse items-center justify-between gap-3 border-t border-line pt-5">{back}{children}</div>;
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="grid gap-1 bg-surface px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-body-sm text-ink-2">{term}</dt>
      <dd className="m-0 text-body-sm font-semibold">{value}</dd>
    </div>
  );
}

function AgeStep({ t, headingRef, back, onAdult, onUnder }: { t: Dictionary["onboarding"]; headingRef: React.RefObject<HTMLHeadingElement | null>; back: ReactNode; onAdult: () => void; onUnder: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const ids = useId();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      setError(true);
      return;
    }
    if (isAdult(value, todayInToronto())) onAdult();
    else onUnder();
  }

  return (
    <Panel headingRef={headingRef} title={t.age.title} body={t.age.body}>
      <form onSubmit={submit} noValidate className="grid gap-5">
        <div className="grid gap-2">
          <label htmlFor={`${ids}-dob`} className="text-body font-semibold">
            {t.age.label}
          </label>
          <input
            id={`${ids}-dob`}
            type="date"
            value={value}
            max={todayInToronto()}
            min="1900-01-01"
            autoComplete="bday"
            aria-invalid={error || undefined}
            aria-describedby={error ? `${ids}-err` : undefined}
            onChange={(e) => {
              setValue(e.target.value);
              setError(false);
            }}
            className="h-12 w-full max-w-xs rounded-control border border-control bg-surface px-3 text-body text-ink aria-[invalid]:border-[var(--cn-danger)]"
          />
          {error && (
            <p id={`${ids}-err`} className="m-0 text-body-sm font-semibold text-[var(--cn-danger)]">
              {t.age.invalid}
            </p>
          )}
        </div>
        <Actions back={back}>
          <button type="submit" className="min-h-11 rounded-control bg-ink px-5 py-3 text-body font-bold text-paper hover:opacity-90">
            {t.next}
          </button>
        </Actions>
      </form>
    </Panel>
  );
}

function AccountStep({
  t,
  locale,
  headingRef,
  back,
  onDone,
}: {
  t: Dictionary["onboarding"];
  locale: Locale;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  back: ReactNode;
  onDone: (email: string, consents: { dataLicensing: boolean; marketing: boolean }) => void;
}) {
  const [email, setEmail] = useState("");
  const [terms, setTerms] = useState(false);
  const [dataLicensing, setDataLicensing] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [errors, setErrors] = useState<{ email?: boolean; terms?: boolean }>({});
  const emailRef = useRef<HTMLInputElement>(null);
  const termsRef = useRef<HTMLInputElement>(null);
  const ids = useId();

  function submit(e: FormEvent) {
    e.preventDefault();
    const emailOk = emailSchema.safeParse(email.trim()).success;
    const next = { email: !emailOk, terms: !terms };
    setErrors(next);
    if (next.email) return emailRef.current?.focus();
    if (next.terms) return termsRef.current?.focus();
    onDone(email.trim(), { dataLicensing, marketing });
  }

  const [beforeTerms, afterTerms = ""] = t.account.terms.split("{terms}");
  const [between, afterPrivacy = ""] = afterTerms.split("{privacy}");

  return (
    <Panel headingRef={headingRef} title={t.account.title} body={t.account.body}>
      <form onSubmit={submit} noValidate className="grid gap-6">
        <div className="grid gap-2">
          <label htmlFor={`${ids}-email`} className="text-body font-semibold">
            {t.account.email}
          </label>
          <input
            ref={emailRef}
            id={`${ids}-email`}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={errors.email || undefined}
            aria-describedby={`${ids}-email-hint${errors.email ? ` ${ids}-email-err` : ""}`}
            className="h-12 w-full rounded-control border border-control bg-surface px-3 text-body text-ink aria-[invalid]:border-[var(--cn-danger)]"
          />
          <p id={`${ids}-email-hint`} className="m-0 text-caption text-ink-2">
            {t.account.emailHint}
          </p>
          {errors.email && (
            <p id={`${ids}-email-err`} className="m-0 text-body-sm font-semibold text-[var(--cn-danger)]">
              {t.account.emailInvalid}
            </p>
          )}
        </div>

        <fieldset className="m-0 grid gap-3 border-0 p-0" aria-describedby={`${ids}-consents-hint`}>
          <legend className="mb-1 text-body font-semibold">{t.account.consentsLegend}</legend>
          <p id={`${ids}-consents-hint`} className="m-0 text-caption text-ink-2">
            {t.account.consentsHint}
          </p>

          <Consent
            id={`${ids}-terms`}
            inputRef={termsRef}
            checked={terms}
            onChange={setTerms}
            invalid={errors.terms}
            errorId={`${ids}-terms-err`}
          >
            {beforeTerms}
            <Link href={`/${locale}/terms`} target="_blank" className="font-semibold text-link underline underline-offset-2">
              {t.account.termsLink}
            </Link>
            {between}
            <Link href={`/${locale}/privacy`} target="_blank" className="font-semibold text-link underline underline-offset-2">
              {t.account.privacyLink}
            </Link>
            {afterPrivacy}
          </Consent>
          {errors.terms && (
            <p id={`${ids}-terms-err`} className="m-0 text-body-sm font-semibold text-[var(--cn-danger)]">
              {t.account.termsRequired}
            </p>
          )}

          <Consent id={`${ids}-data`} checked={dataLicensing} onChange={setDataLicensing} tag={t.account.optional}>
            {t.account.dataLicensing}
          </Consent>
          <Consent id={`${ids}-mkt`} checked={marketing} onChange={setMarketing} tag={t.account.optional}>
            {t.account.marketing}
          </Consent>
        </fieldset>

        <Actions back={back}>
          <button type="submit" className="min-h-11 rounded-control bg-ink px-5 py-3 text-body font-bold text-paper hover:opacity-90">
            {t.account.submit}
          </button>
        </Actions>
      </form>
    </Panel>
  );
}

function Consent({
  id,
  checked,
  onChange,
  children,
  tag,
  invalid,
  errorId,
  inputRef,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  tag?: string;
  invalid?: boolean;
  errorId?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className={`flex gap-3 rounded-control border p-4 ${invalid ? "border-[var(--cn-danger)]" : "border-line"} bg-surface`}>
      <input
        ref={inputRef}
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        className="mt-0.5 size-5 shrink-0 accent-[var(--cn-side-a)]"
      />
      <label htmlFor={id} className="grid gap-1 text-body-sm text-ink">
        <span>{children}</span>
        {tag && <span className="text-caption text-ink-2">{tag}</span>}
      </label>
    </div>
  );
}
