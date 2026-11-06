import { describe, expect, it } from "vitest";
import en from "@/i18n/dictionaries/en";
import fr from "@/i18n/dictionaries/fr";
import { sampleQuestions } from "@/content/sample-questions";

/**
 * Quebec French typography (OQLF, PRISM's consensa-voice skill).
 * A non-breaking space (U+00A0 or U+202F) goes before : and %, inside « », and between a number and its unit,
 * so a line never breaks between "18" and "ans". Quebec usage puts no space before ? or !.
 */
function strings(obj: unknown): string[] {
  if (typeof obj === "string") return [obj];
  if (typeof obj !== "object" || obj === null) return [];
  return Object.values(obj).flatMap(strings);
}

function frenchSampleText(obj: unknown): string[] {
  if (typeof obj !== "object" || obj === null) return [];
  return Object.entries(obj).flatMap(([k, v]) => (k === "fr" && typeof v === "string" ? [v] : frenchSampleText(v)));
}

const french = [...strings(fr), ...sampleQuestions.flatMap(frenchSampleText)].filter((s) => !/^https?:/.test(s));

const rules: [string, RegExp][] = [
  ["plain space before : % or »", / [:%»]/],
  ["plain space after «", /« /],
  ["missing space before : or %", /[^\s  /:][:%](?!\/)/],
  ["any space before ? or !", /[\s  ][?!]/],
  ["straight apostrophe (use ’)", /'/],
  ["plain space between a number and its unit", /(\d|\{\w+\}) (ans|jours?|points?|pts|sem\.|mois|semaines?|cm|mm|h|min)(?![\p{L}])/u],
];

describe("French typography", () => {
  it.each(rules)("no French string has a %s", (_, re) => {
    expect(french.filter((s) => re.test(s))).toEqual([]);
  });
});

describe("English typography", () => {
  it("uses curly apostrophes (’) in every English string", () => {
    expect(strings(en).filter((s) => s.includes("'"))).toEqual([]);
  });
});
