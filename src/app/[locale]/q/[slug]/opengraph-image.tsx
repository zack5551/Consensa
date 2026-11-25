import { shareCardImage } from "@/components/share-card-image";
import { cardSize } from "@/components/share-card-parts";
import { BRAND_NAME } from "@/lib/brand";
import { notFound } from "next/navigation";
import { sampleQuestions } from "@/content/sample-questions";
import { siteQuestion } from "@/lib/site-questions";
import { siteNow } from "@/lib/clock";
import { isLocale, locales } from "@/i18n/config";
import { withLiveQuestion } from "@/lib/live";

/**
 * The share card for one question, 1200×630.
 * One message: the question, laid out like a poll, with where Canada stands on it (empty answer rows until 5 people have called).
 * A cancelled question says it was cancelled instead of the answer rows, with no number and no invitation to call.
 * One action: none on the card itself; it is the picture behind a shared link to the question page.
 * LEX: text and percentages only, no team or league logos, no photos, and the free/no-value label on every card.
 * It reads the same content and crowd number as the page (withLiveQuestion), refreshed on the same one-minute clock.
 */
export const alt = BRAND_NAME;
export const size = cardSize;
export const contentType = "image/png";
export const revalidate = 60;
export const dynamicParams = true;

export function generateStaticParams() {
  return locales.flatMap((locale) => sampleQuestions.map((q) => ({ locale, slug: q.slug })));
}

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const q = await withLiveQuestion(await siteQuestion(slug));
  if (!isLocale(locale) || !q) notFound();
  return shareCardImage(q, locale, siteNow());
}
