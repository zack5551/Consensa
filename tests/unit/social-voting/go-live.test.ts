import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { socialGaps } from "@/lib/social-voting/env";

const root = join(__dirname, "..", "..", "..");

describe("socialGaps", () => {
  const full = { SOCIAL_VOTING: "1", SOCIAL_LINK_SECRET: "s".repeat(40), X_CLIENT_ID: "id", X_BEARER_TOKEN: "b", X_MONTHLY_CAP_USD: "5" };

  it("names nothing when every X setting is there", () => {
    expect(socialGaps(full)).toEqual([]);
  });

  it("names each missing setting, never its value", () => {
    expect(socialGaps({ SOCIAL_VOTING: "1" })).toEqual(["link-secret", "x-link", "x-read", "x-cap"]);
    expect(socialGaps({ ...full, X_MONTHLY_CAP_USD: "0" })).toEqual(["x-cap"]);
    expect(socialGaps({ ...full, X_BEARER_TOKEN: "" })).toEqual(["x-read"]);
    expect(JSON.stringify(socialGaps({ ...full, X_CLIENT_ID: undefined }))).not.toContain("s".repeat(40));
  });

  it("treats a bad value as everything missing, the same way the flag fails closed", () => {
    expect(socialGaps({ ...full, SOCIAL_LINK_SECRET: "short" })).toEqual(["link-secret", "x-link", "x-read", "x-cap"]);
  });
});

describe("the readiness check zack pastes into Supabase", () => {
  const raw = readFileSync(join(root, "supabase", "checks", "social_voting_ready.sql"), "utf8");
  const sql = raw.replace(/--[^\n]*/g, "").toLowerCase();

  it("only looks: no statement in it can change anything", () => {
    const code = sql.replace(/'[^']*'/g, "''"); // names in quotes, like 'execute' in a privilege check, aren't statements
    expect(code).not.toMatch(/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate|call|do|perform|execute|copy|set)\b/);
    expect(sql.trim().startsWith("with checks")).toBe(true);
  });

  it("names the four migrations in the order they must run", () => {
    const order = ["20261119000000_social_voting", "20261120000000_social_sweep_approval", "20261120001000_social_sweep_withdrawals", "20261121000000_social_poll_finder"];
    const at = order.map((f) => raw.indexOf(f));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("checks every table the migrations create, and the poll finder's column", () => {
    const migrations = ["20261119000000_social_voting", "20261120000000_social_sweep_approval", "20261120001000_social_sweep_withdrawals"];
    const tables = migrations.flatMap((f) =>
      [...readFileSync(join(root, "supabase", "migrations", `${f}.sql`), "utf8").matchAll(/create table if not exists public\.([a-z_]+)/g)].map((m) => m[1]),
    );
    expect(tables.length).toBeGreaterThan(5);
    for (const t of tables) expect(sql, t).toContain(`'public.${t}'`);
    expect(sql).toContain("column_name = 'poll_ends_at'");
  });

  it("checks that the app's own key can't approve a sweep or restore a reply", () => {
    expect(sql).toContain("not has_function_privilege('service_role', 'public.approve_social_sweep(text, text)', 'execute')");
    expect(sql).toContain("not has_function_privilege('service_role', 'public.restore_social_reply(text, text, text)', 'execute')");
  });
});

describe("the go-live runbook", () => {
  const doc = readFileSync(join(root, "docs", "social-voting", "GO-LIVE.md"), "utf8");

  it("keeps the public auto-reply off and the switch last", () => {
    expect(doc).toMatch(/Leave `SOCIAL_AUTO_REPLY` unset/);
    expect(doc.indexOf("## 5. The switch")).toBeGreaterThan(doc.indexOf("## 4. Settings in Vercel"));
  });

  it("lists every log line the daily run can write for a missing setting", () => {
    for (const gap of [...socialGaps({}), "database"]) expect(doc).toContain(`missing-${gap}`);
  });
});
