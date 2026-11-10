/**
 * The engine's store in Supabase (ca-central-1), over its REST API with the server-only secret key. Tables and the
 * dashboard review flow are in `supabase/migrations/20261110000000_engine.sql`.
 *
 * Editors review in the Supabase dashboard by changing a queue row's `status`. On the next read the store turns
 * that change into the same review step the code uses (`approve`, `reject`, `requestChanges`), so the item's own
 * history records it and every rule still applies: a blocked draft can't be approved, and a move the review flow
 * doesn't allow is undone. Approving in the dashboard acknowledges the review flags shown beside the draft.
 *
 * Framework-free: it takes `fetch` so tests can run it without a network.
 */
import type { Comparable } from "@/engine/dedup";
import { approve, reject, requestChanges, ReviewError } from "@/engine/review";
import type { EngineStore } from "@/engine/store";
import type { QueueItem, ResolutionRecord, ReviewStatus, Signal } from "@/engine/types";
import type { Question } from "@/lib/question";

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface SupabaseConfig {
  url: string;
  secretKey: string;
  fetch?: FetchFn;
  /** Questions already on the site, for dedup. */
  live?: readonly Comparable[];
  /** The editor named in the item history for a dashboard change. */
  editor?: string;
  now?: () => Date;
}

interface QueueRow {
  id: string;
  status: ReviewStatus;
  item: QueueItem;
}

const DASHBOARD_NOTE = "Changed in the Supabase dashboard";

/** Applies a status an editor set in the dashboard. Returns the item unchanged if the move isn't allowed. */
export function applyDashboardStatus(item: QueueItem, to: ReviewStatus, editor: string, at: Date): QueueItem {
  if (to === item.status) return item;
  try {
    if (to === "approved") return approve(item, editor, at, item.flags.filter((f) => f.severity === "review").map((f) => f.code));
    if (to === "rejected") return reject(item, editor, at, DASHBOARD_NOTE);
    if (to === "needsChanges") return requestChanges(item, editor, at, DASHBOARD_NOTE);
  } catch (e) {
    if (!(e instanceof ReviewError)) throw e;
  }
  return item;
}

export class SupabaseStore implements EngineStore {
  private readonly base: string;
  private readonly fetchFn: FetchFn;
  private readonly editor: string;
  private readonly now: () => Date;

  constructor(private readonly cfg: SupabaseConfig) {
    this.base = `${cfg.url.replace(/\/+$/, "")}/rest/v1`;
    this.fetchFn = cfg.fetch ?? fetch;
    this.editor = cfg.editor ?? "editor";
    this.now = cfg.now ?? (() => new Date());
  }

  private async req<T>(path: string, init: RequestInit & { prefer?: string } = {}): Promise<T> {
    const headers: Record<string, string> = {
      apikey: this.cfg.secretKey,
      authorization: `Bearer ${this.cfg.secretKey}`,
      "content-type": "application/json",
    };
    if (init.prefer) headers.prefer = init.prefer;
    const res = await this.fetchFn(`${this.base}/${path}`, { ...init, headers, cache: "no-store" });
    if (!res.ok) throw new Error(`Supabase ${init.method ?? "GET"} ${path.split("?")[0]} failed: ${res.status} ${await res.text()}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  private upsert(table: string, rows: readonly object[], onConflict: "merge" | "ignore" = "merge", returnRows = false) {
    return this.req<unknown[] | null>(table, {
      method: "POST",
      body: JSON.stringify(rows),
      prefer: `resolution=${onConflict === "merge" ? "merge" : "ignore"}-duplicates,return=${returnRows ? "representation" : "minimal"}`,
    });
  }

  async addSignals(signals: readonly Signal[]): Promise<number> {
    if (signals.length === 0) return 0;
    const rows = signals.map((s) => ({ id: s.id, published_at: s.publishedAt, signal: s }));
    const inserted = await this.upsert("engine_signals", rows, "ignore", true);
    return inserted?.length ?? 0;
  }

  async recentSignals(since: Date): Promise<Signal[]> {
    const rows = await this.req<Array<{ signal: Signal }>>(
      `engine_signals?select=signal&published_at=gte.${encodeURIComponent(since.toISOString())}&order=published_at.desc&limit=2000`,
    );
    return rows.map((r) => r.signal);
  }

  async wasDrafted(storyId: string): Promise<boolean> {
    const rows = await this.req<unknown[]>(`engine_story_runs?select=story_id&story_id=eq.${encodeURIComponent(storyId)}`);
    return rows.length > 0;
  }

  async markDrafted(storyId: string, outcome: string, at: Date): Promise<void> {
    await this.upsert("engine_story_runs", [{ story_id: storyId, outcome, decided_at: at.toISOString() }]);
  }

  async putItem(item: QueueItem): Promise<void> {
    await this.upsert("engine_queue", [
      {
        id: item.id,
        slug: item.draft.slug,
        question_en: item.draft.question.en,
        question_fr: item.draft.question.fr,
        status: item.status,
        priority: item.priority,
        flags: item.flags,
        editor_note: item.draft.editorNote,
        item,
        created_at: item.createdAt,
      },
    ]);
  }

  /** Reads rows and folds in any status an editor changed in the dashboard, saving the result. */
  private async reconcile(rows: readonly QueueRow[]): Promise<QueueItem[]> {
    const out: QueueItem[] = [];
    for (const row of rows) {
      let item = row.item;
      if (row.status !== item.status) {
        item = applyDashboardStatus(item, row.status, this.editor, this.now());
        await this.putItem(item);
      }
      out.push(item);
    }
    return out;
  }

  async getItem(id: string): Promise<QueueItem | undefined> {
    const rows = await this.req<QueueRow[]>(`engine_queue?select=id,status,item&id=eq.${encodeURIComponent(id)}`);
    return (await this.reconcile(rows))[0];
  }

  async items(): Promise<QueueItem[]> {
    return this.reconcile(await this.req<QueueRow[]>("engine_queue?select=id,status,item&order=created_at.asc&limit=5000"));
  }

  async comparables(): Promise<Comparable[]> {
    const rows = await this.req<QueueRow[]>("engine_queue?select=id,status,item&status=neq.autoRejected&limit=5000");
    const drafts = rows.map((r) => ({ slug: r.item.draft.slug, question: r.item.draft.question, resolver: r.item.draft.resolver }));
    return [...(this.cfg.live ?? []), ...drafts];
  }

  async putResolution(record: ResolutionRecord): Promise<void> {
    await this.upsert("engine_resolutions", [{ slug: record.slug, state: record.state, outcome: record.outcome ?? null, record, updated_at: this.now().toISOString() }]);
  }

  async getResolution(slug: string): Promise<ResolutionRecord | undefined> {
    const rows = await this.req<Array<{ record: ResolutionRecord }>>(`engine_resolutions?select=record&slug=eq.${encodeURIComponent(slug)}`);
    return rows[0]?.record;
  }

  async putLiveQuestion(question: Question): Promise<void> {
    await this.upsert("engine_live_questions", [{ slug: question.slug, question, updated_at: this.now().toISOString() }]);
  }
}
