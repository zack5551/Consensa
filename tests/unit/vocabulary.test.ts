import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "@/i18n/dictionaries/en";
import fr from "@/i18n/dictionaries/fr";
import { sampleQuestions } from "@/content/sample-questions";

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

describe("vocabulary", () => {
  const userFacing = [...strings(en), ...strings(fr), ...sampleQuestions.flatMap((q) => strings(q))];

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
