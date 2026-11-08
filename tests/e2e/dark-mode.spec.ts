import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const tags = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

/**
 * Dark mode is a first-class theme (toggle + prefers-color-scheme), and the
 * brand README claims AA in both themes — but CI only ever rendered light
 * mode. These tests render the same key screens dark and hold them to the
 * same axe + no-sideways-scroll bar.
 */
test.use({ colorScheme: "dark" });

const pages = ["/en", "/en/board", "/en/leaderboard", "/en/q/boc-cut-dec-2026", "/en/q/cpi-sept-2026", "/fr/q/boc-cut-dec-2026"] as const;

test("dark mode is actually on", async ({ page }) => {
  await page.goto("/en");
  await expect(page.evaluate(() => window.matchMedia("(prefers-color-scheme: dark)").matches)).resolves.toBe(true);
});

for (const path of pages) {
  test(`dark: ${path} has no accessibility violations and no sideways scroll`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(tags).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
