/**
 * AEGIS guards on the database (supabase/migrations). Every CI run checks the rules in docs/security/README.md, so a
 * new migration can't open a table to the public key or leave a privileged function callable by anyone.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(__dirname, "..", "..", "supabase", "migrations");
const migrations = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .map((name) => ({ name, sql: readFileSync(join(dir, name), "utf8").replace(/--[^\n]*/g, "").toLowerCase() }));
const all = migrations.map((m) => m.sql).join("\n");

/** Tables set up in a loop over an array of names (the engine migration). */
const looped = [...all.matchAll(/foreach\s+\w+\s+in\s+array\s+array\[([^\]]+)\]\s+loop([\s\S]*?)end loop/g)].flatMap((m) =>
  m[2]!.includes("enable row level security") && /revoke all on %i from anon/.test(m[2]!)
    ? [...m[1]!.matchAll(/'([a-z_]+)'/g)].map((n) => n[1]!)
    : [],
);

const tables = [...all.matchAll(/create table (?:if not exists )?(?:public\.)?([a-z_]+)/g)].map((m) => m[1]!);
const functions = [...all.matchAll(/create (?:or replace )?function ([\w.]+)\(([^)]*)\)([\s\S]*?)\$\$/g)].map((m) => ({
  name: m[1]!.replace(/^public\./, ""),
  args: m[2]!,
  head: m[3]!,
}));

describe("database migrations", () => {
  it("finds the migrations, tables and functions", () => {
    expect(migrations.length).toBeGreaterThan(4);
    expect(tables.length).toBeGreaterThan(8);
    expect(functions.length).toBeGreaterThan(6);
  });

  for (const table of new Set(tables)) {
    it(`${table}: row level security on, nothing for the public key`, () => {
      const rls = looped.includes(table) || new RegExp(`alter table (public\\.)?${table} enable row level security`).test(all);
      expect(rls, "every table turns on row level security").toBe(true);
      const closed = looped.includes(table) || new RegExp(`revoke all on (public\\.)?${table} from (public, )?anon`).test(all);
      expect(closed, "every table revokes all from anon").toBe(true);
    });
  }

  for (const fn of functions) {
    it(`${fn.name}: fixed search_path`, () => {
      expect(fn.head, "a function must set search_path so a planted object can't hijack it").toMatch(/set search_path/);
    });

    if (/security definer/.test(fn.head) && !/returns trigger/.test(fn.head)) {
      it(`${fn.name}: privileged, so only the server may call it`, () => {
        const revoked = new RegExp(`revoke execute on function (public\\.)?${fn.name}\\([^)]*\\) from public, anon, authenticated`);
        expect(all, "security definer functions revoke execute from public, anon and authenticated").toMatch(revoked);
      });
    }
  }

  it("never grants anything to the public key", () => {
    expect(all).not.toMatch(/grant [^;]* to [^;]*\banon\b/);
  });

  it("stores nothing that could hold value (LEX: block it at the database level)", () => {
    expect(all, "no balance, wallet, coins, credits or points columns").not.toMatch(
      /^\s*(balance|wallet|coins?|credits?|points?|tokens?)\s+(int|integer|bigint|numeric|decimal|real|double)/m,
    );
  });
});
