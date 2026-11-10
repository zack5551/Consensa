/*
 * Screen: onboarding (Get started).
 * One message: a few quick choices, and you're making calls.
 * One action: answer this step's one question.
 * Legal (LEX §6): an 18+ check that keeps only yes/no, then three separate unticked consents with the privacy summary linked.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OnboardingFlow } from "@/components/onboarding-flow";
import { ScreenView } from "@/components/screen-view";
import { Wordmark } from "@/components/wordmark";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: getDictionary(locale).onboarding.title,
    robots: { index: false },
    alternates: { languages: { "en-CA": "/en/welcome", "fr-CA": "/fr/welcome" } },
  };
}

export default async function WelcomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);

  return (
    <div className="mx-auto grid w-full max-w-[600px] gap-8 py-2 sm:py-8">
      <ScreenView locale={locale} screen="welcome" />
      <header className="grid gap-3">
        <Wordmark className="text-title" />
        <h1 className="m-0 text-body font-semibold text-ink-2">{t.onboarding.title}</h1>
      </header>
      <OnboardingFlow locale={locale} t={t.onboarding} regionNames={t.province.names} categoryNames={t.board.categories} pollLabel={t.question.poll} />
    </div>
  );
}
