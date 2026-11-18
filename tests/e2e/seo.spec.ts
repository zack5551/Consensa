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

test("the landing page and question pages carry a canonical URL", async ({ page }) => {
  await page.goto("/en");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/en$/);

  await page.goto("/en/q/boc-cut-dec-2026");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/en\/q\/boc-cut-dec-2026$/);

  await page.goto("/en/today");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/en\/today$/);
});

for (const locale of ["en", "fr"]) {
  test(`a question page in ${locale} has canonical, hreflang and valid JSON-LD`, async ({ page }) => {
    await page.goto(`/${locale}/q/boc-cut-dec-2026`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/${locale}/q/boc-cut-dec-2026$`));
    for (const lang of ["en-CA", "fr-CA", "x-default"]) {
      const expected = lang === "fr-CA" ? "fr" : "en";
      await expect(page.locator(`link[rel="alternate"][hreflang="${lang}"]`)).toHaveAttribute("href", new RegExp(`/${expected}/q/boc-cut-dec-2026$`));
    }
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const types = blocks.map((b) => (JSON.parse(b) as { "@type": string })["@type"]);
    expect(types).toEqual(expect.arrayContaining(["WebSite", "Organization", "BreadcrumbList"]));
  });
}
