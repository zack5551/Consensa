/** Every character all three card fonts in brand/fonts/ttf can draw (read from their character maps). */
const notInCardFonts =
  /[^\u0020-\u007E\u00A0-\u00AC\u00AE-\u00FF\u0131\u0152\u0153\u02C6\u02DA\u02DC\u2013\u2014\u2018-\u201A\u201C-\u201E\u2022\u2026\u2039\u203A\u2044\u2074\u20AC\u2122\u2191\u2193\u2212]/g;

/**
 * Text the share card can draw with the brand fonts alone. The image renderer fetches a fallback font from an outside
 * font service for any character its fonts lack, and CLAUDE.md rule 7 allows no such call. So narrow and thin spaces
 * and odd hyphens become their plain forms, and anything else the fonts lack is dropped.
 * tests/unit/social.test.ts checks that no sample question or card label loses a character here.
 */
export function cardSafe(text: string): string {
  return text
    .replace(/\u202F/g, "\u00A0")
    .replace(/[\u2002-\u200A]/g, " ")
    .replace(/[\u2010\u2011]/g, "-")
    .replace(notInCardFonts, "");
}
