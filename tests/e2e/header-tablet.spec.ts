import { expect, test } from "@playwright/test";

const cases = [
  { path: "/fr", width: 768 },
  { path: "/fr", width: 820 },
  { path: "/fr/record", width: 768 },
  { path: "/en", width: 768 },
] as const;

for (const { path, width } of cases) {
  test(`the header fits on one line at ${width}px on ${path}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(path);
    const fit = await page.evaluate(() => {
      const row = document.querySelector("header > div");
      const tallest = Math.max(...[...document.querySelectorAll("header > div a, header > div button")].map((el) => el.getBoundingClientRect().height));
      return {
        page: document.documentElement.scrollWidth - window.innerWidth,
        row: row ? row.scrollWidth - row.clientWidth : -1,
        oneLine: tallest <= 40,
      };
    });
    expect(fit).toEqual({ page: 0, row: 0, oneLine: true });
  });
}
