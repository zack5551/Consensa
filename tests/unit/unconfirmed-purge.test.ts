/**
 * AEGIS: sign-ups never confirmed by email are deleted after 7 days (LEX, Privacy Policy §8). These checks keep the
 * purge narrow: unconfirmed and never signed in, only after 7 days, only the consents recorded with that account,
 * server-only, and scheduled.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(__dirname, "..", "..", "supabase", "migrations", "20261118001000_purge_unconfirmed_signups.sql"), "utf8")
  .replace(/--[^\n]*/g, "")
  .toLowerCase();

describe("purge of unconfirmed sign-ups", () => {
  it("only picks accounts that never confirmed and never signed in, after 7 days", () => {
    expect(sql).toContain("u.email_confirmed_at is null");
    expect(sql).toContain("u.last_sign_in_at is null");
    expect(sql).toContain("u.created_at < now() - interval '7 days'");
  });

  it("only removes consent rows recorded with that account, never older ones for the same address", () => {
    expect(sql).toMatch(/c\.given_at >= s\.created_at - interval '5 minutes'/);
  });

  it("opens the consent log only for its own transaction", () => {
    expect(sql).toContain("set_config('consensa.unconfirmed_purge', 'on', true)");
    expect(sql).toContain("current_setting('consensa.unconfirmed_purge', true) = 'on'");
  });

  it("is server-only and runs nightly", () => {
    expect(sql).toContain("revoke execute on function public.purge_unconfirmed_signups() from public, anon, authenticated");
    expect(sql).toMatch(/cron\.schedule\('consensa-purge-unconfirmed-signups', '30 4 \* \* \*'/);
  });
});
