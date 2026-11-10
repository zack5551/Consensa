/**
 * POST /api/engine/cycle: runs one PULSE cycle. Called by the scheduler every 15 minutes with
 * `Authorization: Bearer $ENGINE_CRON_SECRET`. Off (404) until that secret is set. Returns the cycle report as JSON;
 * nothing here is user-facing, and nothing is published without an editor.
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { engineEnv } from "@/engine/config";
import { runFromEnv } from "@/engine/run";
import { SAMPLE_NOW, sampleQuestions } from "@/content/sample-questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(header: string | null, secret: string): boolean {
  const given = Buffer.from(header?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: NextRequest) {
  const env = engineEnv();
  if (!env.ENGINE_CRON_SECRET) return new NextResponse(null, { status: 404 });
  if (!authorized(request.headers.get("authorization"), env.ENGINE_CRON_SECRET)) return new NextResponse(null, { status: 401 });

  const liveFeeds = env.ENGINE_LIVE_FEEDS === "1";
  const result = await runFromEnv({
    apiKey: env.ANTHROPIC_API_KEY,
    liveFeeds,
    maxDrafts: env.ENGINE_MAX_DRAFTS,
    // Sample feeds are pinned to the sample clock so a dry run is reproducible.
    now: liveFeeds ? new Date() : SAMPLE_NOW,
    live: sampleQuestions.map((q) => ({ slug: q.slug, question: q.question })),
  });
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
