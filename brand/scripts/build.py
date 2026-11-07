"""Generates the Consensa brand kit: tokens, logo SVGs. Run: PYTHONPATH=. python3 build.py OUTDIR FONTDIR"""
import sys, os, json, math
from color import *
OUT, FONTS = sys.argv[1], sys.argv[2]

# ---------- colour ----------
BRAND = {'teal': '#0F766E', 'violet': '#6D4AA8', 'red': '#C8102E'}
scales = {k: scale(v) for k, v in BRAND.items()}
def neutral(h, ls, cool):
    L, C, H = lch(h); out = {}
    for st, l in zip(STEPS, ls):
        out[st] = h.upper() if l is None else fromLCH(l, (C*0.35 if st <= 300 else C*0.75) if cool else C, H)
    return out
scales['ink'] = neutral('#14213D', [.975,.945,.89,.80,.66,.545,.465,.39,.315,None,.19], True)
scales['paper'] = neutral('#FAF8F5', [.993,None,.955,.915,.84,.72,.60,.48,.37,.28,.20], False)
# warm amber for warnings / third data series (not a party colour, not sportsbook green)
scales['amber'] = scale('#B45309')

P = lambda n, s: scales[n][s]
light = {
  'bg': P('paper',100), 'surface': P('paper',50), 'surface-sunken': P('paper',200), 'border': P('paper',300), 'border-strong': P('paper',400), 'border-control': '#7A86A0',
  'text': P('ink',900), 'text-muted': P('ink',600), 'text-subtle': P('ink',500), 'text-inverse': P('paper',50),
  'side-a': P('teal',600), 'side-a-soft': P('teal',100), 'side-a-text': P('teal',700),
  'side-b': P('violet',600), 'side-b-soft': P('violet',100), 'side-b-text': P('violet',700),
  'accent': P('red',600), 'accent-soft': P('red',50),
  'focus': P('violet',600), 'success': P('teal',700), 'warning': P('amber',700), 'danger': P('red',700),
  'link': P('teal',700),
}
dark = {
  'bg': '#0B1324', 'surface': '#121B2E', 'surface-sunken': '#080E1B', 'border': '#26304A', 'border-strong': '#38435F', 'border-control': '#6E7A96',
  'text': '#F4F1EA', 'text-muted': '#A9B1C2', 'text-subtle': '#8590A6', 'text-inverse': P('ink',900),
  'side-a': P('teal',400), 'side-a-soft': '#0E2B2B', 'side-a-text': P('teal',300),
  'side-b': P('violet',400), 'side-b-soft': '#211A3A', 'side-b-text': P('violet',300),
  'accent': P('red',400), 'accent-soft': '#2B1220',
  'focus': P('violet',400), 'success': P('teal',300), 'warning': P('amber',300), 'danger': P('red',300),
  'link': P('teal',300),
}
# contrast audit
checks = []
for mode, t in (('light', light), ('dark', dark)):
    for fg in ['text','text-muted','text-subtle','side-a-text','side-b-text','link','danger','success','warning','accent']:
        for bg in ['bg','surface']:
            checks.append((mode, fg, bg, round(contrast(t[fg], t[bg]), 2), 4.5))
    for g in ['side-a','side-b','accent','focus','border-control']:
        checks.append((mode, g, 'bg', round(contrast(t[g], t['bg']), 2), 3.0))
    on = 'text-inverse' if mode == 'light' else 'text-inverse'
    for g in ['side-a','side-b','accent']:
        fgc = t['surface'] if mode == 'light' else t['text-inverse']
        checks.append((mode, f'text on {g}', g, round(contrast(fgc, t[g]), 2), 4.5))
fails = [c for c in checks if c[3] < c[4]]

# ---------- type, space, etc ----------
type_scale = {  # size px, line-height, tracking em
 'caption': (12, 16, 0.01), 'body-sm': (14, 20, 0), 'body': (16, 24, 0), 'body-lg': (18, 28, -0.005),
 'title-sm': (20, 28, -0.01), 'title': (24, 32, -0.015), 'headline': (32, 40, -0.02), 'display-sm': (36, 44, -0.025),
 'display': (56, 60, -0.03), 'display-lg': (64, 68, -0.035), 'stat': (72, 72, -0.04),
}
space = {str(k): f'{k*4}px' for k in [0,1,2,3,4,5,6,8,10,12,16,20,24,32]}
space['0.5'] = '2px'
radius = {'xs': '4px', 'sm': '6px', 'md': '10px', 'lg': '14px', 'xl': '20px', '2xl': '28px', 'full': '9999px'}
shadow_l = {'sm': '0 1px 2px rgba(20,33,61,.06), 0 1px 1px rgba(20,33,61,.04)',
            'md': '0 4px 12px -2px rgba(20,33,61,.08), 0 2px 4px -2px rgba(20,33,61,.05)',
            'lg': '0 16px 40px -12px rgba(20,33,61,.18), 0 4px 10px -4px rgba(20,33,61,.06)'}
shadow_d = {'sm': '0 1px 2px rgba(0,0,0,.4)', 'md': '0 6px 16px -4px rgba(0,0,0,.5)', 'lg': '0 20px 48px -12px rgba(0,0,0,.6)'}
motion = {'duration-fast': '120ms', 'duration-base': '200ms', 'duration-slow': '320ms', 'duration-reveal': '640ms',
          'ease-standard': 'cubic-bezier(.2,0,0,1)', 'ease-out': 'cubic-bezier(.16,1,.3,1)', 'ease-in': 'cubic-bezier(.4,0,1,1)'}
font = {'display': "Georgia, 'Times New Roman', 'Nimbus Roman', serif",
        'sans': "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        'mono': "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"}
# Display is a system serif (Georgia), not a hosted file: the GitHub connector cannot push binary
# font files, so no new woff2 can land from this side. Georgia is Matthew Carter's screen serif —
# editorial, readable, and already on every Mac, iPhone and Windows machine. When a hosted serif
# (e.g. Newsreader) lands in brand/fonts, point 'display' at it here and regenerate the tokens.
# data series for non-party, multi-option questions (party questions use official party colours instead)
series_l = [P('teal',600), P('violet',600), P('amber',600), P('ink',600), P('teal',400), P('violet',400)]
series_d = [P('teal',400), P('violet',400), P('amber',400), '#A9B1C2', P('teal',200), P('violet',200)]

os.makedirs(f'{OUT}/tokens', exist_ok=True); os.makedirs(f'{OUT}/logo', exist_ok=True)

# tokens.css
L = ['/* Consensa design tokens. Generated by brand/scripts/build.py, do not edit by hand. */', ':root {']
for n, sc in scales.items():
    for s, h in sc.items(): L.append(f'  --cn-{n}-{s}: {h};')
for k, v in font.items(): L.append(f'  --cn-font-{k}: {v};')
for k, (sz, lh, tr) in type_scale.items():
    L += [f'  --cn-text-{k}: {sz/16:g}rem;', f'  --cn-leading-{k}: {lh/16:g}rem;', f'  --cn-tracking-{k}: {tr:g}em;']
for k, v in space.items(): L.append(f"  --cn-space-{k.replace('.', '_')}: {v};")
for k, v in radius.items(): L.append(f'  --cn-radius-{k}: {v};')
for k, v in motion.items(): L.append(f'  --cn-{k}: {v};')
L.append('  color-scheme: light;')
def sem(t, sh, ser, ind='  '):
    o = [f'{ind}--cn-{k}: {v};' for k, v in t.items()]
    o += [f'{ind}--cn-shadow-{k}: {v};' for k, v in sh.items()]
    o += [f'{ind}--cn-series-{i+1}: {v};' for i, v in enumerate(ser)]
    return o
L += sem(light, shadow_l, series_l); L.append('}')
L.append(':root[data-theme="dark"] {'); L.append('  color-scheme: dark;'); L += sem(dark, shadow_d, series_d); L.append('}')
L.append('@media (prefers-color-scheme: dark) {'); L.append('  :root:not([data-theme="light"]) {'); L.append('    color-scheme: dark;')
L += sem(dark, shadow_d, series_d, '    '); L += ['  }', '}']
L += ['@media (prefers-reduced-motion: reduce) {', '  :root { --cn-duration-fast: 0ms; --cn-duration-base: 0ms; --cn-duration-slow: 0ms; --cn-duration-reveal: 0ms; }', '}']
open(f'{OUT}/tokens/tokens.css', 'w').write('\n'.join(L) + '\n')

# shadcn/ui bridge (Tailwind v4 + shadcn variable names)
def shad(t):
    return {'background': t['bg'], 'foreground': t['text'], 'card': t['surface'], 'card-foreground': t['text'],
            'popover': t['surface'], 'popover-foreground': t['text'], 'primary': t['side-a'], 'primary-foreground': t['surface'] if t is light else t['text-inverse'],
            'secondary': t['surface-sunken'], 'secondary-foreground': t['text'], 'muted': t['surface-sunken'], 'muted-foreground': t['text-muted'],
            'accent': t['side-b-soft'], 'accent-foreground': t['side-b-text'], 'destructive': t['danger'],
            'border': t['border'], 'input': t['border-control'], 'ring': t['focus'],
            'chart-1': (series_l if t is light else series_d)[0], 'chart-2': (series_l if t is light else series_d)[1], 'chart-3': (series_l if t is light else series_d)[2],
            'chart-4': (series_l if t is light else series_d)[3], 'chart-5': (series_l if t is light else series_d)[4]}
S = ['/* shadcn/ui bridge: maps Consensa tokens onto shadcn variable names (Tailwind v4). Import after tokens.css. Generated. */', ':root {', '  --radius: 0.625rem;']
S += [f'  --{k}: {v};' for k, v in shad(light).items()] + ['}', '.dark, :root[data-theme="dark"] {'] + [f'  --{k}: {v};' for k, v in shad(dark).items()] + ['}', '',
  '@theme inline {',
  '  --font-sans: var(--cn-font-sans);', '  --font-display: var(--cn-font-display);', '  --font-mono: var(--cn-font-mono);',
  '  --color-background: var(--background);', '  --color-foreground: var(--foreground);', '  --color-card: var(--card);', '  --color-card-foreground: var(--card-foreground);',
  '  --color-popover: var(--popover);', '  --color-popover-foreground: var(--popover-foreground);', '  --color-primary: var(--primary);', '  --color-primary-foreground: var(--primary-foreground);',
  '  --color-secondary: var(--secondary);', '  --color-secondary-foreground: var(--secondary-foreground);', '  --color-muted: var(--muted);', '  --color-muted-foreground: var(--muted-foreground);',
  '  --color-accent: var(--accent);', '  --color-accent-foreground: var(--accent-foreground);', '  --color-destructive: var(--destructive);',
  '  --color-border: var(--border);', '  --color-input: var(--input);', '  --color-ring: var(--ring);',
  '  --color-side-a: var(--cn-side-a);', '  --color-side-a-soft: var(--cn-side-a-soft);', '  --color-side-b: var(--cn-side-b);', '  --color-side-b-soft: var(--cn-side-b-soft);',
  '  --color-canada: var(--cn-accent);', '  --color-text-muted: var(--cn-text-muted);',
  '  --radius-sm: calc(var(--radius) - 4px);', '  --radius-md: calc(var(--radius) - 2px);', '  --radius-lg: var(--radius);', '  --radius-xl: calc(var(--radius) + 4px);',
  '  --ease-out: var(--cn-ease-out);', '}']
S += [f'  --color-{n}-{s}: var(--cn-{n}-{s});' for n in scales for s in STEPS][:0]  # palette steps available as --cn-* vars
open(f'{OUT}/tokens/shadcn-theme.css', 'w').write('\n'.join(S) + '\n')

# tokens.json (W3C DTCG)
def c(v): return {'$type': 'color', '$value': v}
J = {'color': {n: {str(s): c(h) for s, h in sc.items()} for n, sc in scales.items()},
     'semantic': {'light': {k: c(v) for k, v in light.items()}, 'dark': {k: c(v) for k, v in dark.items()}},
     'series': {'light': [c(v) for v in series_l], 'dark': [c(v) for v in series_d]},
     'font': {k: {'$type': 'fontFamily', '$value': v} for k, v in font.items()},
     'type': {k: {'$type': 'typography', '$value': {'fontSize': f'{sz}px', 'lineHeight': f'{lh}px', 'letterSpacing': f'{tr}em'}} for k, (sz, lh, tr) in type_scale.items()},
     'space': {k: {'$type': 'dimension', '$value': v} for k, v in space.items()},
     'radius': {k: {'$type': 'dimension', '$value': v} for k, v in radius.items()},
     'motion': {k: {'$type': 'duration' if 'duration' in k else 'cubicBezier', '$value': v} for k, v in motion.items()}}
json.dump(J, open(f'{OUT}/tokens/tokens.json', 'w'), indent=2)

# ---------- logo ----------
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
f = TTFont(f'{FONTS}/manrope-latin-800-normal.woff')
gs = f.getGlyphSet(); cmap = f.getBestCmap(); upm = f['head'].unitsPerEm
xh = f['OS/2'].sxHeight
def word_path(text, size, tracking_em):
    s = size / upm; x = 0; pen = SVGPathPen(None); tr = tracking_em * upm
    for ch in text:
        g = cmap[ord(ch)]
        tp = TransformPen(pen, (s, 0, 0, -s, x * s, 0))  # baseline at y=0, y flipped
        gs[g].draw(tp); x += gs[g].width + tr
    width = (x - tr) * s
    bp = BoundsPen(gs); 
    return pen.getCommands(), width
WORD = 'consensa'; WSIZE = 100
wpath, wwidth = word_path(WORD, WSIZE, -0.02)
xh_px = xh / upm * WSIZE
# measure true ink bounds of the word
from fontTools.pens.boundsPen import BoundsPen
bx0, by0, bx1, by1 = 1e9, 1e9, -1e9, -1e9; x = 0
for ch in WORD:
    g = cmap[ord(ch)]; bp = BoundsPen(gs); gs[g].draw(bp)
    if bp.bounds:
        a, b, cc, d = bp.bounds; bx0 = min(bx0, x + a); bx1 = max(bx1, x + cc); by0 = min(by0, b); by1 = max(by1, d)
    x += gs[g].width - 0.02 * upm
sc = WSIZE / upm
ink_left, ink_right, ink_top, ink_bot = bx0 * sc, bx1 * sc, -by1 * sc, -by0 * sc  # y flipped

def symbol_paths(cx, cy, R):
    k = R / 50.0; g = 3 * k; hr = 9.5 * k; dr = 6.5 * k
    yo = math.sqrt(R*R - g*g); yi = math.sqrt(hr*hr - g*g)
    left = (f'M{cx-g:.3f},{cy-yo:.3f} A{R:.3f},{R:.3f} 0 0 0 {cx-g:.3f},{cy+yo:.3f} '
            f'L{cx-g:.3f},{cy+yi:.3f} A{hr:.3f},{hr:.3f} 0 0 1 {cx-g:.3f},{cy-yi:.3f} Z')
    right = (f'M{cx+g:.3f},{cy-yo:.3f} A{R:.3f},{R:.3f} 0 0 1 {cx+g:.3f},{cy+yo:.3f} '
             f'L{cx+g:.3f},{cy+yi:.3f} A{hr:.3f},{hr:.3f} 0 0 0 {cx+g:.3f},{cy-yi:.3f} Z')
    return left, right, (cx, cy, dr)
def symbol_svg(a, b, dot, size=100, title='Consensa'):
    l, r, (cx, cy, dr) = symbol_paths(50, 50, 50)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="{size}" height="{size}" role="img" aria-label="{title}">'
            f'<title>{title}</title><path fill="{a}" d="{l}"/><path fill="{b}" d="{r}"/><circle fill="{dot}" cx="{cx}" cy="{cy}" r="{dr}"/></svg>\n')
T, V, R_ = BRAND['teal'], BRAND['violet'], BRAND['red']
TD, VD, RD = dark['side-a'], dark['side-b'], dark['accent']
open(f'{OUT}/logo/symbol.svg', 'w').write(symbol_svg(T, V, R_))
open(f'{OUT}/logo/symbol-dark.svg', 'w').write(symbol_svg(TD, VD, RD))
open(f'{OUT}/logo/symbol-mono.svg', 'w').write(symbol_svg('currentColor', 'currentColor', 'currentColor'))

def wordmark_svg(fill, pad=4):
    h = ink_bot - ink_top
    vb = f'{ink_left - pad:.2f} {ink_top - pad:.2f} {ink_right - ink_left + 2*pad:.2f} {h + 2*pad:.2f}'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" aria-label="consensa"><title>consensa</title>'
            f'<path fill="{fill}" d="{wpath}"/></svg>\n')
open(f'{OUT}/logo/wordmark.svg', 'w').write(wordmark_svg(light['text']))
open(f'{OUT}/logo/wordmark-dark.svg', 'w').write(wordmark_svg(dark['text']))
open(f'{OUT}/logo/wordmark-mono.svg', 'w').write(wordmark_svg('currentColor'))

def lockup_svg(text_fill, a, b, dot):
    # symbol diameter = 1.5 x x-height, optically centred on the x-height band
    D = xh_px * 1.5; R = D / 2; gap = xh_px * 0.48
    cy = -xh_px / 2; cx = R
    l, r, (dcx, dcy, dr) = symbol_paths(cx, cy, R)
    tx = D + gap - ink_left
    pad = 4; top = min(cy - R, ink_top) - pad; bot = max(cy + R, ink_bot) + pad
    width = tx + ink_right + pad
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-pad} {top:.2f} {width + pad:.2f} {bot - top:.2f}" role="img" aria-label="Consensa"><title>Consensa</title>'
            f'<path fill="{a}" d="{l}"/><path fill="{b}" d="{r}"/><circle fill="{dot}" cx="{dcx:.3f}" cy="{dcy:.3f}" r="{dr:.3f}"/>'
            f'<g transform="translate({tx:.3f},0)"><path fill="{text_fill}" d="{wpath}"/></g></svg>\n')
open(f'{OUT}/logo/lockup.svg', 'w').write(lockup_svg(light['text'], T, V, R_))
open(f'{OUT}/logo/lockup-dark.svg', 'w').write(lockup_svg(dark['text'], TD, VD, RD))
open(f'{OUT}/logo/lockup-mono.svg', 'w').write(lockup_svg('currentColor', 'currentColor', 'currentColor', 'currentColor'))

# app icon (square; platforms apply their own mask) and favicon
l, r, (cx, cy, dr) = symbol_paths(512, 512, 290)
open(f'{OUT}/logo/app-icon.svg', 'w').write(
  f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="Consensa"><title>Consensa</title>'
  f'<rect width="1024" height="1024" fill="{light["text"]}"/><path fill="{TD}" d="{l}"/><path fill="{VD}" d="{r}"/><circle fill="{RD}" cx="{cx}" cy="{cy}" r="{dr:.3f}"/></svg>\n')
open(f'{OUT}/logo/favicon.svg', 'w').write(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><style>.a{fill:%s}.b{fill:%s}.d{fill:%s}@media (prefers-color-scheme:dark){.a{fill:%s}.b{fill:%s}.d{fill:%s}}</style>'
  % (T, V, R_, TD, VD, RD) + f'<path class="a" d="{symbol_paths(50,50,50)[0]}"/><path class="b" d="{symbol_paths(50,50,50)[1]}"/><circle class="d" cx="50" cy="50" r="6.5"/></svg>\n')

json.dump({'scales': scales, 'light': light, 'dark': dark, 'series_light': series_l, 'series_dark': series_d,
           'contrast': checks, 'fails': fails}, open(f'{OUT}/tokens/_audit.json', 'w'), indent=1)
print('fails:', fails)
print('checks:', len(checks))
