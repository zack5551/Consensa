/**
 * Reads a reply as YES or NO, in English or French. Strict on purpose: the whole reply must be the one word
 * (any case, accents, punctuation, emoji and @mentions aside). Anything else, even "yes, probably", is unclear
 * and is ignored, so nobody's sentence is turned into a call they didn't make.
 *
 * With `marks` (Facebook comments, zack 2026-11-23), a check mark also reads as yes and a cross as no, alone or next
 * to the matching word ("✅", "✅ YES", "❌ non"). A mark that disagrees with the word ("✅ NO") is unclear.
 */
import type { Vote } from "./types";

const words: Record<string, Vote> = { yes: "yes", oui: "yes", no: "no", non: "no" };

// ✅ ✔ ☑ for yes; ❌ ❎ ✖ for no. Emoji variation selectors are dropped with the rest of the punctuation below.
const YES_MARK = /[✅✔☑]/u;
const NO_MARK = /[❌❎✖]/u;
const ANY_MARK = /[✅✔☑❌❎✖]/gu;

export function parseVote(text: string | null | undefined, options: { marks?: boolean } = {}): Vote | null {
  if (typeof text !== "string" || text.length > 280) return null;
  let mark: Vote | null = null;
  let rest = text;
  if (options.marks) {
    const yes = YES_MARK.test(text);
    const no = NO_MARK.test(text);
    if (yes && no) return null;
    mark = yes ? "yes" : no ? "no" : null;
    rest = text.replace(ANY_MARK, " ");
  }
  const cleaned = rest
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@[a-z0-9_.]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (cleaned === "") return mark;
  if (cleaned.includes(" ")) return null;
  const word = words[cleaned] ?? null;
  if (!word || (mark && mark !== word)) return null;
  return word;
}
