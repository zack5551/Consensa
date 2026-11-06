# Consensa brand kit

The source of truth for how Consensa looks and sounds. The app builds from these files; it does not redefine them.

Open `preview.html` in a browser to see everything rendered, with EN/FR and light/dark toggles.

## The idea

**Two sides meet in the middle.** Consensa turns many individual calls into one clear read of what Canada thinks happens next. It is free, there is no money anywhere, and it is fully bilingual.

Everything follows from that: two colours for the two sides, one red point for where Canada lands, and words about forecasting, never betting.

## Files

| Path | What it is |
| --- | --- |
| `tokens/tokens.css` | All design tokens as CSS custom properties (`--cn-*`). Light by default; dark via `prefers-color-scheme` or `data-theme="dark"`. Honours `prefers-reduced-motion`. |
| `tokens/shadcn-theme.css` | Bridge for Tailwind v4 + shadcn/ui: maps the tokens onto shadcn's variable names (`--background`, `--primary`, …) and an `@theme inline` block. Import after `tokens.css`. |
| `tokens/tokens.json` | The same tokens in W3C Design Tokens format, for Figma or other tooling. |
| `logo/` | `lockup`, `wordmark`, `symbol` in light, dark and `-mono` (`currentColor`) versions, plus `app-icon.svg` and a theme-aware `favicon.svg`. The wordmark is outlined paths, so it needs no font. |
| `copy/en.json`, `copy/fr.json` | Core UI microcopy with matching keys (ICU message format). |
| `fonts/` | Manrope and Inter (latin subset, which covers French), with their OFL licences. In a Next.js app prefer `next/font/google`; these are for the preview and offline use. |
| `scripts/build.py` | Regenerates tokens and logos. Never hand-edit generated files. |

Regenerate: `pip install fonttools`, then `PYTHONPATH=brand/scripts python3 brand/scripts/build.py <outdir> <dir containing manrope-latin-800-normal.woff>`. The Manrope `.woff` comes from the `@fontsource/manrope` npm package.

## Logo

- **Symbol:** a circle split down the middle, teal on the left and violet on the right, with a red point in the seam. Teal is side A, violet is side B, and the red point is Canada's read.
- **Wordmark:** `consensa`, always lowercase, Manrope ExtraBold, tracked −2%.
- **Lockup:** the symbol sits at 1.5× the x-height, centred on the lowercase letters, with a gap of about half the x-height.
- **Clear space:** keep at least the symbol's radius clear on every side.
- **Minimum sizes:** lockup 96 px wide; symbol 16 px (the favicon is tuned for it).
- **On dark backgrounds** use the `-dark` files, which have lighter teal and violet and a paper-coloured wordmark.
- **Don't** recolour the halves, swap their sides, add a maple leaf, capitalise the wordmark, outline it, or put it on a busy photo.

## Colour

Brand anchors: teal `#0F766E`, violet `#6D4AA8`, Canada red `#C8102E`, ink `#14213D`, paper `#FAF8F5`. Each has a full 50–950 scale (`--cn-teal-600` and so on), generated in OKLab so the steps look even.

Always use the **semantic** tokens in product code, never raw scale steps:

| Token | Use |
| --- | --- |
| `--cn-bg`, `--cn-surface`, `--cn-surface-sunken` | Page, cards, wells |
| `--cn-text`, `--cn-text-muted`, `--cn-text-subtle` | Text hierarchy |
| `--cn-side-a`, `--cn-side-b` (+ `-soft`, `-text`) | The two sides of a question: bars, buttons, labels |
| `--cn-accent` | Canada red. Use it as a pin, not a fill: live dots, the logo point, "Canada says" labels |
| `--cn-border`, `--cn-border-control` | Dividers; input and control outlines (passes 3:1) |
| `--cn-focus` | Focus rings |
| `--cn-success`, `--cn-warning`, `--cn-danger` | Status |
| `--cn-series-1…6` | Charts for multi-option questions |

**Rules**

- **Accessible by default.** Every text and background pair meets WCAG AA (4.5:1), and every graphic or control boundary meets 3:1, in both themes. `scripts/build.py` checks this and lists any failures.
- **No party colours on neutral questions.** Results for yes/no and most questions use teal and violet, which match no federal party (Liberal red, Conservative blue, NDP orange, Green, Bloc light blue). Questions that are actually about parties use each party's own colour, as news outlets do.
- **No sportsbook look.** No neon green, no black-and-gold, no odds boards.
- **Red is rare.** If a screen has more than a couple of red elements, it's too many.

## Type

- **Manrope** (600–800) for display, headlines and the numbers that matter (62%, 0.14).
- **Inter** (400–700) for UI and reading. Turn on tabular numbers (`font-variant-numeric: tabular-nums`) anywhere digits update or line up.
- The scale runs from `caption` (12/16) to `stat` (72/72), with tighter tracking as size goes up. See `--cn-text-*`, `--cn-leading-*`, `--cn-tracking-*`.
- French runs about 15–25% longer than English. Design every component at French length first.

## Shape and motion

- Radius: controls `md` (10 px), cards `xl` (20 px), chips `full`.
- Shadows are soft and ink-tinted, never black on light surfaces.
- Motion is calm. Use `--cn-ease-out` for reveals. Results bars animate in over `--cn-duration-reveal` (640 ms). Everything drops to 0 ms under reduced motion.

## Voice

Consensa sounds like a sharp, friendly Canadian editor: clear, warm, a little wry, and never hype.

- **Short and plain.** Sentences under 20 words. No exclamation marks except "Called it!" and "Vu juste!".
- **Respect the reader.** Explain how scoring works in one line. Never guilt, nag or use fake urgency.
- **Equal languages.** French is not a translation afterthought. Write Quebec French (OQLF style): *courriel*, *se connecter*, no space before `?` or `!`, a space before `:` and `%` (`62 %`), and `12 408` for thousands. Make every string inclusive and natural, not word-for-word from English.
- **Signature moment:** when a call comes true, it's **"Called it!"** in English and **"Vu juste!"** in French. When it doesn't, it's "Not this time." / "Pas cette fois.", with no shame.

### Words

| Say | Never say |
| --- | --- |
| call, forecast, chance ("62% chance") | bet, wager, odds, stake |
| Canada says, the crowd | pick, lock, parlay, slip |
| accuracy, streak, record | win money, cash out, payout, jackpot |
| question, closes, resolves | invest, profit, returns, trade |
| **FR:** prévision, chances, bilan, série, précision | **FR:** pari, mise, cote, enjeu, gain, encaisser, combiné |

Every question screen shows LEX's no-value label (`legal.noValue`: "Free to play. No cash value. No purchase necessary." / « Gratuit. Aucune valeur monétaire. Aucun achat requis. »), and the footer carries `legal.noMoney`. These rules are part of the product's legal position, not just its style.

## Machine-readable rules

`.claude/skills/consensa-voice/SKILL.md` gives Claude these voice and wording rules so generated copy follows them.

## App icons and share cards

`brand/scripts/render-app-assets.mjs` renders the app's raster assets from the logo SVGs and brand fonts: `src/app/apple-icon.png` (180 px), `public/icons/icon-{192,512}.png` (also used as the maskable icon, since the symbol sits inside the safe zone), and the bilingual Open Graph cards `public/og/{en,fr}.png` (1200×630). Run `node brand/scripts/render-app-assets.mjs` after any logo or tagline change. Set `NEXT_PUBLIC_SITE_URL` in production so share cards resolve to absolute URLs.
