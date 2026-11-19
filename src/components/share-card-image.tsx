import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { askedByLabel } from "@/lib/asked-by";
import { formatCount, formatPercent, formatShortDate } from "@/lib/format";
import { callsCloseAt, crowdNow, questionState, type Question } from "@/lib/question";
import { cardSafe, crowdForCard } from "@/lib/share";
import { shareCardColors as c } from "@/lib/share-card-colors";
import { fill } from "@/lib/text";

/** The share card's size, 1200×630 (the Open Graph and X large-image size). */
export const shareCardSize = { width: 1200, height: 630 };

/**
 * PRISM's fonts, read from brand/fonts. The image renderer reads ttf, otf and woff but not woff2, so brand/fonts/ttf
 * holds the three faces the card uses (Manrope 700 and 800, Inter 600), unpacked from the woff2 files beside them with
 * fontTools: same glyphs, same tables, nothing downloaded. next.config.ts (outputFileTracingIncludes) ships them with this route.
 */
const fonts = () =>
  Promise.all([
    readFile(join(process.cwd(), "brand/fonts/ttf/manrope-latin-700-normal.ttf")),
    readFile(join(process.cwd(), "brand/fonts/ttf/manrope-latin-800-normal.ttf")),
    readFile(join(process.cwd(), "brand/fonts/ttf/inter-latin-600-normal.ttf")),
  ]);

/**
 * Draws the share card for one question, already read with its live numbers (withLiveQuestion). The route
 * (src/app/[locale]/q/[slug]/opengraph-image.tsx) calls this; tests/unit/share-card-image.test.ts renders it with a
 * fixture question that carries a test sponsor label, which no shipped question has.
 */
export async function shareCardImage(q: Question, locale: Locale, now: Date): Promise<ImageResponse> {
  const t = getDictionary(locale);
  const crowd = crowdForCard(q, crowdNow(q));
  const sports = q.category === "sports";
  // LEX: the same footer as the "Called it!" card, with the fan-forecast line on sports cards.
  const footer = cardSafe(sports ? t.share.cardFooterSports : t.share.cardFooter);
  const state = questionState(q, now);
  const settled = state === "resolved" || state === "disputed" || state === "closed";
  const text = cardSafe(q.question[locale]);
  const questionSize = text.length > 110 ? 40 : text.length > 70 ? 46 : 54;
  const closes = settled ? t.share.cardClosed : fill(t.share.cardCloses, { date: formatShortDate(callsCloseAt(q), locale) });
  // LEX: a guest or brand question's "Asked by" / "Sponsored by" label goes on the card too, right above the question.
  const askedBy = q.askedBy ? cardSafe(askedByLabel(q.askedBy, t.question.askedBy)) : null;
  const meta = cardSafe(crowd === null ? closes : `${fill(t.share.cardCalls, { n: formatCount(q.forecasters, locale) })} · ${closes}`);

  const [manrope700, manrope800, inter600] = await fonts();

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
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: c.sunken, color: c.ink, fontFamily: "Inter", borderTop: `14px solid ${c.canada}`, padding: sports ? "20px 40px 14px" : "26px 40px 20px" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, background: c.surface, border: `2px solid ${c.line}`, borderRadius: 28, padding: sports ? "22px 40px 20px" : "28px 40px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: "Manrope", fontWeight: 800, fontSize: 32, letterSpacing: -0.7 }}>
              <svg viewBox="0 0 100 100" width="36" height="36">
                <path fill={c.sideA} d="M47 .09A50 50 0 0 0 47 99.91V59.014a9.5 9.5 0 0 1 0-18.028Z" />
                <path fill={c.sideB} d="M53 .09a50 50 0 0 1 0 99.82V59.014a9.5 9.5 0 0 0 0-18.028Z" />
                <circle fill={c.canada} cx="50" cy="50" r="6.5" />
              </svg>
              <span>cansensa</span>
            </div>
            {!settled && (
              <div style={{ display: "flex", fontFamily: "Manrope", fontSize: 22, fontWeight: 700, color: c.paper, background: c.ink, padding: "10px 24px", borderRadius: 999 }}>{cardSafe(t.question.makeYourCall)}</div>
            )}
          </div>

          {askedBy && (
            <div style={{ display: "flex", marginTop: 14, fontSize: 22, fontWeight: 600, color: c.inkMuted }}>{askedBy}</div>
          )}

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
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "10px 12px 0", fontSize: 19, fontWeight: 600, color: c.inkMuted }}>
          <span>{footer}</span>
          {/* LEX: sports cards also carry the non-affiliation line, at the same size so it stays readable in a feed. */}
          {sports && <span>{cardSafe(t.legal.sportsFooter)}</span>}
        </div>
      </div>
    ),
    {
      ...shareCardSize,
      fonts: [
        { name: "Manrope", data: manrope700, weight: 700, style: "normal" },
        { name: "Manrope", data: manrope800, weight: 800, style: "normal" },
        { name: "Inter", data: inter600, weight: 600, style: "normal" },
      ],
    },
  );
}
