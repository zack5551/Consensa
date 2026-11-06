/**
 * Engine settings from the environment, validated once. Every key is optional: with none set, the engine runs on
 * sample feeds and the mock drafter, which is what tests, previews and CI use.
 *
 * Keys (see docs/engine/README.md):
 * - ANTHROPIC_API_KEY: turns on the Claude drafter.
 * - ENGINE_CRON_SECRET: turns on the cycle endpoint; the scheduler sends it as a bearer token.
 * - ENGINE_LIVE_FEEDS=1: fetch the real feeds instead of the samples.
 */
import "server-only";
import { z } from "zod";

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ENGINE_CRON_SECRET: z.string().min(32, "ENGINE_CRON_SECRET must be at least 32 characters").optional(),
  ENGINE_LIVE_FEEDS: z.enum(["0", "1"]).default("0"),
  ENGINE_MAX_DRAFTS: z.coerce.number().int().min(0).max(50).default(6),
});

export type EngineEnv = z.infer<typeof envSchema>;

export function engineEnv(env: Record<string, string | undefined> = process.env): EngineEnv {
  // Treat empty strings as unset, the way most hosts store a blank variable.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ""));
  return envSchema.parse(cleaned);
}
