/**
 * Same subject (zack, 2026-11-26: "some questions were put in twice"). Two questions about the same named things in
 * the same month read as one question, however differently they're worded or settled: "Montréal, 45 cm of snow in
 * December" and "Montréal–Trudeau, 15 cm from Dec. 1 to 15". The engine checks it before a draft goes to review
 * (`findDuplicate`), and the site checks it again when it reads engine questions, so a twin never shows.
 *
 * Pure and framework-free: it runs on the server and in the page bundle.
 */
/** Capitalised words that name nothing in particular on a Canadian site. */
const PLAIN_CAPS = new Set(["will", "the", "a", "an", "in", "on", "at", "by", "of", "for", "to", "and", "or", "is", "are", "be", "canada", "canadian", "canadians", "canada's", "s", "us", "u", "international", "airport", "after", "before"]);
const MONTHS: Array<[string, RegExp]> = [
  ["jan", /\b(january|jan\.?|janvier)\b/i], ["feb", /\b(february|feb\.?|février)\b/i], ["mar", /\b(march|mar\.?|mars)\b/i],
  ["apr", /\b(april|apr\.?|avril)\b/i], ["may", /\b(May|mai)\b/], ["jun", /\b(june|juin)\b/i], ["jul", /\b(july|juillet)\b/i],
  ["aug", /\b(august|aug\.?|août)\b/i], ["sep", /\b(september|sept?\.?|septembre)\b/i], ["oct", /\b(october|oct\.?|octobre)\b/i],
  ["nov", /\b(november|nov\.?|novembre)\b/i], ["dec", /\b(december|dec\.?|décembre)\b/i],
];
const ELEMENTS: Array<[string, RegExp]> = [
  ["snow", /\b(snow|snowfall|neige)\b/i],
  ["rain", /\b(rain|precipitation|pluie)\b/i],
  ["cold", /(\blow of\b|\bcold|−\d|-\d+\s*°|\bminus\b)/i],
  ["heat", /\b(heat|hottest|high of|°C or (hotter|warmer))\b/i],
];

/** What a question is about: the named things in it, the weather it measures and the months it names. */
export function subjectOf(question: string): { names: Set<string>; element: string | null; months: Set<string> } {
  const names = new Set<string>();
  const words = question.replace(/[“”"«»?]/g, " ").split(/\s+/).filter(Boolean);
  words.forEach((w, i) => {
    for (const part of w.split(/[-–—/’']/)) {
      const clean = part.replace(/[^\p{L}\p{N}]/gu, "");
      if (i === 0 || clean.length < 2 || !/^\p{Lu}/u.test(clean)) continue;
      const lower = clean.toLowerCase();
      if (!PLAIN_CAPS.has(lower) && !MONTHS.some(([, re]) => re.test(lower))) names.add(lower.normalize("NFD").replace(/\p{M}/gu, ""));
    }
  });
  const element = ELEMENTS.find(([, re]) => re.test(question))?.[0] ?? null;
  const months = new Set(MONTHS.filter(([, re]) => re.test(question)).map(([m]) => m));
  return { names, element, months };
}

/**
 * Same subject: at least two named things in common (a place and its weather counts as two, so does an artist's
 * full name; at least one must be a real name, so two cities' cold snaps stay apart), the same kind of weather when either measures weather, and a month in common when both name one.
 */
export function sameSubject(a: string, b: string): boolean {
  const x = subjectOf(a);
  const y = subjectOf(b);
  if ((x.element || y.element) && x.element !== y.element) return false;
  if (x.months.size > 0 && y.months.size > 0 && ![...x.months].some((m) => y.months.has(m))) return false;
  const names = [...x.names].filter((n) => y.names.has(n)).length;
  return names >= 1 && names + (x.element && x.element === y.element ? 1 : 0) >= 2;
}
