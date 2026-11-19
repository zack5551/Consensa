import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "@/i18n/dictionaries/en";
import fr from "@/i18n/dictionaries/fr";
import { moreSampleQuestions } from "@/content/more-questions";
import { sampleForecasters } from "@/content/sample-forecasters";
import { sampleQuestions } from "@/content/sample-questions";
import { sampleResults } from "@/content/sample-results";
import { fixtureQuestions } from "@/content/test-fixtures";

/** CLAUDE.md rule 1: no betting language anywhere a user can read it. */
const banned = [
  /\bbet(s|ting|tor)?\b/i, /\bwager/i, /\bodds\b/i, /\bparlay/i, /\bslip\b/i, /\bpayout/i, /\bstake(s)?\b/i,
  /\bjackpot/i, /\block(ed)? in\b/i, /\bcash ?out\b/i, /\bprofit/i, /\bwinnings\b/i, /¢/,
  /\bpari(s|er)?\b/i, /\bmise(s)?\b/i, /\bcote(s)?\b/i, /\bgains?\b/i,
];

function strings(obj: unknown): string[] {
  if (typeof obj === "string") return [obj];
  if (typeof obj !== "object" || obj === null) return [];
  return Object.values(obj).flatMap(strings);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

/**
 * Every string literal written in the sample content (src/content), EN and FR, whether or not a module exports it.
 * Catches text that only reaches the page through another module, such as a resolved result's question or source.
 */
function contentLiterals(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return contentLiterals(full);
    if (name.endsWith(".json")) return strings(JSON.parse(readFileSync(full, "utf8")));
    if (!/\.(ts|tsx)$/.test(name)) return [];
    const text = readFileSync(full, "utf8");
    return [...text.matchAll(/"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? "");
  });
}

describe("vocabulary", () => {
  const sampleContent = [
    ...sampleQuestions.flatMap((q) => strings(q)),
    ...moreSampleQuestions.flatMap((q) => strings(q)),
    ...sampleResults.flatMap((r) => strings(r)),
    ...sampleForecasters.flatMap((f) => strings(f)),
    ...fixtureQuestions().flatMap((q) => strings(q)),
    ...contentLiterals("src/content"),
  ];
  const userFacing = [...strings(en), ...strings(fr), ...sampleContent];

  it("reads the sample content, results included", () => {
    expect(sampleResults.length).toBeGreaterThan(0);
    expect(contentLiterals("src/content").some((s) => s.includes("logements commencés"))).toBe(true);
  });

  it.each(banned.map((re) => [re.source, re] as const))("no user-facing text matches %s", (_, re) => {
    const hits = userFacing.filter((s) => re.test(s));
    expect(hits).toEqual([]);
  });

  it("no source identifiers use betting words", () => {
    const code = /\b(bets?|betting|wager\w*|odds|parlay\w*|payouts?|stakes?)\b|\b(bet|wager|odds|parlay|payout|stake)[A-Z_]/;
    const hits = sourceFiles("src").filter((f) => code.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
