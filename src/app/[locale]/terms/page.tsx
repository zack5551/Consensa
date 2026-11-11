/*
 * Screen: terms summary.
 * One message: it's free, nothing has cash value, and calls are your own.
 * One action: read it (and come back to make a call). The lawyer-reviewed full text replaces the draft notice before launch.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalSummary } from "@/components/legal-summary";
import { ScreenView } from "@/components/screen-view";
import { TermsReview } from "@/components/terms-review";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";

const UPDATED_ON = "2026-11-06T12:00:00Z";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: getDictionary(locale).legalPages.terms.title,
    alternates: { languages: { "en-CA": "/en/terms", "fr-CA": "/fr/terms" } },
  };
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale).legalPages;
  return (
    <>
      <ScreenView locale={locale} screen="terms" />
      <TermsReview locale={locale} t={t.termsReview} />
      <LegalSummary locale={locale} title={t.terms.title} intro={t.terms.intro} draft={t.draft} updated={t.updated} updatedOn={UPDATED_ON} points={t.terms.points} />
    </>
  );
}
