import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { CardFrame, CardWordmark, cardFonts } from "@/components/share-card-parts";
import { sampleQuestions } from "@/content/sample-questions";
import { siteNow } from "@/lib/clock";
import { answeredQuestions, monthKey, recapMonths } from "@/lib/come-back";
import { isLocale, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { BRAND_NAME } from "@/lib/brand";
import { formatMonth } from "@/lib/format";
import { cardSafe } from "@/lib/share";
import { shareCardColors as c } from "@/lib/share-card-colors";
import { fill } from "@/lib/text";

/**
 * The monthly recap card, 1200×630: "7 questions answered in October".
 * One message: the month's answered questions. One action: none on the card; it is the picture behind a shared recap.
 * Privacy: built from the month alone, the same for everyone. The sharer's own numbers live only in their post's text.
 * LEX: text only, no crowd numbers (a card travels without the "sample numbers" notice), and the no-value footer.
 */
export const alt = BRAND_NAME;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 300;
export const dynamicParams = false;

export function generateStaticParams() {
  return locales.flatMap((locale) => recapMonths(answeredQuestions(sampleQuestions, siteNow()), siteNow()).map((month) => ({ locale, month })));
}

export default async function Image({ params }: { params: Promise<{ locale: string; month: string }> }) {
  const { locale, month } = await params;
  const answered = answeredQuestions(sampleQuestions, siteNow());
  if (!isLocale(locale) || !recapMonths(answered, siteNow()).includes(month)) notFound();
  const t = getDictionary(locale);
  const n = answered.filter((q) => monthKey(q.publishedAt) === month).length;
  const name = formatMonth(month, locale, { year: true });
  const title = cardSafe(fill(n === 1 ? t.recapPage.cardTitleOne : t.recapPage.cardTitleMany, { n, month: name }));
  const fonts = await cardFonts();

  return new ImageResponse(
    (
      <CardFrame footer={cardSafe(t.share.calledItFooter)}>
        <CardWordmark />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", gap: 18 }}>
          <div style={{ display: "flex", fontFamily: "Manrope", fontWeight: 800, fontSize: 72, lineHeight: 1.05, letterSpacing: -2, color: c.ink }}>{title}</div>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 600, color: c.inkMuted }}>{cardSafe(t.recapPage.cardSub)}</div>
        </div>
      </CardFrame>
    ),
    { ...size, fonts: [...fonts] },
  );
}
