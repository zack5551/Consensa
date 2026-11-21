import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

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
  await expect(page.getByRole("button", { name: "Yes", exact: true }).first()).toBeVisible();
  await page.goto("/fr/q/boc-cut-dec-2026");
  await expect(page.getByRole("region", { name: "Une autre prévision" }).getByRole("link")).toHaveCount(3);
});

test("before a call, the panel shows what it would score either way", async ({ page }) => {
  await page.goto("/en/q/boc-cut-dec-2026");
  // Nothing to score until a side is chosen.
  await expect(page.getByText(/you’d score/)).toHaveCount(0);
  await page.getByRole("button", { name: "Yes", exact: true }).click();
  await expect(page.getByText("If the answer is yes, you’d score 0.063. If it’s no, 0.563. Lower is better.").locator("visible=true").first()).toBeVisible();
  await page.getByRole("button", { name: "No", exact: true }).click();
  await expect(page.getByText("If the answer is yes, you’d score 0.563. If it’s no, 0.063. Lower is better.").locator("visible=true").first()).toBeVisible();
  await page.goto("/fr/q/boc-cut-dec-2026");
  await page.getByRole("button", { name: "Oui", exact: true }).click();
  await page.getByRole("slider").fill("50");
  await expect(page.getByText(/Si la réponse est oui, votre score serait de 0,250\./).locator("visible=true").first()).toBeVisible();
});

const callKey = (slug: string) => `consensa:call:${slug}`;
const storedCall = (page: Page, slug: string) => page.evaluate((key) => window.localStorage.getItem(key), callKey(slug));

test("the panel asks like a poll: two answers first, then how sure, then Canada's results", async ({ page }) => {
  await page.goto("/en/q/boc-cut-dec-2026");
  const yes = page.getByRole("button", { name: "Yes", exact: true });
  const no = page.getByRole("button", { name: "No", exact: true });
  await expect(yes).toHaveAttribute("aria-pressed", "false");
  await expect(no).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("slider")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save my call" })).toHaveCount(0);
  await expect(page.getByText("18,420 calls · Closes Dec 9").locator("visible=true")).toBeVisible();

  await yes.click();
  await expect(yes).toHaveAttribute("aria-pressed", "true");
  const slider = page.getByRole("slider", { name: "How sure are you?" });
  await expect(slider).toHaveValue("75");
  await expect(slider).toHaveAttribute("min", "50");
  await expect(slider).toHaveAttribute("max", "99");
  await expect(slider).toHaveAttribute("aria-valuetext", "Yes, 75% chance");
  await expect(page.getByText("75% chance", { exact: true })).toBeVisible();
  await expect(page.getByTestId("result-bars")).toHaveCount(0);

  await page.getByRole("button", { name: "Save my call" }).click();
  expect(await storedCall(page, "boc-cut-dec-2026")).toBe("75");
  const bars = page.getByTestId("result-bars").locator("visible=true");
  await expect(bars).toContainText("Canada says 38% chance of yes, the average of 18,420 calls. Your answer: Yes.");
  await expect(bars).toContainText("Yes✓");
  await expect(bars).toContainText("38%");
  await expect(bars).toContainText("62%");
  await expect(page.getByText("Canada says · Average of 18,420 calls · Closes Dec 9").locator("visible=true")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Call saved" })).toContainText("Call saved: Yes, 75% chance. Canada leans the other way: 38% chance of yes.");
  // Accounts are off locally, so there is no sign-up line.
  await expect(page.getByRole("link", { name: "Create a free account" })).toHaveCount(0);
  const results = await new AxeBuilder({ page }).withTags(tags).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test("No at 80% sure is stored as a 20% chance of yes", async ({ page }) => {
  await page.goto("/en/q/boc-cut-dec-2026");
  await page.getByRole("button", { name: "No", exact: true }).click();
  await page.getByRole("slider").fill("80");
  await expect(page.getByRole("slider")).toHaveAttribute("aria-valuetext", "No, 80% chance");
  await page.getByRole("button", { name: "Save my call" }).click();
  expect(await storedCall(page, "boc-cut-dec-2026")).toBe("20");
  await expect(page.getByRole("status").filter({ hasText: "Call saved" })).toContainText("Call saved: No, 80% chance. You’re 18 points more sure than Canada.");
  await expect(page.getByTestId("result-bars").locator("visible=true")).toContainText("No✓");
});

test("a call stored earlier opens on the results, and Change my call goes back to how sure", async ({ page }) => {
  await page.goto("/en/q/boc-cut-dec-2026");
  await page.evaluate((key) => window.localStorage.setItem(key, "30"), callKey("boc-cut-dec-2026"));
  await page.reload();
  await expect(page.getByTestId("result-bars").locator("visible=true")).toContainText("Your answer: No.");
  await expect(page.getByRole("status").filter({ hasText: "Call saved" })).toContainText("Call saved: No, 70% chance.");
  await page.getByRole("button", { name: "Change my call" }).click();
  await expect(page.getByRole("button", { name: "No", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("slider")).toHaveValue("70");
  await expect(page.getByRole("slider")).toBeFocused();
  // The other answer is one tap away, and how sure carries over.
  await page.getByRole("button", { name: "Yes", exact: true }).click();
  await page.getByRole("button", { name: "Save my call" }).click();
  expect(await storedCall(page, "boc-cut-dec-2026")).toBe("70");
  await expect(page.getByRole("button", { name: "Change my call" })).toBeFocused();
});

test("the poll flow in French: Non à 80 % enregistre 20", async ({ page }) => {
  await page.goto("/fr/q/boc-cut-dec-2026");
  await page.getByRole("button", { name: "Non", exact: true }).click();
  const slider = page.getByRole("slider", { name: "Quel est votre degré de certitude?" });
  await expect(slider).toHaveValue("75");
  await slider.fill("80");
  await expect(page.getByText("80\u00A0% de chances", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Enregistrer ma prévision" }).click();
  expect(await storedCall(page, "boc-cut-dec-2026")).toBe("20");
  const bars = page.getByTestId("result-bars").locator("visible=true");
  await expect(bars).toContainText("Selon le Canada\u00A0: 38\u00A0% de chances que ce soit oui, la moyenne de 18\u00A0420\u00A0prévisions. Votre réponse\u00A0: Non.");
  await expect(page.getByText("Selon le Canada · Moyenne de 18\u00A0420\u00A0prévisions · Fermeture le 9 déc.").locator("visible=true")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Prévision enregistrée" })).toContainText("Prévision enregistrée\u00A0: Non, 80\u00A0% de chances. Votre certitude est 18\u00A0points au-dessus de celle du Canada.");
  await expect(page.getByRole("button", { name: "Modifier ma prévision" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("a sports question says when calls close, in Eastern time, under the answers", async ({ page }) => {
  await page.goto("/en/q/leafs-playoffs-2027");
  await expect(page.getByText(/22,980 calls\s· Closes Apr 15, 7:00 p\.m\. ET/).locator("visible=true")).toBeVisible();
});

test("a closing-soon question still takes a call", async ({ page }) => {
  await page.goto("/en/q/giller-debut-2026");
  await page.getByRole("button", { name: "Yes", exact: true }).click();
  await page.getByRole("button", { name: "Save my call" }).click();
  expect(await storedCall(page, "giller-debut-2026")).toBe("75");
  await expect(page.getByTestId("result-bars").locator("visible=true")).toBeVisible();
});

test("a closing-soon question says when it closes, on the Eastern calendar day", async ({ page }) => {
  // Calls close at 04:59 UTC on Nov 8, which is 11:59 p.m. Eastern on Nov 7 (LEX).
  await page.goto("/en/q/giller-debut-2026");
  await expect(page.getByText(/This question closes November 7, 2026/)).toBeVisible();
});

test("a closed question stops taking calls", async ({ page }) => {
  await page.goto("/en/q/jobs-rate-oct-2026");
  await expect(page.getByRole("heading", { name: "Calls have closed" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Save my call" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Yes", exact: true })).toHaveCount(0);
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
  await page.getByRole("button", { name: "Oui", exact: true }).click();
  await page.getByRole("button", { name: "Enregistrer ma prévision" }).click();
  await expect(page.getByText("Votre région · Ontario")).toBeVisible();
});

test("the bot check is off locally: the challenge route steps aside and a call saves with no extra UI", async ({ page, request }) => {
  const challenge = await request.get("/api/altcha/challenge");
  expect(challenge.status()).toBe(204);
  expect(challenge.headers()["cache-control"]).toContain("no-store");
  await page.goto("/en/q/boc-cut-dec-2026");
  await page.getByRole("button", { name: "Yes", exact: true }).click();
  await page.getByRole("button", { name: "Save my call" }).click();
  await expect(page.getByText("Call saved")).toBeVisible();
  await expect(page.locator("altcha-widget")).toHaveCount(0);
  await expect(page.getByText(/quick check/i)).toHaveCount(0);
});

test("the signed-in check says only yes or no: signed out with accounts off, never cached", async ({ page, request }) => {
  const session = await request.get("/api/session");
  expect(session.status()).toBe(200);
  expect(session.headers()["cache-control"]).toContain("no-store");
  expect(await session.json()).toEqual({ signedIn: false });
  // Saving a call never pulls the account details (email, consents) onto the question page.
  const asked: string[] = [];
  page.on("request", (req) => asked.push(new URL(req.url()).pathname));
  await page.goto("/en/q/boc-cut-dec-2026");
  await page.getByRole("button", { name: "Yes", exact: true }).click();
  await page.getByRole("button", { name: "Save my call" }).click();
  await expect(page.getByText("Call saved")).toBeVisible();
  expect(asked).not.toContain("/api/account");
});

test("share buttons link to the plain question page, with no tracking", async ({ page }) => {
  for (const locale of ["en", "fr"] as const) {
    await page.goto(`/${locale}/q/boc-cut-dec-2026`);
    const href = async (key: string) => new URL((await page.locator(`a[data-share="${key}"]`).getAttribute("href")) ?? "");
    const plain = new RegExp(`^https?://[^/?#]+/${locale}/q/boc-cut-dec-2026$`);
    const line = locale === "en" ? "Make your call on CANsensus. Free. No prizes." : "Faites votre prévision sur CANsensus. Gratuit. Aucun prix à gagner.";

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

test("each platform's logo opens our post, with its own poll result and bar beside it", async ({ page }) => {
  await page.goto("/en/q/canadiens-leafs-nov-21-2026");
  const block = page.getByTestId("social-polls").locator("visible=true");
  await expect(block).toHaveCount(1);
  const links = block.getByRole("link");
  // Only platforms with a result show: Facebook and Threads have posts but no result yet, so they stay hidden.
  expect(await links.evaluateAll((els) => els.map((el) => el.getAttribute("data-platform")))).toEqual(["x", "instagram"]);
  await expect(block.getByRole("link", { name: "Open our X post (new tab)" })).toHaveAttribute("href", "https://x.com/CANsensus/status/1");
  await expect(block.getByRole("link", { name: "Open our Instagram post (new tab)" })).toHaveAttribute("href", "https://www.instagram.com/stories/CANsensus/1/");
  for (const el of await links.all()) {
    await expect(el).toHaveAttribute("target", "_blank");
    await expect(el).toHaveAttribute("rel", "noopener noreferrer");
  }
  // Canada says beside the X poll: the Canada-only number and the open one, each labelled.
  const compare = block.getByTestId("social-compare");
  await expect(compare).toContainText("Canada says");
  await expect(compare).toContainText("54%");
  await expect(compare).toContainText("Calls from Canada only");
  await expect(compare).toContainText("X poll");
  await expect(compare).toContainText("65%");
  await expect(compare).toContainText("Anyone can vote");
  const items = block.getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText("X poll, Nov 20: 65% yes · 1,243 votes");
  await expect(items.nth(1)).toContainText("Instagram poll, Nov 20: 60% yes · 3,492 votes");
  await expect(block.getByText("Not verified. May include people outside Canada and under 18.")).toBeVisible();
  // Never inside Canada says.
  await expect(page.getByRole("region", { name: "Canada says" }).getByText(/3,492/)).toHaveCount(0);

  await page.goto("/fr/q/canadiens-leafs-nov-21-2026");
  const bloc = page.getByTestId("social-polls").locator("visible=true");
  await expect(bloc.getByRole("link", { name: "Ouvrir notre publication sur Instagram (nouvel onglet)" })).toBeVisible();
  await expect(bloc.getByTestId("social-compare")).toContainText("Selon le Canada");
  await expect(bloc.getByTestId("social-compare")).toContainText("Tout le monde peut voter");
  await expect(bloc.getByText("Sondage Instagram, 20 nov.\u00A0: 60\u00A0% de oui · 3\u00A0492\u00A0votes")).toBeVisible();
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

for (const width of [390, 1280]) {
  test(`at ${width}px, Tab goes from Back straight to the Yes and No answers`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/en/q/boc-cut-dec-2026");
    await page.getByRole("link", { name: /Back to today/ }).focus();
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toHaveText(/^Yes/);
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toHaveText(/^No/);
  });
}

test("a resolved question speaks in the past and its share post invites no call", async ({ page }) => {
  for (const locale of ["en", "fr"] as const) {
    await page.goto(`/${locale}/q/cpi-sept-2026`);
    await expect(page.getByRole("heading", { level: 2, name: locale === "en" ? "How it was resolved" : "Comment elle a été résolue" })).toBeVisible();
    const x = new URL((await page.locator('a[data-share="x"]').getAttribute("href")) ?? "");
    expect(x.searchParams.get("text")).toContain(locale === "en" ? "See where Canada landed on CANsensus." : "Voyez ce que prévoyait le Canada sur CANsensus.");
    expect(x.searchParams.get("text")).not.toContain(locale === "en" ? "Make your call" : "Faites votre prévision");
  }
});

test("the official source links to its French page on /fr and its English page on /en", async ({ page }) => {
  await page.goto("/fr/q/boc-cut-dec-2026");
  await expect(page.getByRole("link", { name: "Banque du Canada" }).first()).toHaveAttribute("href", /^https:\/\/www\.banqueducanada\.ca\//);
  await page.goto("/en/q/boc-cut-dec-2026");
  await expect(page.getByRole("link", { name: "Bank of Canada" }).first()).toHaveAttribute("href", /^https:\/\/www\.bankofcanada\.ca\//);
});
