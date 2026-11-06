/**
 * Bilingual text helpers for clustering and dedup. No dependencies, deterministic, fast enough for thousands of
 * headlines per cycle.
 */

const STOPWORDS = new Set(
  (
    // English
    "a an and are as at be been but by can could did do does for from had has have he her his how i if in into is it its " +
    "just may more most new no not of on or our out over says said she so than that the their them then there these they " +
    "this to up us was we were what when where which who why will with would you your after before about amid near week " +
    "today year years first last next live update updates video watch report reports " +
    // French
    "au aux avec ce ces cet cette dans de des du elle en est et il ils je la le les leur leurs mais ne nos notre nous on ou " +
    "par pas plus pour qu que qui sa se ses son sont sur un une vos votre vous été être fait faire après avant selon depuis " +
    "contre entre chez lors aussi très tout tous toute toutes alors ainsi encore déjà an ans année semaine aujourd hui"
  ).split(/\s+/),
);

/** Lowercase, strip accents and punctuation, collapse spaces. "Québec : la BdC baisse!" → "quebec la bdc baisse". */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[^\p{L}\p{N}%.]+/gu, " ")
    .replace(/(?<!\d)\.|\.(?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Content words only. Light stemming folds plurals so "rates" and "rate" match. */
export function tokens(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map((t) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t));
}

export function tokenSet(text: string): Set<string> {
  return new Set(tokens(text));
}

/** |A ∩ B| / |A ∪ B|, 0 when both are empty. */
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * Overlap coefficient: |A ∩ B| / min(|A|, |B|). Better than Jaccard when a short headline sits inside a longer one.
 */
export function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  const smaller = Math.min(a.size, b.size);
  if (smaller === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / smaller;
}

/** URL-safe slug from text, at most `max` characters, cut on a word boundary. */
export function slugify(text: string, max = 48): string {
  const words = normalize(text).replace(/[%.]/g, " ").split(" ").filter((w) => w && !STOPWORDS.has(w));
  let slug = "";
  for (const w of words) {
    const next = slug ? `${slug}-${w}` : w;
    if (next.length > max) break;
    slug = next;
  }
  return slug || "question";
}

/** Numbers that appear in a string, as written ("2.25", "10", "2026"). Used to check EN and FR say the same thing. */
export function numbersIn(text: string): string[] {
  return [...text.replace(/(\d)[\s  ](?=\d{3}\b)/g, "$1").matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => m[0].replace(",", "."));
}
