/*
 * Screen: My record / « Mon bilan ».
 * One message: how sharp your calls are compared with Canada ("26% sharper than Canada").
 * One action: make today's calls (the record only grows with new calls).
 * Foot of the page: the account area (choices, download my data, delete my account) once accounts are on.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountPanel } from "@/components/account-panel";
import { LeaderboardTable } from "@/components/leaderboard-table";
import { PendingCalls } from "@/components/pending-calls";
import { RecordView } from "@/components/record-view";
import { ScreenView } from "@/components/screen-view";
import { getForecaster, SAMPLE_ME, sampleForecasters } from "@/content/sample-forecasters";
import { SAMPLE_NOW, sampleQuestions } from "@/content/sample-questions";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { formatLongDate } from "@/lib/format";
import { rankForecasters } from "@/lib/leaderboard";
import { questionState } from "@/lib/question";
import { fill } from "@/lib/text";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).meta.recordTitle, robots: { index: false }, alternates: { languages: { "en-CA": "/en/record", "fr-CA": "/fr/record" } } };
}

export default async function RecordPage({ params }: { params: Params }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const me = getForecaster(SAMPLE_ME);
  if (!me) notFound();
  const board = rankForecasters(sampleForecasters);
  const myRow = board.find((r) => r.handle === SAMPLE_ME);
  const teaser = [...board.slice(0, 3), ...(myRow && myRow.rank > 3 ? [myRow] : [])];

  const pending = sampleQuestions
    .filter((q) => {
      const s = questionState(q, SAMPLE_NOW);
      return q.scored && s !== "resolved";
    })
    .map((q) => ({ slug: q.slug, href: `/${locale}/q/${q.slug}`, question: q.question[locale], closes: fill(t.record.closesOn, { date: formatLongDate(q.closesAt, locale) }) }));

  const todayLink = (
    <Link href={`/${locale}`} className="rounded-control bg-ink px-4 py-2 text-body-sm font-bold text-paper hover:opacity-90">
      {t.record.action}
    </Link>
  );

  return (
    <div className="grid gap-12">
      <ScreenView locale={locale} screen="record" />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-3">
          <h1 className="m-0 font-display text-headline font-bold tracking-tight text-balance sm:text-display">{t.record.title}</h1>
          <p className="m-0 max-w-[60ch] text-body-lg text-ink-2">{t.record.subtitle}</p>
          <p className="m-0 text-caption text-ink-2">{t.record.sampleNote}</p>
        </div>
        {todayLink}
      </header>

      <RecordView locale={locale} t={t} forecaster={me} board={board} youLabel={t.record.you} emptyAction={todayLink}>
        <PendingCalls
          items={pending}
          title={t.record.pendingTitle}
          help={t.record.pendingHelp}
          empty={t.record.pendingEmpty}
          action={{ href: `/${locale}`, label: t.record.pendingAction }}
          locale={locale}
        />
        <section aria-labelledby="record-board" className="grid gap-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="record-board" className="m-0 font-display text-headline font-bold tracking-tight text-balance">
              {t.record.leaderboardTitle}
            </h2>
            <Link href={`/${locale}/leaderboard`} className="text-body-sm font-semibold text-link underline underline-offset-4">
              {t.record.seeLeaderboard}
            </Link>
          </div>
          <p className="m-0 max-w-[60ch] text-body text-ink-2">{t.leaderboard.subtitle}</p>
          <LeaderboardTable rows={teaser} me={SAMPLE_ME} locale={locale} t={t} label={fill(t.leaderboard.tableLabel, { board: t.leaderboard.tabs.canada })} compact />
        </section>
      </RecordView>

      <AccountPanel locale={locale} t={t.account} consentLabels={{ dataLicensing: t.onboarding.account.dataLicensing, analytics: t.onboarding.account.analytics, marketing: t.onboarding.account.marketing }} />
    </div>
  );
}
