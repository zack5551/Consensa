import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const script = fileURLToPath(new URL("../../scripts/check-performance-budget.mjs", import.meta.url));

/** Lines copied verbatim from a real `next build` table (Next 15.5.29). */
const BUILD_TABLE = [
  "Route (app)                                 Size  First Load JS",
  "┌ ○ /_not-found                            997 B         104 kB",
  "├ ● /[locale]                            1.96 kB         123 kB",
  "├   ├ /en",
  "├   └ /fr",
  "├ ƒ /[locale]/[...missing]                 141 B         103 kB",
  "├ ● /[locale]/board                        132 B         126 kB",
  "├ ● /[locale]/q/[slug]                     685 B         124 kB",
  "└ ● /[locale]/record                     1.45 kB         122 kB",
  "",
  "○  (Static)   prerendered as static content",
  "●  (SSG)      prerendered as static HTML",
  "ƒ  (Dynamic)  server-rendered on demand",
].join("\n");

async function runWithLog(contents: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const log = join(tmpdir(), `consensa-build-log-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  await writeFile(log, contents, "utf-8");
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [script, "--build-log", log]);
    return { code: 0, stdout, stderr };
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? -1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

describe("check-performance-budget", () => {
  it("passes a real build table, all routes under 150 kB", async () => {
    const { code, stdout } = await runWithLog(BUILD_TABLE);
    expect(code).toBe(0);
    expect(stdout).toContain("all 6 routes under 150 kB first-load JS.");
    expect(stdout).toContain("/[locale]/board");
  });

  it("fails when a route is over the budget and names it", async () => {
    const over = `${BUILD_TABLE}\n├ ● /[locale]/heavy  50 kB  210 kB`;
    const { code, stdout, stderr } = await runWithLog(over);
    expect(code).toBe(1);
    expect(`${stdout}${stderr}`).toContain("/[locale]/heavy (210 kB)");
  });

  it("fails loudly when the log has no route table, instead of passing silently", async () => {
    const { code, stderr } = await runWithLog("nothing built here");
    expect(code).toBe(1);
    expect(stderr).toContain("no routes found");
  });
});
