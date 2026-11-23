import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { CardFrame, CardWordmark, cardFonts } from "@/components/share-card-parts";
import { getQuestion, sampleQuestions } from "@/content/sample-questions";
import { siteNow } from "@/lib/clock";
import { isLocale, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { askedByLabel } from "@/lib/asked-by";
import { BRAND_NAME } from "@/lib/brand";
import { formatPercent, formatShortDate, formatCallCount } from "@/lib/format";
import { withLiveQuestion } from "@/lib/live";
import { crowdNow } from "@/lib/question";
import { calledItCards, calledItFooter, cardSafe, crowdForCard, hasCalledItCard } from "@/lib/share";
import { shareCardColors as c } from "@/lib/share-card-colors";
import { fill } from "@/lib/text";

/**
 * The "Called it!" card for one resolved question, 1200×630.
 * One message: "Called it!" on this question, with the official answer.
 * One action: none on the card itself; it is the picture behind a shared link to the called-it page.
 * Privacy: built from the question slug and the side that happened, and nothing else. No name, no account, no call
 * value: the address and the picture are the same for everyone who was on that side.
 * It exists only for a scored question whose official yes-or-no result is in and not under review, and only for the side
 * that happened; anything else (an open, disputed, unscored, cancelled or voided question) is a 404, so no card is drawn.
 * LEX: text and percentages only, the free/no-prize/no-value label on every card, and on sports the fan-forecast and
 * non-affiliation lines. The crowd's number shows only from 5 calls up (crowdForCard), as a chance of yes.
 */
export const alt = BRAND_NAME;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 60;
export const dynamicParams = false;

export function generateStaticParams() {
  return locales.flatMap((locale) => calledItCards(sampleQuestions, siteNow()).map((card) => ({ locale, ...card })));
}

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string; side: string }> }) {
  const { locale, slug, side } = await params;
  const q = await withLiveQuestion(getQuestion(slug));
  const result = q?.resolution.result;
  if (!isLocale(locale) || !q || !result || !hasCalledItCard(q, side, siteNow())) notFound();
  const t = getDictionary(locale);
  const crowd = crowdForCard(q, crowdNow(q));
  const legal = calledItFooter(t, q.category);
  const yes = side === "yes";
  const text = cardSafe(q.question[locale]);
  const questionSize = text.length > 110 ? 36 : text.length > 70 ? 40 : 46;
  const answer = cardSafe(fill(t.resolution.answerIs, { answer: yes ? t.question.yes : t.question.no }));
  const published = cardSafe(fill(t.share.calledItResult, { date: formatShortDate(result.publishedAt, locale) }));
  // LEX: a guest or brand question's label travels with it onto this card too, right above the question.
  const askedBy = q.askedBy ? cardSafe(askedByLabel(q.askedBy, t.question.askedBy)) : null;
  const fonts = await cardFonts();

  return new ImageResponse(
    (
      <CardFrame footer={cardSafe(legal.footer)} sportsFooter={legal.sports.map(cardSafe)} rule={c.ink}>
        <CardWordmark />

        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", gap: 14 }}>
          <div style={{ display: "flex", fontFamily: "Manrope", fontWeight: 800, fontSize: 96, lineHeight: 1, letterSpacing: -3, color: c.ink }}>{cardSafe(t.call.calledIt)}</div>
          {askedBy && <div style={{ display: "flex", fontSize: 22, fontWeight: 600, color: c.inkMuted }}>{askedBy}</div>}
          <div style={{ display: "flex", fontFamily: "Manrope", fontWeight: 700, fontSize: questionSize, lineHeight: 1.2, letterSpacing: -0.8, maxHeight: 180, overflow: "hidden" }}>{text}</div>
        </div>

        {/* The answer sits on its side's colour (teal = yes, violet = no), with the date the official result came out. */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 24, fontWeight: 600, color: c.inkMuted }}>
          <div style={{ display: "flex", fontSize: 30, color: c.onFill, background: yes ? c.sideA : c.sideB, padding: "12px 30px", borderRadius: 999 }}>{answer}</div>
          <span>{published}</span>
        </div>

        {/* The crowd's chance of yes, only when it is real and from 5 calls up (crowdForCard), the same rule as the question card. */}
        {crowd !== null && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 14, fontSize: 22, fontWeight: 600, color: c.inkMuted }}>
            <span style={{ color: c.ink }}>{cardSafe(fill(t.share.calledItCrowd, { crowd: formatPercent(crowd, locale) }))}</span>
            <span>{cardSafe(`· ${fill(t.share.cardCalls, { n: formatCallCount(q, locale) })}`)}</span>
          </div>
        )}
      </CardFrame>
    ),
    { ...size, fonts: [...fonts] },
  );
}
