/**
 * The site's "now". Pages, the call route and the crowd route all read the time from here, so a question opens,
 * closes and settles on the real calendar.
 *
 * Tests run on a fixed date instead, so sample states (open, closing soon, closed, resolved) stay the same on every
 * run: unit tests (Vitest sets VITEST) and the e2e build (CONSENSA_TEST_FIXTURES=1, inlined by next.config.ts at
 * build time, so a production build always takes the real clock).
 */
export const FIXED_TEST_NOW = new Date("2026-11-06T12:00:00Z");

export function siteNow(): Date {
  if (process.env.CONSENSA_TEST_FIXTURES === "1" || process.env.VITEST) return new Date(FIXED_TEST_NOW);
  return new Date();
}
