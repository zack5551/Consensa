import { ImageResponse } from "next/og";
import { CardFrame, CardWordmark, cardFonts } from "@/components/share-card-parts";
import { BRAND_NAME } from "@/lib/brand";
import { notFound } from "next/navigation";
import { getQuestion, sampleQuestions, SAMPLE_NOW } from "@/content/sample-questions";
import { isLocale, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { formatCount, formatPercent, formatShortDate } from "@/lib/format";
import { withLiveQuestion } from "@/lib/live";
import { callsCloseAt, crowdNow, questionState } from "@/lib/question";
import { cardSafe, crowdForCard } from "@/lib/share";
import { fill } from "@/lib/text";
import { shareCardColors as c } from "@/lib/share-card-colors";

/**
 * The share card for one question, 1200×630.
 * One message: the question, laid out like a poll, with where Canada stands on it (empty answer rows until 5 people have called).
 * One action: none on the card itself; it is the picture behind a shared link to the question page.
 * LEX: text and percentages only, no team or league logos, no photos, and the free/no-value label on every card.
 * It reads the same content and crowd number as the page (withLiveQuestion), refreshed on the same one-minute clock.
 */
export const alt = BRAND_NAME;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 60;
export const dynamicParams = false;

export function generateStaticParams() {
  return locales.flatMap((locale) => sampleQuestions.map((q) => ({ locale, slug: q.slug })));
}

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const q = await withLiveQuestion(getQuestion(slug));
  if (!isLocale(locale) || !q) notFound();
  const t = getDictionary(locale);
  const crowd = crowdForCard(q, crowdNow(q));
  const sports = q.category === "sports";
  const footer = cardSafe(sports ? t.share.cardSports : t.share.cardNoValue);
  const state = questionState(q, SAMPLE_NOW);
  const settled = state === "resolved" || state === "disputed" || state === "closed";
  const text = cardSafe(q.question[locale]);
  const questionSize = text.length > 110 ? 40 : text.length > 70 ? 46 : 54;
  const closes = settled ? t.share.cardClosed : fill(t.share.cardCloses, { date: formatShortDate(callsCloseAt(q), locale) });
  const meta = cardSafe(crowd === null ? closes : `${fill(t.share.cardCalls, { n: formatCount(q.forecasters, locale) })} · ${closes}`);

  const fonts = await cardFonts();

  /** One answer row, read like a poll: a track, a fill as wide as the answer's share, the answer inside, the percent beside it. */
  const row = (label: string, share: number | null, fillColor: string, soft: string, textColor: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <div style={{ display: "flex", flex: 1, height: 76, borderRadius: 38, background: soft, overflow: "hidden" }}>
        {/* The fill never gets narrower than its label, so "Yes" at 3% is still readable. */}
        <div style={{ display: "flex", alignItems: "center", width: share === null ? "100%" : `${share}%`, minWidth: 130, height: "100%", borderRadius: 38, background: share === null ? soft : fillColor, color: share === null ? textColor : c.onFill, paddingLeft: 30, fontSize: 34, fontWeight: 600 }}>
          {cardSafe(label)}
        </div>
      </div>
      {share !== null && (
        <div style={{ display: "flex", justifyContent: "flex-end", width: 150, fontFamily: "Manrope", fontWeight: 800, fontSize: 46, color: textColor }}>{cardSafe(formatPercent(share, locale))}</div>
      )}
    </div>
  );

  return new ImageResponse(
    (
      <CardFrame footer={footer} sportsFooter={sports ? cardSafe(t.legal.sportsFooter) : undefined}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <CardWordmark />
          {!settled && (
            <div style={{ display: "flex", fontFamily: "Manrope", fontSize: 22, fontWeight: 700, color: c.paper, background: c.ink, padding: "10px 24px", borderRadius: 999 }}>{cardSafe(t.question.makeYourCall)}</div>
          )}
        </div>

        <div style={{ display: "flex", flex: 1, alignItems: "center", fontFamily: "Manrope", fontWeight: 800, fontSize: questionSize, lineHeight: 1.12, letterSpacing: -1, maxHeight: 200, overflow: "hidden" }}>{text}</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {row(t.question.yes, crowd, c.sideA, c.sideASoft, c.sideAText)}
          {row(t.question.no, crowd === null ? null : 100 - crowd, c.sideB, c.sideBSoft, c.sideBText)}
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 14, fontSize: 22, fontWeight: 600, color: c.inkMuted }}>
          {crowd !== null && (
            <span style={{ fontFamily: "Manrope", fontWeight: 700, fontSize: 19, letterSpacing: 1.6, textTransform: "uppercase", color: c.canada }}>{cardSafe(settled ? t.question.canadaSaid : t.question.canadaSays)}</span>
          )}
          <span>{crowd !== null ? `· ${meta}` : meta}</span>
        </div>
      </CardFrame>
    ),
    { ...size, fonts: [...fonts] },
  );
}
