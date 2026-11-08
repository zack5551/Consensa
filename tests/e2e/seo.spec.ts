import { expect, test } from "@playwright/test";

test("sitemap.xml lists the app's pages", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("xml");
  const body = await response.text();
  expect(body).toContain("<urlset");
  expect(body).toContain("/en/q/boc-cut-dec-2026");
  expect(body).toContain("/fr/q/boc-cut-dec-2026");
  expect(body).toContain("/en/today");
  expect(body).toContain("/fr/browse/economy");
});

test("robots.txt allows everything and points at the sitemap", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("User-Agent: *");
  expect(body).toContain("Sitemap:");
  expect(body).toContain("/sitemap.xml");
});

test("the landing page and question pages carry a canonical URL, other pages do not", async ({ page }) => {
  await page.goto("/en");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/en$/);

  await page.goto("/en/q/boc-cut-dec-2026");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/en\/q\/boc-cut-dec-2026$/);

  await page.goto("/en/today");
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});
