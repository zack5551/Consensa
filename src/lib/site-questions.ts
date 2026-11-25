/**
 * Every question the site shows: the built-in list (samples plus engine questions pulled at build time) and the
 * engine questions published since the last build, read from Supabase at request time.
 *
 * That second part is what lets PULSE publish all day without a rebuild per question: pages that read this list
 * refresh within five minutes (ISR), and the cycle route refreshes the cache at once when something goes live
 * (`revalidateTag(LIVE_QUESTIONS_TAG)`). Same switch as the build: nothing extra shows unless
 * CONSENSA_LIVE_QUESTIONS=1 and Supabase is set. The read goes to Supabase in Montréal and carries no user data.
 */
import "server-only";
import { unstable_cache } from "next/cache";
import { getQuestion, liveQuestionsFrom, sampleQuestions } from "@/content/sample-questions";
import type { Question } from "@/lib/question";

export const LIVE_QUESTIONS_TAG = "live-questions";

async function readLive(): Promise<unknown[]> {
  const { CONSENSA_LIVE_QUESTIONS, SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
  if (CONSENSA_LIVE_QUESTIONS !== "1" || !SUPABASE_URL || !SUPABASE_SECRET_KEY) return [];
  const base = SUPABASE_URL.replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  const res = await fetch(`${base}/rest/v1/engine_live_questions?select=question&order=updated_at.desc&limit=500`, {
    headers: { apikey: SUPABASE_SECRET_KEY, authorization: `Bearer ${SUPABASE_SECRET_KEY}` },
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) return [];
  const rows: unknown = await res.json();
  return Array.isArray(rows) ? rows.map((r) => (r as { question?: unknown }).question) : [];
}

const cachedLive = unstable_cache(readLive, ["engine-live-questions"], { revalidate: 300, tags: [LIVE_QUESTIONS_TAG] });

/** Newest engine questions first, then the built-in list. A failed read just shows the built-in list. */
export async function siteQuestions(): Promise<readonly Question[]> {
  const rows = await cachedLive().catch(() => []);
  if (rows.length === 0) return sampleQuestions;
  const fresh = liveQuestionsFrom(rows, new Set(sampleQuestions.map((q) => q.slug)));
  return fresh.length === 0 ? sampleQuestions : [...fresh, ...sampleQuestions];
}

export async function siteQuestion(slug: string): Promise<Question | undefined> {
  return getQuestion(slug) ?? (await siteQuestions()).find((q) => q.slug === slug);
}
