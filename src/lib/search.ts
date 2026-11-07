/**
 * Bilingual question search. Pure and framework-free so it runs on the server (first paint)
 * and in the browser (instant results as you type) with the same ranking.
 *
 * Matching is accent- and case-insensitive ("quebec" finds "Québec"), and every query searches
 * both languages, so a French reader typing "neige" and an English reader typing "snow" land on
 * the same question.
 */

/** Lowercases, strips accents and typographic punctuation, and collapses whitespace. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[’'`]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Words of two or more characters. Single letters ("l", "d" from French elisions) are noise. */
export function tokenize(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((w) => w.length >= 2);
}

export type SearchField = { text: string; weight: number };

export type SearchDocument<T> = { item: T; fields: readonly SearchField[] };

export type SearchHit<T> = { item: T; score: number };

/**
 * Ranks documents against a query. Every query word must match somewhere (AND), as a word prefix,
 * so "infla" finds "inflation". A hit in a heavier field (the question itself) outranks a hit in a
 * lighter one (the resolution source). Ties keep the input order, which callers sort by relevance
 * (for example, most forecasters first).
 */
export function search<T>(docs: ReadonlyArray<SearchDocument<T>>, query: string, limit = 50): SearchHit<T>[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  const indexed = docs.map((doc, order) => ({
    doc,
    order,
    fields: doc.fields.map((f) => ({ words: tokenize(f.text), weight: f.weight })),
  }));

  const hits: Array<SearchHit<T> & { order: number }> = [];
  for (const { doc, order, fields } of indexed) {
    let score = 0;
    let all = true;
    for (const term of terms) {
      let best = 0;
      for (const field of fields) {
        for (const word of field.words) {
          if (word === term) best = Math.max(best, field.weight * 2);
          else if (word.startsWith(term)) best = Math.max(best, field.weight);
        }
      }
      if (best === 0) {
        all = false;
        break;
      }
      score += best;
    }
    if (all) hits.push({ item: doc.item, score, order });
  }

  return hits
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map(({ item, score }) => ({ item, score }));
}

/**
 * Splits text into plain and highlighted runs for the words in a query, matching the same way
 * search() does. Used to bold the matched words in results without dangerouslySetInnerHTML.
 */
export function highlight(text: string, query: string): Array<{ text: string; match: boolean }> {
  const terms = tokenize(query);
  if (terms.length === 0 || text.length === 0) return [{ text, match: false }];

  const runs: Array<{ text: string; match: boolean }> = [];
  // Split on word boundaries while keeping separators, so the original text is rebuilt exactly.
  const parts = text.split(/([\p{L}\p{N}]+)/u);
  for (const part of parts) {
    if (part === "") continue;
    const n = normalize(part);
    const match = n !== "" && terms.some((t) => n.startsWith(t));
    const last = runs[runs.length - 1];
    if (last && last.match === match) last.text += part;
    else runs.push({ text: part, match });
  }
  return runs;
}
