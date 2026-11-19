import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const tags = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

/** Sample questions: one that resolved yes, one that resolved no, one under review, one still open. */
const resolvedYes = "cpi-sept-2026";
const resolvedNo = "mtl-snow-oct-2026";
const disputed = "box-office-oct-2026";
const open = "boc-cut-dec-2026";

for (const locale of ["en", "fr"] as const) {
  for (const [slug, side] of [[resolvedYes, "yes"], [resolvedNo, "no"]] as const) {
    test(`called-it page ${slug}/${side} in ${locale}: one headline, one action, no accessibility violations`, async ({ page }) => {
      const response = await page.goto(`/${locale}/q/${slug}/called-it/${side}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(locale === "en" ? "Called it!" : "Vu juste!");
      const answer = locale === "en" ? (side === "yes" ? "Answer: Yes" : "Answer: No") : side === "yes" ? "Réponse : Oui" : "Réponse : Non";
      await expect(page.getByRole("main").getByText(answer)).toBeVisible();
      await expect(page.getByRole("main").getByRole("link")).toHaveCount(1);
      await expect(page.getByRole("main").getByRole("link", { name: locale === "en" ? "Make your call" : "Faire ma prévision" })).toHaveAttribute("href", `/${locale}/board`);
      await expect(page.getByRole("main").getByText(locale === "en" ? "Free to play. No cash value. No purchase necessary." : "Gratuit. Aucune valeur monétaire. Aucun achat requis.")).toBeVisible();
      // One legal line under the card: the card picture carries its own footer, so the page doesn't repeat it.
      await expect(page.getByRole("main").getByText(locale === "en" ? "Free. No prizes. No cash value." : "Gratuit. Aucun prix à gagner. Aucune valeur monétaire.")).toHaveCount(0);
      // The answer sits on its side's colour (teal = yes, violet = no); the headline and the rule are ink, whatever the side.
      const colour = (token: string) => page.evaluate((t) => {
        const probe = document.createElement("span");
        probe.style.color = `var(${t})`;
        document.body.append(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      }, token);
      const pill = page.getByRole("main").getByText(answer);
      await expect(pill).toHaveCSS("background-color", await colour(side === "yes" ? "--cn-side-a" : "--cn-side-b"));
      await expect(pill).toHaveCSS("color", await colour("--cn-text-inverse"));
      const ink = await colour("--cn-text");
      await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("color", ink);
      await expect(page.locator("section[aria-labelledby=called-it-title]")).toHaveCSS("border-top-color", ink);
      // Sample numbers never travel: no crowd number on a shared page until it is real (5 calls or more).
      await expect(page.getByRole("main").getByText(locale === "en" ? "Canada gave yes" : "Le Canada donnait")).toHaveCount(0);
      const results = await new AxeBuilder({ page }).withTags(tags).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
}

test("the called-it page is noindex and unfurls with its own large card", async ({ page }) => {
  for (const locale of ["en", "fr"]) {
    await page.goto(`/${locale}/q/${resolvedYes}/called-it/yes`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
    const card = new RegExp(`/${locale}/q/${resolvedYes}/called-it/yes/opengraph-image`);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", card);
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute("content", card);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", new RegExp(`/${locale}/q/${resolvedYes}/called-it/yes$`));
  }
});

test("the called-it card is a 200 PNG for the side that happened, and a 404 for anything else", async ({ request }) => {
  for (const locale of ["en", "fr"]) {
    for (const [slug, side] of [[resolvedYes, "yes"], [resolvedNo, "no"]] as const) {
      const res = await request.get(`/${locale}/q/${slug}/called-it/${side}/opengraph-image`);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toBe("image/png");
      const body = await res.body();
      // PNG signature, then the IHDR width and height: 1200×630.
      expect(body.subarray(1, 4).toString("latin1")).toBe("PNG");
      expect([body.readUInt32BE(16), body.readUInt32BE(20)]).toEqual([1200, 630]);
    }
  }
  const gone = [
    `${resolvedYes}/called-it/no`, // the wrong side
    `${resolvedNo}/called-it/yes`,
    `${open}/called-it/yes`, // not resolved yet
    `${open}/called-it/no`,
    `${disputed}/called-it/yes`, // result under review
    `${resolvedYes}/called-it/80`, // only yes or no
    "no-such-question/called-it/yes",
  ];
  for (const path of gone) {
    expect((await request.get(`/en/q/${path}/opengraph-image`)).status(), `${path} image`).toBe(404);
    expect((await request.get(`/en/q/${path}`)).status(), `${path} page`).toBe(404);
  }
});

test("a right call offers Share your call, linking to the called-it page with no tracking", async ({ page }) => {
  for (const [locale, slug, call, side] of [["en", resolvedYes, "80", "yes"], ["fr", resolvedNo, "15", "no"]] as const) {
    await page.goto(`/${locale}/q/${slug}`);
    await page.evaluate(([s, v]) => window.localStorage.setItem(`consensa:call:${s}`, v), [slug, call] as const);
    await page.reload();
    const bar = page.getByRole("region", { name: locale === "en" ? "Share your call" : "Partager ma prévision" }).locator("visible=true");
    await expect(bar).toHaveCount(1);
    const plain = new RegExp(`^https?://[^/?#]+/${locale}/q/${slug}/called-it/${side}$`);
    const href = async (key: string) => new URL((await bar.locator(`a[data-share="${key}"]`).getAttribute("href")) ?? "");

    const x = await href("x");
    expect([...x.searchParams.keys()].sort()).toEqual(["text", "url"]);
    expect(x.searchParams.get("url")).toMatch(plain);
    expect(x.searchParams.get("text")).toContain(locale === "en" ? "I called it on CANsensus: " : "J’ai vu juste sur CANsensus : ");
    // The post says nothing about the person: it ends with the free label, and the call value is not in it.
    expect(x.searchParams.get("text")).toMatch(locale === "en" ? /\? Free\. No prizes\.$/ : /\? Gratuit\. Aucun prix à gagner\.$/);
    expect(x.searchParams.get("text")).not.toMatch(new RegExp(`\\b${call}\\s?%`));

    const threads = await href("threads");
    expect([...threads.searchParams.keys()]).toEqual(["text"]);
    expect(threads.searchParams.get("text")?.split(" ").at(-1)).toMatch(plain);

    const facebook = await href("facebook");
    expect([...facebook.searchParams.keys()]).toEqual(["u"]);
    expect(facebook.searchParams.get("u")).toMatch(plain);
  }
});

test("no Share your call for a miss, a toss-up, no call, or a result under review", async ({ page }) => {
  const bar = page.getByRole("region", { name: "Share your call" });
  for (const [slug, call] of [[resolvedYes, "20"], [resolvedYes, "50"], [resolvedYes, null], [disputed, "80"], [open, "80"]] as const) {
    await page.goto(`/en/q/${slug}`);
    await page.evaluate(([s, v]) => (v === null ? window.localStorage.removeItem(`consensa:call:${s}`) : window.localStorage.setItem(`consensa:call:${s}`, v)), [slug, call] as const);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Share this question" })).toBeVisible();
    await expect(bar, `${slug} ${call}`).toHaveCount(0);
  }
});
