/*
 * Screen: privacy summary.
 * One message: your data stays in Canada and only combined numbers ever leave.
 * One action: read it (and come back to make a call). The lawyer-reviewed full text replaces the draft notice before launch.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalSummary } from "@/components/legal-summary";
import { ScreenView } from "@/components/screen-view";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";

const UPDATED_ON = "2026-11-06T12:00:00Z";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: getDictionary(locale).legalPages.privacy.title,
    alternates: { languages: { "en-CA": "/en/privacy", "fr-CA": "/fr/privacy" } },
  };
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale).legalPages;
  return (
    <>
      <ScreenView locale={locale} screen="privacy" />
      <LegalSummary locale={locale} title={t.privacy.title} intro={t.privacy.intro} draft={t.draft} updated={t.updated} updatedOn={UPDATED_ON} points={t.privacy.points} />
    </>
  );
}
