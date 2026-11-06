import { describe, expect, it } from "vitest";
import { activeNav, localeHref, navItems } from "@/components/shell/nav-items";
import en from "@/i18n/dictionaries/en";
import fr from "@/i18n/dictionaries/fr";

describe("app navigation", () => {
  it("has a label in both languages for every destination", () => {
    for (const item of navItems) {
      expect(en.nav[item.key], item.key).toBeTruthy();
      expect(fr.nav[item.key], item.key).toBeTruthy();
    }
  });
  it("builds locale paths, keeping home and anchors on the locale root", () => {
    expect(localeHref("fr", "/today")).toBe("/fr/today");
    expect(localeHref("en", "/")).toBe("/en");
    expect(localeHref("fr", "/#how")).toBe("/fr#how");
  });
  it("marks the current destination by whole path segments", () => {
    expect(activeNav("/en/today", "en")).toBe("today");
    expect(activeNav("/fr/board", "fr")).toBe("board");
    expect(activeNav("/fr/browse/economy", "fr")).toBe("board");
    expect(activeNav("/en/search", "en")).toBe("board");
    expect(activeNav("/en/forecasters/lea", "en")).toBe("leaderboard");
    expect(activeNav("/en/todayx", "en")).toBeNull();
    expect(activeNav("/en", "en")).toBeNull();
    expect(activeNav("/en/q/boc-cut-dec-2026", "en")).toBeNull();
  });
});
