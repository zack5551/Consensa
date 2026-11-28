import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Every layout.tsx under src/app. */
function layouts(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return layouts(path);
    return e.name === "layout.tsx" ? [path] : [];
  });
}

describe("route params", () => {
  // Next applies a layout's `dynamicParams = false` to every page below it, overriding the page's own `true`. That
  // made every question published after the last build a 404 (2026-11-27). Lock params per page, never in a layout.
  it("no layout turns off on-demand pages for the routes below it", () => {
    const locked = layouts(join(process.cwd(), "src/app")).filter((p) => /export const dynamicParams\s*=\s*false/.test(readFileSync(p, "utf8")));
    expect(locked).toEqual([]);
  });
});
