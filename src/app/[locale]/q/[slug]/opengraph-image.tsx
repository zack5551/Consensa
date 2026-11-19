import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BRAND_NAME } from "@/lib/brand";
import { notFound } from "next/navigation";
import { getQuestion, sampleQuestions, SAMPLE_NOW } from "@/content/sample-questions";
import { isLocale, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { formatPercent } from "@/lib/format";
import { withLiveQuestion } from "@/lib/live";
import { crowdNow, questionState } from "@/lib/question";
import { cardSafe, crowdForCard } from "@/lib/share";
import { shareCardColors as c } from "@/lib/share-card-colors";

/**
 * The share card for one question, 1200×630.
 * One message: the question and where Canada stands on it ("Make your call" until 5 people have called). A cancelled
 * question says it was cancelled instead, with no number and no invitation to call.
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
  const questionSize = text.length > 110 ? 44 : text.length > 70 ? 52 : 60;

  const [manrope700, manrope800, inter600] = await fonts();

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: c.paper, color: c.ink, fontFamily: "Inter", borderTop: `12px solid ${c.canada}`, padding: "48px 64px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: "Manrope", fontWeight: 800, fontSize: 40, letterSpacing: -0.8 }}>
          <svg viewBox="0 0 100 100" width="44" height="44">
            <path fill={c.sideA} d="M47 .09A50 50 0 0 0 47 99.91V59.014a9.5 9.5 0 0 1 0-18.028Z" />
            <path fill={c.sideB} d="M53 .09a50 50 0 0 1 0 99.82V59.014a9.5 9.5 0 0 0 0-18.028Z" />
            <circle fill={c.canada} cx="50" cy="50" r="6.5" />
          </svg>
          <span>cansensa</span>
        </div>

        <div style={{ display: "flex", flex: 1, alignItems: "center", fontFamily: "Manrope", fontWeight: 800, fontSize: questionSize, lineHeight: 1.12, letterSpacing: -1, maxHeight: 250, overflow: "hidden" }}>
          {text}
        </div>

        {state === "cancelled" ? (
          <div style={{ display: "flex", fontFamily: "Manrope", fontWeight: 700, fontSize: 48, color: c.inkMuted, marginBottom: 28 }}>{cardSafe(t.share.cardCancelled)}</div>
        ) : crowd === null ? (
          <div style={{ display: "flex", fontFamily: "Manrope", fontWeight: 700, fontSize: 64, color: c.sideAText, marginBottom: 28 }}>{cardSafe(t.question.makeYourCall)}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
              <span style={{ fontFamily: "Manrope", fontWeight: 700, fontSize: 26, letterSpacing: 1.5, textTransform: "uppercase", color: c.canada }}>{cardSafe(settled ? t.question.canadaSaid : t.question.canadaSays)}</span>
              <span style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 112, lineHeight: 1, color: c.sideAText }}>{cardSafe(formatPercent(crowd, locale))}</span>
              <span style={{ fontSize: 32, color: c.inkMuted }}>{cardSafe(t.question.chance)}</span>
            </div>
            <div style={{ display: "flex", width: "100%", height: 20, marginTop: 20, borderRadius: 10, overflow: "hidden", background: c.line }}>
              <div style={{ width: `${crowd}%`, background: c.sideA }} />
              <div style={{ width: `${100 - crowd}%`, background: c.sideB }} />
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontWeight: 600, color: c.inkMuted, borderTop: `2px solid ${c.line}`, paddingTop: 20 }}>
          <span style={{ fontSize: 26 }}>{footer}</span>
          {/* LEX: sports cards also carry the non-affiliation line. */}
          {sports && <span style={{ fontSize: 20 }}>{cardSafe(t.legal.sportsFooter)}</span>}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Manrope", data: manrope700, weight: 700, style: "normal" },
        { name: "Manrope", data: manrope800, weight: 800, style: "normal" },
        { name: "Inter", data: inter600, weight: 600, style: "normal" },
      ],
    },
  );
}
