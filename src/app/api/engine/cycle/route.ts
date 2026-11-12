/**
 * /api/engine/cycle: runs one PULSE cycle and returns the cycle report as JSON. Nothing here is user-facing, and
 * nothing is published without an editor.
 *
 * - POST: an outside scheduler (GitHub Actions) with `Authorization: Bearer $ENGINE_CRON_SECRET`.
 * - GET: Vercel Cron (vercel.json), which sends `Authorization: Bearer $CRON_SECRET` when that variable is set.
 *
 * Each method is off (404) until its own secret is set.
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { engineEnv, type EngineEnv } from "@/engine/config";
import { runFromEnv } from "@/engine/run";
import { siteDueQuestions } from "@/engine/site-results";
import { SupabaseStore } from "@/engine/supabase-store";
import { SAMPLE_NOW, sampleQuestions } from "@/content/sample-questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** A cycle drafts up to 6 stories with Claude; give it room (Vercel allows up to 300 s with Fluid compute). */
export const maxDuration = 300;

function authorized(header: string | null, secret: string): boolean {
  const given = Buffer.from(header?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: NextRequest) {
  const env = engineEnv();
  if (!env.ENGINE_CRON_SECRET) return new NextResponse(null, { status: 404 });
  if (!authorized(request.headers.get("authorization"), env.ENGINE_CRON_SECRET)) return new NextResponse(null, { status: 401 });
  return runCycle(env);
}

export async function GET(request: NextRequest) {
  const env = engineEnv();
  if (!env.CRON_SECRET) return new NextResponse(null, { status: 404 });
  if (!authorized(request.headers.get("authorization"), env.CRON_SECRET)) return new NextResponse(null, { status: 401 });
  return runCycle(env);
}

async function runCycle(env: EngineEnv) {
  const liveFeeds = env.ENGINE_LIVE_FEEDS === "1";
  const live = sampleQuestions.map((q) => ({ slug: q.slug, question: q.question }));
  // Save to Supabase only for a real run (live feeds and the Claude drafter), so sample or mock drafts never land
  // in the real review queue.
  const real = liveFeeds && Boolean(env.ANTHROPIC_API_KEY);
  const supabase = env.SUPABASE_URL && env.SUPABASE_SECRET_KEY ? new SupabaseStore({ url: env.SUPABASE_URL, secretKey: env.SUPABASE_SECRET_KEY, live }) : undefined;
  const store = real ? supabase : undefined;
  const result = await runFromEnv({
    apiKey: env.ANTHROPIC_API_KEY,
    liveFeeds,
    maxDrafts: env.ENGINE_MAX_DRAFTS,
    // Sample feeds are pinned to the sample clock so a dry run is reproducible.
    now: liveFeeds ? new Date() : SAMPLE_NOW,
    live,
    store,
    deployHook: env.VERCEL_DEPLOY_HOOK_URL,
    // Automatic results read free official data on the real clock, so they run whenever Supabase can keep the record.
    ...(supabase ? { results: { questions: siteDueQuestions(sampleQuestions), store: supabase, now: new Date() } } : {}),
  });
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
