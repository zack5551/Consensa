/**
 * The resolve step, shared by engine-drafted questions and the site's hand-written ones: for every question whose
 * result is due, read its official source once and fold the read into its record (see `policy.ts`). A question
 * resolves only after two matching reads on separate cycles, so this runs once per cycle, never in a loop.
 */
import { applyRead, newRecord } from "@/engine/resolve/policy";
import { readResolver, type Http } from "@/engine/resolve/resolvers";
import type { EngineStore } from "@/engine/store";
import type { Resolver } from "@/engine/types";

export interface DueQuestion {
  slug: string;
  resolver: Resolver;
  resolvesAt: string;
}

export interface ResolveStep {
  slug: string;
  state: string;
  outcome?: "yes" | "no";
}

export async function resolveDue(
  questions: readonly DueQuestion[],
  store: Pick<EngineStore, "getResolution" | "putResolution">,
  http: Http,
  now: Date,
): Promise<ResolveStep[]> {
  const steps: ResolveStep[] = [];
  for (const q of questions) {
    if (Date.parse(q.resolvesAt) > now.getTime()) continue;
    const record = (await store.getResolution(q.slug)) ?? newRecord(q.slug);
    if (record.state === "resolved" || record.state === "needsEditor") continue;
    const read = await readResolver(q.resolver, http, now);
    const next = applyRead(record, read, now, q.resolver.kind === "manual");
    await store.putResolution(next);
    steps.push({ slug: next.slug, state: next.state, ...(next.outcome ? { outcome: next.outcome } : {}) });
  }
  return steps;
}
