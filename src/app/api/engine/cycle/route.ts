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
import { failureEmail } from "@/engine/notify/digest";
import { sesMailer, type Mailer } from "@/engine/notify/ses";
import { runFromEnv } from "@/engine/run";
import { siteDueQuestions } from "@/engine/site-results";
import { SupabaseStore } from "@/engine/supabase-store";
import { SAMPLE_NOW, sampleQuestions } from "@/content/sample-questions";
import { isOpen, questionState } from "@/lib/question";
import { socialGaps, socialVotingOn } from "@/lib/social-voting/env";
import { runSocialStep } from "@/lib/social-voting/run";
import { logErrorCode } from "@/lib/server/error-code-log";

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

/** The editor email, when every SES setting is there. Null otherwise: the run still works, it just sends nothing. */
function mailerFrom(env: EngineEnv): Mailer | null {
  if (!env.ENGINE_ALERT_EMAIL || !env.SES_ACCESS_KEY_ID || !env.SES_SECRET_ACCESS_KEY) return null;
  return sesMailer({
    accessKeyId: env.SES_ACCESS_KEY_ID,
    secretAccessKey: env.SES_SECRET_ACCESS_KEY,
    to: env.ENGINE_ALERT_EMAIL,
    from: env.ENGINE_ALERT_FROM ?? env.ENGINE_ALERT_EMAIL,
  });
}

/** Open questions on the site: the built slate plus anything that went live this run. */
function openOnSite(published: readonly string[]): number {
  const now = new Date();
  const open = sampleQuestions.filter((q) => isOpen(questionState(q, now))).map((q) => q.slug);
  return new Set([...open, ...published]).size;
}

async function runCycle(env: EngineEnv) {
  // Emails go out only for real runs, so previews and sample runs never write to the editor.
  const mailer = env.ENGINE_LIVE_FEEDS === "1" && env.ANTHROPIC_API_KEY ? mailerFrom(env) : null;
  try {
    return await runCycleInner(env, mailer);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logErrorCode("engine", "cycle-failed");
    if (mailer) await mailer(failureEmail(message, new Date()));
    return NextResponse.json({ failed: true }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}

async function runCycleInner(env: EngineEnv, mailer: Mailer | null) {
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
    checkThreshold: env.ENGINE_CHECK_THRESHOLD,
    ...(mailer ? { mailer, openOnSite } : {}),
    // Automatic results read free official data on the real clock, so they run whenever Supabase can keep the record.
    ...(supabase ? { results: { questions: siteDueQuestions(sampleQuestions), store: supabase, now: new Date() } } : {}),
  });
  // Social voting (sprint 11): count replies from linked accounts on our official posts. Null, and nothing is called,
  // while SOCIAL_VOTING is off. A failure here never fails the cycle; the report is counts only.
  // Go-live: with the flag on, name each missing setting in the log (the setting, never its value), so a half-set
  // switch shows up instead of doing nothing quietly. Without a link secret the step itself stays off.
  if (socialVotingOn()) {
    for (const gap of socialGaps()) logErrorCode("social-voting", `missing-${gap}`);
    if (!supabase) logErrorCode("social-voting", "missing-database");
  }
  const social = await runSocialStep(new Date()).catch(() => ({ failed: true }));
  return NextResponse.json({ ...result, social }, { headers: { "cache-control": "no-store" } });
}
