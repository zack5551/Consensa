// Runs before `next build`. When CONSENSA_LIVE_QUESTIONS=1 and Supabase is set, it writes the engine's published
// questions to src/content/live-questions.json so the static site includes them. Otherwise it writes [] and the
// site shows the samples only. It also writes the engine's confirmed automatic results to
// src/content/live-results.json whenever Supabase is set (they come from official data, so they need no flag).
// A failed read never fails the build: it logs and falls back to [].
import { writeFileSync } from "node:fs";

const out = new URL("../src/content/live-questions.json", import.meta.url);
const resultsOut = new URL("../src/content/live-results.json", import.meta.url);
const { CONSENSA_LIVE_QUESTIONS, SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;

async function pull() {
  if (CONSENSA_LIVE_QUESTIONS !== "1") return [];
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    console.warn("live questions: CONSENSA_LIVE_QUESTIONS=1 but Supabase isn't set; showing samples only.");
    return [];
  }
  const rows = await rest("engine_live_questions?select=question&order=updated_at.desc&limit=500");
  return rows.map((r) => r.question);
}

async function rest(path) {
  const url = `${SUPABASE_URL.replace(/\/+$/, "").replace(/\/rest\/v1$/, "")}/rest/v1/${path}`;
  const res = await fetch(url, { headers: { apikey: SUPABASE_SECRET_KEY, authorization: `Bearer ${SUPABASE_SECRET_KEY}` } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

/** Confirmed results: { slug, outcome, publishedAt, disputed }. src/content/sample-questions.ts validates them again. */
async function pullResults() {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) return [];
  const rows = await rest("engine_resolutions?select=record&state=eq.resolved&order=slug.asc&limit=1000");
  return rows
    .map((r) => r.record)
    .filter((r) => r && r.outcome && r.resolvedAt)
    .map((r) => ({ slug: r.slug, outcome: r.outcome, publishedAt: r.resolvedAt, disputed: r.disputed ?? false }));
}

let questions = [];
try {
  questions = await pull();
  if (CONSENSA_LIVE_QUESTIONS === "1") console.log(`live questions: ${questions.length} from Supabase.`);
} catch (e) {
  console.warn(`live questions: couldn't read Supabase (${e instanceof Error ? e.message : e}); showing samples only.`);
}
writeFileSync(out, `${JSON.stringify(questions, null, 2)}\n`);

let results = [];
try {
  results = await pullResults();
  if (SUPABASE_URL && SUPABASE_SECRET_KEY) console.log(`automatic results: ${results.length} from Supabase.`);
} catch (e) {
  console.warn(`automatic results: couldn't read Supabase (${e instanceof Error ? e.message : e}); using the written results only.`);
}
writeFileSync(resultsOut, `${JSON.stringify(results, null, 2)}\n`);
