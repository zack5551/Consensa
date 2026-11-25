/**
 * Engine settings from the environment, validated once. Every key is optional: with none set, the engine runs on
 * sample feeds and the mock drafter, which is what tests, previews and CI use.
 *
 * Keys (see docs/engine/README.md):
 * - ANTHROPIC_API_KEY: turns on the Claude drafter.
 * - ENGINE_CRON_SECRET: turns on the cycle endpoint's POST; GitHub Actions sends it as a bearer token.
 * - CRON_SECRET: turns on the cycle endpoint's GET; Vercel Cron sends it as a bearer token.
 * - ENGINE_LIVE_FEEDS=1: fetch the real feeds instead of the samples.
 * - SUPABASE_URL + SUPABASE_SECRET_KEY: keep the queue, reads and live questions in Supabase (otherwise a dry run).
 * - VERCEL_DEPLOY_HOOK_URL: rebuild the site when a question goes live or resolves.
 * - ENGINE_MAX_DRAFTS: most writer calls per run across the five desks (default 24).
 * - ENGINE_MONTHLY_BUDGET_USD: stop drafting once this month's estimated Claude spend reaches this (default 95, zack
 *   2026-11-25, under the US$100 monthly credit). Estimated from writer calls (`notify/digest.ts` COST_PER_CALL).
 * - ENGINE_DAILY_DRAFTS: most writer calls per day (Toronto midnight to midnight), across every run (default 50).
 *   With two scheduled runs of up to 24 each this rarely binds; the monthly budget is the real cost cap.
 * - ENGINE_CHECK_THRESHOLD: the checker's flag line, 1–10 (default 7).
 * - ENGINE_AUTO_APPROVE: the engine approves low-risk drafts by itself (see `autoApprovable`). On by default (zack,
 *   2026-11-25); set 0 to send every draft to a person.
 * - ENGINE_ALERT_EMAIL + SES_ACCESS_KEY_ID + SES_SECRET_ACCESS_KEY: the run summary and flag emails, sent through
 *   Amazon SES in Montréal (ca-central-1, fixed). ENGINE_ALERT_FROM defaults to the recipient.
 */
import "server-only";
import { z } from "zod";

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ENGINE_CRON_SECRET: z.string().min(32, "ENGINE_CRON_SECRET must be at least 32 characters").optional(),
  CRON_SECRET: z.string().min(32, "CRON_SECRET must be at least 32 characters").optional(),
  ENGINE_LIVE_FEEDS: z.enum(["0", "1"]).default("0"),
  ENGINE_MAX_DRAFTS: z.coerce.number().int().min(0).max(50).default(24),
  ENGINE_DAILY_DRAFTS: z.coerce.number().int().min(0).max(500).default(50),
  ENGINE_MONTHLY_BUDGET_USD: z.coerce.number().min(0).max(10000).default(95),
  ENGINE_CHECK_THRESHOLD: z.coerce.number().int().min(1).max(10).default(7),
  ENGINE_AUTO_APPROVE: z.enum(["0", "1"]).default("1"),
  ENGINE_ALERT_EMAIL: z.email().optional(),
  ENGINE_ALERT_FROM: z.email().optional(),
  SES_ACCESS_KEY_ID: z.string().min(16).optional(),
  SES_SECRET_ACCESS_KEY: z.string().min(16).optional(),
  SUPABASE_URL: z.url().optional(),
  SUPABASE_SECRET_KEY: z.string().min(20).optional(),
  VERCEL_DEPLOY_HOOK_URL: z.url().optional(),
});

export type EngineEnv = z.infer<typeof envSchema>;

export function engineEnv(env: Record<string, string | undefined> = process.env): EngineEnv {
  // Treat empty strings as unset, the way most hosts store a blank variable.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ""));
  return envSchema.parse(cleaned);
}
