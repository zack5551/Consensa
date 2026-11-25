/**
 * /api/engine/review: the editor's review page, linked from the PULSE run summary email. Internal and English only.
 *
 * - GET ?t=<token>: lists the drafts still waiting for a person. Shows only; changes nothing.
 * - POST (form): approve or reject one draft, or suggest a question (an idea the right desk writes on the spot, through
 *   every screen, check and approval rule; zack, 2026-11-25). Needs the same token in the form.
 *
 * The token is signed with CRON_SECRET and lasts a week (`notify/review-link.ts`). Off (404) until CRON_SECRET and
 * Supabase are set; a missing or wrong token gets 401 with no detail.
 */
import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { engineEnv } from "@/engine/config";
import { verifyReviewToken } from "@/engine/notify/review-link";
import { ideaNotice } from "@/engine/notify/idea";
import { applyReviewAction, renderReviewPage } from "@/engine/notify/review-page";
import { IDEA_MAX, IDEA_MIN, ideaStory } from "@/engine/ideas";
import { runFromEnv } from "@/engine/run";
import { LIVE_QUESTIONS_TAG, siteQuestions } from "@/lib/site-questions";
import { SupabaseStore } from "@/engine/supabase-store";
import { rateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Writing one suggested question (writer plus checker) takes about a minute.
export const maxDuration = 120;

const HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

const formSchema = z.discriminatedUnion("action", [
  z.object({ t: z.string().max(200), action: z.literal("approve"), id: z.string().min(1).max(200) }),
  z.object({ t: z.string().max(200), action: z.literal("reject"), id: z.string().min(1).max(200), reason: z.string().max(300).optional() }),
  z.object({ t: z.string().max(200), action: z.literal("idea"), idea: z.string().trim().min(IDEA_MIN).max(IDEA_MAX) }),
]);

function setup() {
  const env = engineEnv();
  if (!env.CRON_SECRET || !env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) return null;
  return {
    env,
    secret: env.CRON_SECRET,
    threshold: env.ENGINE_CHECK_THRESHOLD,
    store: new SupabaseStore({ url: env.SUPABASE_URL, secretKey: env.SUPABASE_SECRET_KEY }),
  };
}

/** One editor: a burst of clicks is fine, a script trying tokens is not. */
const allowAction = rateLimiter({ limit: 30, windowMs: 60_000 });

const unauthorized = () => new NextResponse("This link has expired or isn't valid. Use the link in the latest PULSE email.", { status: 401, headers: { "cache-control": "no-store" } });

export async function GET(request: NextRequest) {
  const s = setup();
  if (!s) return new NextResponse(null, { status: 404 });
  const token = request.nextUrl.searchParams.get("t");
  if (!verifyReviewToken(token, s.secret, new Date())) return unauthorized();
  return new NextResponse(renderReviewPage(await s.store.items(), token!, s.threshold), { headers: HEADERS });
}

export async function POST(request: NextRequest) {
  const s = setup();
  if (!s) return new NextResponse(null, { status: 404 });
  // Only this page's own forms can post here.
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== request.nextUrl.origin) return new NextResponse(null, { status: 403 });
  if (!allowAction("review")) return new NextResponse("Too many clicks. Wait a minute and try again.", { status: 429 });
  const form = await request.formData().catch(() => null);
  const parsed = formSchema.safeParse(Object.fromEntries([...(form?.entries() ?? [])].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) return verifyReviewToken(form?.get("t")?.toString(), s.secret, new Date()) ? new NextResponse("Bad form.", { status: 400 }) : unauthorized();
  const f = parsed.data;
  const t = f.t;
  if (!verifyReviewToken(t, s.secret, new Date())) return unauthorized();
  const notice =
    f.action === "idea"
      ? await writeIdea(s, f.idea, request.nextUrl.origin)
      : await applyReviewAction(s.store, f.action === "approve" ? { id: f.id, action: "approve" } : { id: f.id, action: "reject", reason: f.reason?.trim() ?? "" }, new Date());
  return new NextResponse(renderReviewPage(await s.store.items(), t, s.threshold, notice), { headers: HEADERS });
}

/** Writes the editor's idea now, with the same team, checks, approval rule and spending caps as a scheduled run. */
async function writeIdea(s: NonNullable<ReturnType<typeof setup>>, idea: string, origin: string): Promise<{ ok: boolean; message: string }> {
  const { env } = s;
  if (!env.ANTHROPIC_API_KEY) return { ok: false, message: "The writers aren't switched on (no Claude key in Vercel)." };
  const now = new Date();
  const story = ideaStory(idea, now, `${origin}/api/engine/review`);
  const onSite = await siteQuestions();
  const store = new SupabaseStore({ url: env.SUPABASE_URL!, secretKey: env.SUPABASE_SECRET_KEY!, live: onSite.map((q) => ({ slug: q.slug, question: q.question })) });
  const result = await runFromEnv({
    apiKey: env.ANTHROPIC_API_KEY,
    liveFeeds: false,
    only: [story],
    maxDrafts: 1,
    dailyDrafts: env.ENGINE_DAILY_DRAFTS,
    monthlyBudgetUsd: env.ENGINE_MONTHLY_BUDGET_USD,
    onPublished: () => revalidateTag(LIVE_QUESTIONS_TAG),
    now,
    store,
    checkThreshold: env.ENGINE_CHECK_THRESHOLD,
    autoApprove: env.ENGINE_AUTO_APPROVE === "1",
  });
  return ideaNotice(result, store);
}
