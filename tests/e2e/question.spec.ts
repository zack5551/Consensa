import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const tags = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

/** One question per state: open, closing soon, closed (waiting for the result), resolved. */
const pages = ["boc-cut-dec-2026", "giller-debut-2026", "jobs-rate-oct-2026", "cpi-sept-2026"] as const;

for (const locale of ["en", "fr"] as const) {
  for (const slug of pages) {
    test(`question ${slug} in ${locale}: no accessibility violations, no sideways scroll`, async ({ page }) => {
      await page.goto(`/${locale}/q/${slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(tags).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
}

test("every question screen shows the no-value label", async ({ page }) => {
  for (const slug of pages) {
    await page.goto(`/en/q/${slug}`);
    await expect(page.getByText("Free to play. No cash value. No purchase necessary.").first()).toBeVisible();
  }
});

test("a question with a big move names the biggest move in the chart summary", async ({ page }) => {
  await page.goto("/en/q/boc-cut-dec-2026");
  await expect(page.getByRole("img", { name: /Biggest move: down 14 points over 5 days/ })).toBeVisible();
});

test("a question with a big move names it in French too", async ({ page }) => {
  await page.goto("/fr/q/boc-cut-dec-2026");
  await expect(page.getByRole("img", { name: /Plus grand mouvement\s*:\s*baisse de 14\s+points sur 5\s+jours/ })).toBeVisible();
});

test("a question with only small moves names no biggest move", async ({ page }) => {
  await page.goto("/en/q/home-prices-nov-2026");
  await expect(page.getByRole("img", { name: /Biggest move/ })).toHaveCount(0);
});

test("an open question says how Canada moved this week", async ({ page }) => {
  await page.goto("/en/q/boc-cut-dec-2026");
  await expect(page.getByText("Down 2 points this week")).toBeVisible();
  await page.goto("/fr/q/home-prices-nov-2026");
  await expect(page.getByText(/En hausse de 1\s+point cette semaine/)).toBeVisible();
});

test("a resolved question shows no weekly move", async ({ page }) => {
  await page.goto("/en/q/cpi-sept-2026");
  await expect(page.getByText(/points? this week/)).toHaveCount(0);
});

test("a resolved question says whether Canada called it, with its record on the topic", async ({ page }) => {
  await page.goto("/en/q/cpi-sept-2026");
  await expect(page.getByText("Canada called it. On economy questions, Canada has leaned the right way 3 times out of 3.")).toBeVisible();
  await page.goto("/fr/q/mtl-snow-oct-2026");
  await expect(page.getByText("Le Canada a vu juste.", { exact: true })).toBeVisible();
  await page.goto("/en/q/boc-cut-dec-2026");
  await expect(page.getByText(/Canada called it|Canada missed this one/)).toHaveCount(0);
});

test("every question ends with open questions to call next", async ({ page }) => {
  await page.goto("/en/q/cpi-sept-2026");
  const next = page.getByRole("region", { name: "Call another" });
  await expect(next.getByRole("link")).toHaveCount(3);
  await expect(next.locator('a[href$="/q/cpi-sept-2026"]')).toHaveCount(0);
  await next.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/en\/q\//);
  await expect(page.getByRole("button", { name: "Make my call" }).first()).toBeVisible();
  await page.goto("/fr/q/boc-cut-dec-2026");
  await expect(page.getByRole("region", { name: "Une autre prévision" }).getByRole("link")).toHaveCount(3);
});

test("before a call, the panel shows what it would score either way", async ({ page }) => {
  await page.goto("/en/q/boc-cut-dec-2026");
  await expect(page.getByText("If the answer is yes, you’d score 0.250. If it’s no, 0.250. Lower is better.").locator("visible=true").first()).toBeVisible();
  await page.getByRole("button", { name: /^Likely/ }).locator("visible=true").first().click();
  await expect(page.getByText("If the answer is yes, you’d score 0.063. If it’s no, 0.563. Lower is better.").locator("visible=true").first()).toBeVisible();
  await page.goto("/fr/q/boc-cut-dec-2026");
  await expect(page.getByText(/Si la réponse est oui, votre score serait de 0,250\./).locator("visible=true").first()).toBeVisible();
});

test("a closing-soon question says when it closes", async ({ page }) => {
  await page.goto("/en/q/giller-debut-2026");
  await expect(page.getByText(/This question closes November 8, 2026/)).toBeVisible();
});

test("a closed question stops taking calls", async ({ page }) => {
  await page.goto("/en/q/jobs-rate-oct-2026");
  await expect(page.getByRole("heading", { name: "Calls have closed" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Make my call" })).toHaveCount(0);
});

test("a resolved question shows the answer, and Called it! for a right call", async ({ page }) => {
  await page.goto("/en/q/cpi-sept-2026");
  await page.evaluate(() => window.localStorage.setItem("consensa:call:cpi-sept-2026", "80"));
  await page.reload();
  await expect(page.getByText("Answer: Yes").first()).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Called it!" }).first()).toContainText("You said 80%.");
  await expect(page.getByRole("status").filter({ hasText: "Called it!" }).first()).toContainText("You were more accurate than Canada on this one.");
});

test("a resolved question says Pas cette fois. for a miss, in French", async ({ page }) => {
  await page.goto("/fr/q/cpi-sept-2026");
  await page.evaluate(() => window.localStorage.setItem("consensa:call:cpi-sept-2026", "20"));
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "Pas cette fois." }).first()).toBeVisible();
});

test("after a call, your own region's number shows beside Canada's", async ({ page }) => {
  await page.goto("/fr/q/boc-cut-dec-2026");
  await page.evaluate(() => window.localStorage.setItem("consensa:profile", JSON.stringify({ region: "ON" })));
  await page.reload();
  await expect(page.getByText("Votre région · Ontario")).toHaveCount(0);
  await page.getByRole("button", { name: "Confirmer ma prévision" }).click();
  await expect(page.getByText("Votre région · Ontario")).toBeVisible();
});

test("the bot check is off locally: the challenge route steps aside and a call saves with no extra UI", async ({ page, request }) => {
  const challenge = await request.get("/api/altcha/challenge");
  expect(challenge.status()).toBe(204);
  expect(challenge.headers()["cache-control"]).toContain("no-store");
  await page.goto("/en/q/boc-cut-dec-2026");
  await page.getByRole("button", { name: "Make my call" }).click();
  await expect(page.getByText("Call saved")).toBeVisible();
  await expect(page.locator("altcha-widget")).toHaveCount(0);
  await expect(page.getByText(/quick check/i)).toHaveCount(0);
});

test("share buttons link to the plain question page, with no tracking", async ({ page }) => {
  for (const locale of ["en", "fr"] as const) {
    await page.goto(`/${locale}/q/boc-cut-dec-2026`);
    const href = async (key: string) => new URL((await page.locator(`a[data-share="${key}"]`).getAttribute("href")) ?? "");
    const plain = new RegExp(`^https?://[^/?#]+/${locale}/q/boc-cut-dec-2026$`);
    const line = locale === "en" ? "Make your call on Cansensa. Free. No prizes." : "Faites votre prévision sur Cansensa. Gratuit. Aucun prix.";

    const x = await href("x");
    expect(`${x.origin}${x.pathname}`).toBe("https://twitter.com/intent/tweet");
    expect([...x.searchParams.keys()].sort()).toEqual(["text", "url"]);
    expect(x.searchParams.get("url")).toMatch(plain);
    expect(x.searchParams.get("text")).toContain(line);

    const threads = await href("threads");
    expect(`${threads.origin}${threads.pathname}`).toBe("https://www.threads.net/intent/post");
    expect([...threads.searchParams.keys()]).toEqual(["text"]);
    expect(threads.searchParams.get("text")).toContain(line);
    expect(threads.searchParams.get("text")?.split(" ").at(-1)).toMatch(plain);

    const facebook = await href("facebook");
    expect(`${facebook.origin}${facebook.pathname}`).toBe("https://www.facebook.com/sharer/sharer.php");
    expect([...facebook.searchParams.keys()]).toEqual(["u"]);
    expect(facebook.searchParams.get("u")).toMatch(plain);

    await expect(page.getByRole("button", { name: locale === "en" ? "Copy link" : "Copier le lien" })).toBeVisible();
  }
  // Links only: the page loads nothing from the social platforms.
  expect(await page.locator("script[src], iframe, img").evaluateAll((els) => els.map((el) => el.getAttribute("src") ?? "").filter((src) => /twitter|x\.com|threads|facebook|instagram/.test(src)))).toEqual([]);
});

test("the social block shows its label and the poll line, apart from Canada says", async ({ page }) => {
  await page.goto("/en/q/boc-cut-dec-2026");
  const block = page.getByTestId("social-polls").locator("visible=true");
  await expect(block).toHaveCount(1);
  await expect(block.getByRole("heading", { name: /On social media/ })).toBeVisible();
  await expect(block.getByText("Not verified. May include people outside Canada and under 18.")).toBeVisible();
  await expect(block.getByText("X poll, Nov 5: 58% yes · 1,240 votes")).toBeVisible();
  await expect(block.getByText("Sample data")).toBeVisible();
  // A sample row has no real post behind it, so it carries no link.
  await expect(block.getByRole("link")).toHaveCount(0);
  // Outside the Canada says section, never inside it.
  await expect(page.getByRole("region", { name: "Canada says" }).getByTestId("social-polls")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Canada says" }).getByText(/1,240/)).toHaveCount(0);

  await page.goto("/fr/q/boc-cut-dec-2026");
  const bloc = page.getByTestId("social-polls").locator("visible=true");
  await expect(bloc.getByText("Non vérifié. Peut inclure des personnes hors du Canada et de moins de 18\u00A0ans.")).toBeVisible();
  await expect(bloc.getByText("Sondage X, 5 nov.\u00A0: 58\u00A0% de oui · 1\u00A0240\u00A0votes")).toBeVisible();
  await expect(bloc.getByText("Données d’exemple")).toBeVisible();

  // Hidden when a question has no polls.
  await page.goto("/en/q/giller-debut-2026");
  await expect(page.getByTestId("social-polls")).toHaveCount(0);
});

test("the share card is a 200 PNG in both languages, and the page asks for the large card", async ({ page, request }) => {
  for (const slug of ["boc-cut-dec-2026", "leafs-playoffs-2027"]) {
    for (const locale of ["en", "fr"]) {
      const res = await request.get(`/${locale}/q/${slug}/opengraph-image`);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toBe("image/png");
      const body = await res.body();
      // PNG signature, then the IHDR width and height: 1200×630.
      expect(body.subarray(1, 4).toString("latin1")).toBe("PNG");
      expect([body.readUInt32BE(16), body.readUInt32BE(20)]).toEqual([1200, 630]);
    }
  }
  expect((await request.get("/en/q/no-such-question/opengraph-image")).status()).toBe(404);
  for (const locale of ["en", "fr"]) {
    await page.goto(`/${locale}/q/boc-cut-dec-2026`);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", new RegExp(`/${locale}/q/boc-cut-dec-2026/opengraph-image`));
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute("content", new RegExp(`/${locale}/q/boc-cut-dec-2026/opengraph-image`));
  }
});
