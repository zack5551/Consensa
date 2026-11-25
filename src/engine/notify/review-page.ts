/**
 * The editor's review page: every draft still waiting for a person, flagged ones first, with Approve and Reject
 * buttons. Internal and English only (it's for the editor, never forecasters), plain HTML with no scripts, and kept
 * out of search engines. Approving acknowledges the draft's review flags, the same as the Supabase dashboard does;
 * a draft with a blocking flag never reaches this list, and `approve` refuses one anyway.
 */
import { AREA_NAMES } from "@/engine/check/checker";
import { DESKS } from "@/engine/draft/desks";
import { approve, queueOrder, reject, ReviewError } from "@/engine/review";
import type { EngineStore } from "@/engine/store";
import { checkAreas, type QueueItem } from "@/engine/types";

export const REVIEW_EDITOR = "editor (review page)";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const deskName = (id: string | undefined) => DESKS.find((d) => d.id === id)?.name ?? "Writer";

export type ReviewAction = { id: string; action: "approve" } | { id: string; action: "reject"; reason: string };

/** Applies one action and saves it. Returns a plain message for the page. */
export async function applyReviewAction(store: Pick<EngineStore, "getItem" | "putItem">, act: ReviewAction, now: Date): Promise<{ ok: boolean; message: string }> {
  const item = await store.getItem(act.id);
  if (!item) return { ok: false, message: "That draft isn't in the queue any more." };
  try {
    const next =
      act.action === "approve"
        ? approve(item, REVIEW_EDITOR, now, item.flags.filter((f) => f.severity === "review").map((f) => f.code))
        : reject(item, REVIEW_EDITOR, now, act.reason || "Rejected on the review page");
    await store.putItem(next);
    return {
      ok: true,
      message:
        act.action === "approve"
          ? `Approved: "${item.draft.question.en}". It goes live on the next run.`
          : `Rejected: "${item.draft.question.en}".`,
    };
  } catch (e) {
    if (e instanceof ReviewError) return { ok: false, message: `Couldn't do that: ${e.message}` };
    throw e;
  }
}

/** Drafts waiting for a person: flagged (any review flag or a check at the line) first, then by priority. */
export function waiting(items: readonly QueueItem[], threshold: number): QueueItem[] {
  const pending = queueOrder(items.filter((i) => i.status === "pending"));
  const flagged = (i: QueueItem) => !i.check || i.check.overall >= threshold || i.flags.some((f) => f.code.startsWith("check-"));
  return [...pending.filter(flagged), ...pending.filter((i) => !flagged(i))];
}

function card(item: QueueItem, token: string, threshold: number): string {
  const d = item.draft;
  const scores = item.check
    ? `<ul class="scores">${checkAreas
        .map((a) => {
          const s = item.check!.scores[a];
          return `<li class="${s.score >= threshold ? "hot" : ""}"><b>${esc(AREA_NAMES[a])} ${s.score}/10</b> ${esc(s.reason)}</li>`;
        })
        .join("")}</ul>`
    : `<p class="hot">The checker couldn't rate this one. Read it with extra care.</p>`;
  const flags = item.flags.length ? `<ul class="flags">${item.flags.map((f) => `<li><b>${esc(f.code)}</b> ${esc(f.detail)}</li>`).join("")}</ul>` : "";
  const hidden = `<input type="hidden" name="t" value="${esc(token)}"><input type="hidden" name="id" value="${esc(item.id)}">`;
  return `<article>
<p class="meta">${esc(deskName(item.desk))} · ${esc(d.category)} · closes ${esc(d.closesAt.slice(0, 10))}${item.check ? ` · highest risk ${item.check.overall}/10` : ""}</p>
<h2>${esc(d.question.en)}</h2>
<p class="fr" lang="fr">${esc(d.question.fr)}</p>
<details><summary>How it settles</summary><p>${esc(d.resolution.rule.en)}</p><p lang="fr">${esc(d.resolution.rule.fr)}</p><p>Source: ${esc(d.resolution.source.name.en)} (${esc(d.resolution.source.url)})</p></details>
${scores}${flags}
<p class="note">${esc(item.why ?? d.editorNote)}</p>
<div class="actions">
<form method="post">${hidden}<input type="hidden" name="action" value="approve"><button class="yes">Approve</button></form>
<form method="post">${hidden}<input type="hidden" name="action" value="reject"><input name="reason" aria-label="Why (optional)" placeholder="Why (optional)" maxlength="300"><button class="no">Reject</button></form>
</div>
</article>`;
}

export function renderReviewPage(items: readonly QueueItem[], token: string, threshold: number, notice?: { ok: boolean; message: string }): string {
  const list = waiting(items, threshold);
  const body = list.length
    ? list.map((i) => card(i, token, threshold)).join("\n")
    : `<p class="empty">Nothing is waiting for you. Drafts that pass every check go live by themselves.</p>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer">
<title>PULSE review</title>
<style>
:root{color-scheme:light dark;--bg:#fafaf7;--card:#fff;--ink:#1a1a1a;--ink2:#555;--line:#ddd;--hot:#b42318;--yes:#0f766e;--no:#5b21b6}
@media (prefers-color-scheme:dark){:root{--bg:#121212;--card:#1d1d1d;--ink:#eee;--ink2:#aaa;--line:#333;--hot:#f97066;--yes:#2dd4bf;--no:#a78bfa}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,sans-serif}
main{max-width:720px;margin:0 auto;padding:16px}
article{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:16px 0}
h1{font-size:1.4rem;margin:8px 0}h2{font-size:1.1rem;margin:4px 0}
.meta,.note,.fr{color:var(--ink2)}.meta{font-size:.85rem;margin:0}
ul{padding-left:20px}li{margin:4px 0}.hot,.hot b{color:var(--hot)}
.actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.actions form{display:flex;gap:8px;flex-wrap:wrap}
input[name=reason]{padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);min-width:0}
button{padding:8px 16px;border-radius:8px;border:0;font-weight:600;cursor:pointer;color:#fff}
.yes{background:var(--yes)}.no{background:var(--no)}
.notice{padding:12px;border-radius:8px;border:1px solid var(--line);background:var(--card)}
</style></head><body><main>
<h1>PULSE: drafts waiting for you (${list.length})</h1>
<p class="meta">Approved drafts go live on the next daily run. Rejected ones are kept for the record and never shown.</p>
${notice ? `<p class="notice${notice.ok ? "" : " hot"}" role="status">${esc(notice.message)}</p>` : ""}
${body}
</main></body></html>`;
}
