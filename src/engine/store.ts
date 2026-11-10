/**
 * Where the engine keeps its state. `MemoryStore` serves tests and previews; `SupabaseStore` (ca-central-1, RLS on every
 * table) implements the same interface in production. Tables: supabase/migrations/20261110000000_engine.sql.
 *
 * Append-only by design: there is no delete method. Rejected drafts and old reads stay for the audit trail.
 */
import type { Comparable } from "@/engine/dedup";
import type { QueueItem, ResolutionRecord, Signal } from "@/engine/types";
import type { Question } from "@/lib/question";

export interface EngineStore {
  /** Saves signals not seen before; returns how many were new. */
  addSignals(signals: readonly Signal[]): Promise<number>;
  /** Signals published at or after `since`. */
  recentSignals(since: Date): Promise<Signal[]>;
  /** Story ids already drafted (or declined) recently, so a cycle doesn't pay to draft them twice. */
  wasDrafted(storyId: string): Promise<boolean>;
  markDrafted(storyId: string, outcome: string, at: Date): Promise<void>;

  putItem(item: QueueItem): Promise<void>;
  getItem(id: string): Promise<QueueItem | undefined>;
  items(): Promise<QueueItem[]>;

  /** Every question dedup must compare against: live questions plus queued and recently rejected drafts. */
  comparables(): Promise<Comparable[]>;

  putResolution(record: ResolutionRecord): Promise<void>;
  getResolution(slug: string): Promise<ResolutionRecord | undefined>;

  /** A published question in the site's shape, for the build to read. Overwrites the same slug. */
  putLiveQuestion(question: Question): Promise<void>;
}

export class MemoryStore implements EngineStore {
  private signals = new Map<string, Signal>();
  private drafted = new Map<string, { outcome: string; at: string }>();
  private queue = new Map<string, QueueItem>();
  private resolutions = new Map<string, ResolutionRecord>();
  readonly liveQuestions = new Map<string, Question>();

  /** `live` are questions already on the site (e.g. the sample slate). */
  constructor(private readonly live: readonly Comparable[] = []) {}

  async addSignals(signals: readonly Signal[]): Promise<number> {
    let added = 0;
    for (const s of signals) {
      if (this.signals.has(s.id)) continue;
      this.signals.set(s.id, s);
      added++;
    }
    return added;
  }

  async recentSignals(since: Date): Promise<Signal[]> {
    return [...this.signals.values()].filter((s) => Date.parse(s.publishedAt) >= since.getTime());
  }

  async wasDrafted(storyId: string): Promise<boolean> {
    return this.drafted.has(storyId);
  }

  async markDrafted(storyId: string, outcome: string, at: Date): Promise<void> {
    this.drafted.set(storyId, { outcome, at: at.toISOString() });
  }

  async putItem(item: QueueItem): Promise<void> {
    this.queue.set(item.id, item);
  }

  async getItem(id: string): Promise<QueueItem | undefined> {
    return this.queue.get(id);
  }

  async items(): Promise<QueueItem[]> {
    return [...this.queue.values()];
  }

  async comparables(): Promise<Comparable[]> {
    const drafts = [...this.queue.values()]
      .filter((i) => i.status !== "autoRejected")
      .map((i) => ({ slug: i.draft.slug, question: i.draft.question, resolver: i.draft.resolver }));
    return [...this.live, ...drafts];
  }

  async putResolution(record: ResolutionRecord): Promise<void> {
    this.resolutions.set(record.slug, record);
  }

  async getResolution(slug: string): Promise<ResolutionRecord | undefined> {
    return this.resolutions.get(slug);
  }

  async putLiveQuestion(question: Question): Promise<void> {
    this.liveQuestions.set(question.slug, question);
  }
}
