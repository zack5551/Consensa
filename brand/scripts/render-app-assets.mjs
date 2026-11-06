// Renders Consensa's app icons and Open Graph cards from brand/ sources.
// Run: node brand/scripts/render-app-assets.mjs (uses the repo's @playwright/test)
// Outputs: src/app/apple-icon.png, public/icons/*.png, public/og/{en,fr}.png
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(resolve(root, p), "utf8");
// Fonts are inlined as data URLs: a page opened with setContent cannot load file:// fonts.
const font = (f) => `data:font/woff2;base64,${readFileSync(resolve(root, "brand/fonts", f)).toString("base64")}`;

const appIcon = read("brand/logo/app-icon.svg");
const lockup = read("brand/logo/lockup.svg");
const symbol = read("brand/logo/symbol.svg");

// Copy mirrors src/i18n/dictionaries (today.tagline, legal.footer). Re-run this script if those change.
const copy = {
  en: { head: "What Canada thinks happens next.", sub: "Make your call. See where Canada lands, province by province.", foot: "Free · No money · No prizes · 18+" },
  fr: { head: "Ce que le Canada prévoit.", sub: "Faites votre prévision. Voyez où le Canada se situe, province par province.", foot: "Gratuit · Sans argent · Sans prix · 18 ans et plus" },
};

const base = `
@font-face{font-family:Manrope;font-weight:800;src:url(${font("manrope-latin-800-normal.woff2")})}
@font-face{font-family:Inter;font-weight:500;src:url(${font("inter-latin-500-normal.woff2")})}
@font-face{font-family:Inter;font-weight:600;src:url(${font("inter-latin-600-normal.woff2")})}
*{margin:0;box-sizing:border-box} html,body{width:100%;height:100%}`;

const iconPage = (size) => `<style>${base} svg{display:block;width:${size}px;height:${size}px}</style>${appIcon}`;

const ogPage = (c) => `<style>${base}
body{background:#FAF8F5;color:#14213D;font-family:Inter;padding:72px 80px;display:grid;grid-template-columns:1fr 300px;gap:56px;align-items:center;position:relative;overflow:hidden}
.lock svg{height:46px;width:auto;display:block}
h1{font-family:Manrope;font-weight:800;font-size:68px;line-height:1.05;letter-spacing:-0.02em;margin:44px 0 24px;text-wrap:balance}
p{font-size:28px;line-height:1.35;color:#4A5672;font-weight:500;max-width:680px}
.foot{position:absolute;left:80px;bottom:56px;font-size:22px;font-weight:600;color:#14213D}
.sym svg{width:300px;height:300px;display:block}
.bar{position:absolute;left:0;right:0;bottom:0;height:14px;background:linear-gradient(90deg,#0F766E 0 50%,#6D4AA8 50% 100%)}
</style>
<div><div class="lock">${lockup}</div><h1>${c.head}</h1><p>${c.sub}</p></div>
<div class="sym">${symbol}</div><div class="foot">${c.foot}</div><div class="bar"></div>`;

const browser = await chromium.launch();
const shot = async (html, w, h, out) => {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(root, out), clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
};

await shot(iconPage(180), 180, 180, "src/app/apple-icon.png");
await shot(iconPage(192), 192, 192, "public/icons/icon-192.png");
await shot(iconPage(512), 512, 512, "public/icons/icon-512.png");
for (const [lang, c] of Object.entries(copy)) await shot(ogPage(c), 1200, 630, `public/og/${lang}.png`);
await browser.close();
console.log("rendered app icons and OG cards");
