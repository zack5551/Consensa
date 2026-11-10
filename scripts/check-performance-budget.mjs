/**
 * Performance budget check (BUILD_PLAN quality bar).
 *
 * Runs `pnpm build`, reads the "First Load JS" column Next prints per route,
 * and fails when any route is over FIRST_LOAD_BUDGET_KB. The number enforced
 * is the number Next itself reports — not a sum of chunk files, which reads
 * ~3 kB lower than Next's table for the same build.
 *
 * Usage: `pnpm perf:budget` (builds and checks), or
 * `node scripts/check-performance-budget.mjs --build-log <file>` to check a
 * saved build log without rebuilding.
 */
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** BUILD_PLAN bar: first-load JS under 150 kB per route. */
export const FIRST_LOAD_BUDGET_KB = 150;

const ROW = /^\s*[├└┌│]\s*[○●ƒ]\s+(\S+)\s+([\d.]+)\s+(B|kB)\s+([\d.]+)\s+(B|kB)\s*$/;

/**
 * Pulls { route, firstLoadKb } rows out of `next build` output. Returns []
 * when the output has no route table (a changed Next format fails loudly in
 * main, never silently passes).
 */
export function parseBuildOutput(text) {
  const routes = [];
  for (const line of text.split("\n")) {
    const m = ROW.exec(line);
    if (!m) continue;
    const [, route, , , firstLoad, unit] = m;
    const kb = unit === "kB" ? Number(firstLoad) : Number(firstLoad) / 1024;
    routes.push({ route, firstLoadKb: Math.round(kb * 10) / 10 });
  }
  return routes;
}

/** Routes over the budget, if any. */
export function checkRoutes(routes, budgetKb = FIRST_LOAD_BUDGET_KB) {
  return routes.filter((r) => r.firstLoadKb > budgetKb);
}

async function buildOutput() {
  const { stdout, stderr } = await execFileAsync("pnpm", ["build"], { maxBuffer: 10 * 1024 * 1024 });
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  return stdout;
}

async function main() {
  const logIndex = process.argv.indexOf("--build-log");
  const text = logIndex === -1 ? await buildOutput() : await readFile(process.argv[logIndex + 1], "utf-8");
  const routes = parseBuildOutput(text);
  if (routes.length === 0) {
    console.error("perf budget: no routes found in the build output — the Next table format may have changed. Failing so this never passes silently.");
    process.exitCode = 1;
    return;
  }
  const over = checkRoutes(routes);
  const sorted = [...routes].sort((a, b) => b.firstLoadKb - a.firstLoadKb);
  console.log(`\nFirst Load JS per route (budget ${FIRST_LOAD_BUDGET_KB} kB):`);
  for (const r of sorted) {
    const headroom = Math.round((FIRST_LOAD_BUDGET_KB - r.firstLoadKb) * 10) / 10;
    console.log(`  ${r.firstLoadKb.toFixed(1).padStart(6)} kB  ${headroom >= 0 ? `${headroom.toFixed(1)} kB headroom` : `${Math.abs(headroom).toFixed(1)} kB OVER`}  ${r.route}`);
  }
  if (over.length > 0) {
    console.error(`\nperf budget: ${over.length} route(s) over ${FIRST_LOAD_BUDGET_KB} kB first-load JS: ${over.map((r) => `${r.route} (${r.firstLoadKb} kB)`).join(", ")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nperf budget: all ${routes.length} routes under ${FIRST_LOAD_BUDGET_KB} kB first-load JS.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
