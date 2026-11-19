/**
 * Reads a reply as YES or NO, in English or French. Strict on purpose: the whole reply must be the one word
 * (any case, accents, punctuation, emoji and @mentions aside). Anything else, even "yes, probably", is unclear
 * and is ignored, so nobody's sentence is turned into a call they didn't make.
 */
import type { Vote } from "./types";

const words: Record<string, Vote> = { yes: "yes", oui: "yes", no: "no", non: "no" };

export function parseVote(text: string | null | undefined): Vote | null {
  if (typeof text !== "string" || text.length > 280) return null;
  const cleaned = text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@[a-z0-9_.]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (cleaned === "" || cleaned.includes(" ")) return null;
  return words[cleaned] ?? null;
}
