import { ImageResponse } from "next/og";
import { CardFrame, CardWordmark, cardFonts, cardSize } from "@/components/share-card-parts";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { askedByLabel } from "@/lib/asked-by";
import { formatCount, formatPercent, formatShortDate } from "@/lib/format";
import { callsCloseAt, crowdNow, questionState, type Question } from "@/lib/question";
import { calledItFooter, cardSafe, crowdForCard } from "@/lib/share";
import { shareCardColors as c } from "@/lib/share-card-colors";
import { fill } from "@/lib/text";

/**
 * Draws the share card for one question, already read with its live numbers (withLiveQuestion). The route
 * (src/app/[locale]/q/[slug]/opengraph-image.tsx) calls this; tests/unit/share-card-image.test.ts renders it with a
 * fixture question that carries a test sponsor label, which no shipped question has.
 */
export async function shareCardImage(q: Question, locale: Locale, now: Date): Promise<ImageResponse> {
  const t = getDictionary(locale);
  const crowd = crowdForCard(q, crowdNow(q));
  // LEX: the same legal lines as the "Called it!" card: free, no prizes, no cash value, and on sports the fan-forecast
  // and non-affiliation lines.
  const legal = calledItFooter(t, q.category);
  const state = questionState(q, now);
  const settled = state === "resolved" || state === "disputed" || state === "closed";
  const text = cardSafe(q.question[locale]);
  const questionSize = text.length > 110 ? 40 : text.length > 70 ? 46 : 54;
  const closes = settled ? t.share.cardClosed : fill(t.share.cardCloses, { date: formatShortDate(callsCloseAt(q), locale) });
  const meta = cardSafe(crowd === null ? closes : `${fill(t.share.cardCalls, { n: formatCount(q.forecasters, locale) })} · ${closes}`);
  // LEX: a guest or brand question's "Asked by" / "Sponsored by" label goes on the card too, right above the question.
  const askedBy = q.askedBy ? cardSafe(askedByLabel(q.askedBy, t.question.askedBy)) : null;

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
      <CardFrame footer={cardSafe(legal.footer)} sportsFooter={legal.sports.map(cardSafe)}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <CardWordmark />
          {!settled && (
            <div style={{ display: "flex", fontFamily: "Manrope", fontSize: 22, fontWeight: 700, color: c.paper, background: c.ink, padding: "10px 24px", borderRadius: 999 }}>{cardSafe(t.question.makeYourCall)}</div>
          )}
        </div>

        {askedBy && <div style={{ display: "flex", marginTop: 14, fontSize: 22, fontWeight: 600, color: c.inkMuted }}>{askedBy}</div>}

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
    { ...cardSize, fonts: [...fonts] },
  );
}
