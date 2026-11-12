import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..", "..");
const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as {
  regions: string[];
  crons?: { path: string; schedule: string }[];
};

describe("Vercel Cron", () => {
  it("keeps server functions in Montréal", () => {
    expect(vercel.regions).toEqual(["yul1"]);
  });

  it("calls the engine cycle once a day, which the Hobby plan allows", () => {
    expect(vercel.crons).toEqual([{ path: "/api/engine/cycle", schedule: "0 15 * * *" }]);
  });

  it("points at a route that answers GET, checks CRON_SECRET and compares it in constant time", () => {
    const file = join(root, "src", "app", "api", "engine", "cycle", "route.ts");
    expect(existsSync(file)).toBe(true);
    const code = readFileSync(file, "utf8");
    expect(code).toMatch(/export async function GET\(/);
    expect(code).toMatch(/env\.CRON_SECRET/);
    expect(code).toMatch(/timingSafeEqual/);
  });
});
