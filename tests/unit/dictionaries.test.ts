import { describe, expect, it } from "vitest";
import en from "@/i18n/dictionaries/en";
import fr from "@/i18n/dictionaries/fr";

function paths(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => paths(v, prefix ? `${prefix}.${k}` : k));
}

function leaves(obj: unknown): Array<[string, string]> {
  return paths(obj).map((p) => [p, p.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj) as string]);
}

describe("EN/FR dictionaries", () => {
  it("have exactly the same keys", () => {
    expect(paths(fr).sort()).toEqual(paths(en).sort());
  });

  it("have no empty strings and no untranslated copies of long English lines", () => {
    const enMap = new Map(leaves(en));
    for (const [path, value] of leaves(fr)) {
      expect(value.trim(), path).not.toBe("");
      const english = enMap.get(path) ?? "";
      if (english.length > 12) expect(value, `${path} looks untranslated`).not.toBe(english);
    }
  });

  it("use non-breaking spaces before French high punctuation and %", () => {
    for (const [path, value] of leaves(fr)) {
      expect(value, path).not.toMatch(/ [?!:;%]/);
    }
  });
});
