/**
 * Colours for the share card (opengraph-image). ImageResponse cannot read CSS variables, so the light-theme values
 * are resolved here, each one naming the PRISM token in brand/tokens/tokens.css it comes from. If a token changes,
 * change it here too (tests/unit/social.test.ts checks they still match).
 */
export const shareCardColors = {
  paper: "#FAF8F5", // --cn-bg
  surface: "#FEFCF9", // --cn-surface (the poll card)
  sunken: "#F2F0ED", // --cn-surface-sunken (behind the card)
  onFill: "#FEFCF9", // --cn-text-inverse (an answer on its fill)
  line: "#E4E2E0", // --cn-border
  ink: "#14213D", // --cn-text
  inkMuted: "#4D5972", // --cn-text-muted
  sideA: "#0F766E", // --cn-side-a (yes)
  sideAText: "#015F58", // --cn-side-a-text
  sideASoft: "#E1F2F0", // --cn-side-a-soft
  sideB: "#6D4AA8", // --cn-side-b (no)
  sideBText: "#583490", // --cn-side-b-text
  sideBSoft: "#F0EAFF", // --cn-side-b-soft
  canada: "#C8102E", // --cn-accent (the one red pin)
} as const;

/** Token each colour comes from, so a test can compare against tokens.css. */
export const shareCardTokens: Record<keyof typeof shareCardColors, string> = {
  paper: "--cn-bg",
  surface: "--cn-surface",
  sunken: "--cn-surface-sunken",
  onFill: "--cn-text-inverse",
  line: "--cn-border",
  ink: "--cn-text",
  inkMuted: "--cn-text-muted",
  sideA: "--cn-side-a",
  sideAText: "--cn-side-a-text",
  sideASoft: "--cn-side-a-soft",
  sideB: "--cn-side-b",
  sideBText: "--cn-side-b-text",
  sideBSoft: "--cn-side-b-soft",
  canada: "--cn-accent",
};
