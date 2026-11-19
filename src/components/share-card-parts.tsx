import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactNode } from "react";
import { shareCardColors as c } from "@/lib/share-card-colors";

/**
 * The pieces every share card is built from (the question card and the "Called it!" card), so the two stay one family:
 * the same size, fonts, frame, wordmark and legal footer. These render inside ImageResponse, which draws inline styles
 * only, so there are no class names here; every colour comes from share-card-colors.ts.
 */
export const cardSize = { width: 1200, height: 630 } as const;

/**
 * PRISM's fonts, read from brand/fonts. The image renderer reads ttf, otf and woff but not woff2, so brand/fonts/ttf
 * holds the three faces the cards use (Manrope 700 and 800, Inter 600), unpacked from the woff2 files beside them with
 * fontTools: same glyphs, same tables, nothing downloaded. next.config.ts (outputFileTracingIncludes) ships them with each card route.
 */
export async function cardFonts() {
  const [manrope700, manrope800, inter600] = await Promise.all(
    ["manrope-latin-700-normal.ttf", "manrope-latin-800-normal.ttf", "inter-latin-600-normal.ttf"].map((file) => readFile(join(process.cwd(), "brand/fonts/ttf", file))),
  );
  return [
    { name: "Manrope", data: manrope700!, weight: 700, style: "normal" },
    { name: "Manrope", data: manrope800!, weight: 800, style: "normal" },
    { name: "Inter", data: inter600!, weight: 600, style: "normal" },
  ] as const;
}

/** The symbol and the name, as on the site header. Never recoloured, never swapped. */
export function CardWordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: "Manrope", fontWeight: 800, fontSize: 32, letterSpacing: -0.7 }}>
      <svg viewBox="0 0 100 100" width="36" height="36">
        <path fill={c.sideA} d="M47 .09A50 50 0 0 0 47 99.91V59.014a9.5 9.5 0 0 1 0-18.028Z" />
        <path fill={c.sideB} d="M53 .09a50 50 0 0 1 0 99.82V59.014a9.5 9.5 0 0 0 0-18.028Z" />
        <circle fill={c.canada} cx="50" cy="50" r="6.5" />
      </svg>
      <span>cansensa</span>
    </div>
  );
}

/**
 * The frame: a Canada-red rule, the card on a sunken ground, and the legal lines under it.
 * LEX: `footer` is the free/no-value label, on every card. A sports card passes `sportsFooter` too (the non-affiliation
 * line), at the same size so it stays readable in a feed; the frame tightens to make room for it.
 * Pass both lines already through `cardSafe`.
 */
export function CardFrame({ footer, sportsFooter, children }: { footer: string; sportsFooter?: string; children: ReactNode }) {
  const sports = sportsFooter !== undefined;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: c.sunken, color: c.ink, fontFamily: "Inter", borderTop: `14px solid ${c.canada}`, padding: sports ? "20px 40px 14px" : "26px 40px 20px" }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, background: c.surface, border: `2px solid ${c.line}`, borderRadius: 28, padding: sports ? "22px 40px 20px" : "28px 40px 24px" }}>
        {children}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "10px 12px 0", fontSize: 19, fontWeight: 600, color: c.inkMuted }}>
        <span>{footer}</span>
        {sports && <span>{sportsFooter}</span>}
      </div>
    </div>
  );
}
