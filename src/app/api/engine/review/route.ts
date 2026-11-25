/**
 * /api/engine/review: the editor's review page, linked from the PULSE run summary email. Internal and English only.
 *
 * - GET ?t=<token>: lists the drafts still waiting for a person. Shows only; changes nothing.
 * - POST (form): approve or reject one draft. Needs the same token in the form.
 *
 * The token is signed with CRON_SECRET and lasts a week (`notify/review-link.ts`). Off (404) until CRON_SECRET and
 * Supabase are set; a missing or wrong token gets 401 with no detail.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { engineEnv } from "@/engine/config";
import { verifyReviewToken } from "@/engine/notify/review-link";
import { applyReviewAction, renderReviewPage } from "@/engine/notify/review-page";
import { SupabaseStore } from "@/engine/supabase-store";
import { rateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

const formSchema = z.object({
  t: z.string().max(200),
  id: z.string().min(1).max(200),
  action: z.enum(["approve", "reject"]),
  reason: z.string().max(300).optional(),
});

function setup() {
  const env = engineEnv();
  if (!env.CRON_SECRET || !env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) return null;
  return {
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
  const { t, id, action, reason } = parsed.data;
  if (!verifyReviewToken(t, s.secret, new Date())) return unauthorized();
  const notice = await applyReviewAction(s.store, action === "approve" ? { id, action } : { id, action, reason: reason?.trim() ?? "" }, new Date());
  return new NextResponse(renderReviewPage(await s.store.items(), t, s.threshold, notice), { headers: HEADERS });
}
