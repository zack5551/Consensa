import localFont from "next/font/local";

/**
 * PRISM's brand fonts, self-hosted from brand/fonts (OFL). Loading them locally keeps the build off
 * fonts.googleapis.com, which made CI builds fail intermittently, and keeps every request in-house (CLAUDE.md rule 7).
 */
export const manrope = localFont({
  src: [
    { path: "../../brand/fonts/manrope-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../../brand/fonts/manrope-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../../brand/fonts/manrope-latin-800-normal.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-manrope",
  display: "swap",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
});

export const inter = localFont({
  src: [
    { path: "../../brand/fonts/inter-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../brand/fonts/inter-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../brand/fonts/inter-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../../brand/fonts/inter-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"],
});
