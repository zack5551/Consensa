// Runs before `next build`. When CONSENSA_LIVE_QUESTIONS=1 and Supabase is set, it writes the engine's published
// questions to src/content/live-questions.json so the static site includes them. Otherwise it writes [] and the
// site shows the samples only. A failed read never fails the build: it logs and falls back to [].
import { writeFileSync } from "node:fs";

const out = new URL("../src/content/live-questions.json", import.meta.url);
const { CONSENSA_LIVE_QUESTIONS, SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;

async function pull() {
  if (CONSENSA_LIVE_QUESTIONS !== "1") return [];
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    console.warn("live questions: CONSENSA_LIVE_QUESTIONS=1 but Supabase isn't set; showing samples only.");
    return [];
  }
  const url = `${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/engine_live_questions?select=question&order=updated_at.desc&limit=500`;
  const res = await fetch(url, { headers: { apikey: SUPABASE_SECRET_KEY, authorization: `Bearer ${SUPABASE_SECRET_KEY}` } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const rows = await res.json();
  return rows.map((r) => r.question);
}

let questions = [];
try {
  questions = await pull();
  if (CONSENSA_LIVE_QUESTIONS === "1") console.log(`live questions: ${questions.length} from Supabase.`);
} catch (e) {
  console.warn(`live questions: couldn't read Supabase (${e instanceof Error ? e.message : e}); showing samples only.`);
}
writeFileSync(out, `${JSON.stringify(questions, null, 2)}\n`);
