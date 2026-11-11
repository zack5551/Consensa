import { describe, expect, it } from "vitest";
import { rateLimiter } from "@/lib/rate-limit";

describe("rateLimiter", () => {
  it("allows up to the limit in a window, then refuses", () => {
    const allow = rateLimiter({ limit: 3, windowMs: 60_000 });
    expect([allow("a", 0), allow("a", 1), allow("a", 2), allow("a", 3)]).toEqual([true, true, true, false]);
  });

  it("starts a fresh window once the old one passes", () => {
    const allow = rateLimiter({ limit: 1, windowMs: 1000 });
    expect(allow("a", 0)).toBe(true);
    expect(allow("a", 999)).toBe(false);
    expect(allow("a", 1000)).toBe(true);
  });

  it("counts each key on its own", () => {
    const allow = rateLimiter({ limit: 1, windowMs: 1000 });
    expect(allow("a", 0)).toBe(true);
    expect(allow("b", 0)).toBe(true);
    expect(allow("a", 1)).toBe(false);
  });

  it("keeps memory bounded by dropping the oldest key", () => {
    const allow = rateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 2 });
    allow("a", 0);
    allow("b", 0);
    allow("c", 0);
    expect(allow("a", 1)).toBe(true);
  });
});
