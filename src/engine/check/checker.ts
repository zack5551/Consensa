/**
 * PULSE's checker: a second Claude that reads every draft the writers queue and rates its risk from 1 to 10 in five
 * areas. It adds to the fixed checks in `safety/` and `validate.ts`, never replaces them: those block on hard rules,
 * the checker catches what a rule list can't (a misleading premise, a shaky source, clumsy French, a topic that
 * reads as partisan).
 *
 * A draft whose highest score reaches the threshold (7 by default, `ENGINE_CHECK_THRESHOLD`) gets a review flag the
 * editor must acknowledge, and goes into the alert email. The checker never approves, rejects or publishes anything.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CHECK_SYSTEM_PROMPT, checkMessage } from "@/engine/check/prompt";
import type { DraftUsage } from "@/engine/draft/drafter";
import { checkAreas, type CheckArea, type CheckResult, type Draft, type Flag, type Story } from "@/engine/types";

export const CHECK_MODEL = "claude-opus-5-5";
export const DEFAULT_THRESHOLD = 7;

export const AREA_NAMES: Record<CheckArea, string> = {
  legal: "Legal and regulatory",
  gambling: "Gambling language or feel",
  accuracy: "Accuracy and how it settles",
  sensitive: "Political or sensitive",
  french: "French quality",
};

const area = z.object({ score: z.number().int(), reason: z.string() });
export const checkOutputSchema = z.object({
  scores: z.object(Object.fromEntries(checkAreas.map((a) => [a, area])) as Record<CheckArea, typeof area>),
  summary: z.string(),
});
export type CheckOutput = z.infer<typeof checkOutputSchema>;

export type CheckOutcome = { ok: true; result: CheckResult; usage?: DraftUsage } | { ok: false; reason: string; usage?: DraftUsage };

export interface Checker {
  readonly id: string;
  check(draft: Draft, story: Story, now: Date): Promise<CheckOutcome>;
}

const clamp = (n: number) => Math.min(10, Math.max(1, Math.round(n)));

/** Model output → a result with every score clamped to 1–10 and the overall score set to the highest. */
export function toCheckResult(out: CheckOutput, checker: string, at: Date): CheckResult {
  const scores = Object.fromEntries(checkAreas.map((a) => [a, { score: clamp(out.scores[a].score), reason: out.scores[a].reason.trim() }])) as CheckResult["scores"];
  return { scores, overall: Math.max(...checkAreas.map((a) => scores[a].score)), summary: out.summary.trim(), checker, at: at.toISOString() };
}

/** The areas at or over the threshold, worst first. */
export function hotAreas(result: CheckResult, threshold: number): CheckArea[] {
  return checkAreas.filter((a) => result.scores[a].score >= threshold).sort((a, b) => result.scores[b].score - result.scores[a].score);
}

/** The review flag for a risky draft, or for one the checker couldn't read. Null when the draft is under the line. */
export function checkFlag(outcome: CheckOutcome, threshold: number): Flag | null {
  if (!outcome.ok) return { code: "check-unavailable", severity: "review", detail: `The risk checker couldn't rate this draft (${outcome.reason}). Read it with extra care.` };
  const hot = hotAreas(outcome.result, threshold);
  if (hot.length === 0) return null;
  const list = hot.map((a) => `${AREA_NAMES[a]} ${outcome.result.scores[a].score}/10: ${outcome.result.scores[a].reason}`).join(" · ");
  return { code: "check-risk", severity: "review", detail: `Risk ${outcome.result.overall}/10 (flag line ${threshold}). ${list}` };
}

/** One line for the item's why note. */
export function describeCheck(outcome: CheckOutcome, threshold: number): string {
  if (!outcome.ok) return `Checker: couldn't rate it (${outcome.reason}).`;
  const r = outcome.result;
  const worst = checkAreas.reduce((w, a) => (r.scores[a].score > r.scores[w].score ? a : w), checkAreas[0]);
  const all = checkAreas.map((a) => `${a} ${r.scores[a].score}`).join(", ");
  return `Checker: highest risk ${r.overall}/10 (${AREA_NAMES[worst].toLowerCase()})${r.overall >= threshold ? ", flagged and emailed" : ""}; ${all}.`;
}

export interface ClaudeCheckerOptions {
  apiKey?: string;
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  client?: Anthropic;
}

export class ClaudeChecker implements Checker {
  readonly id: string;
  private readonly client: Anthropic;
  private readonly effort: NonNullable<ClaudeCheckerOptions["effort"]>;

  constructor(opts: ClaudeCheckerOptions = {}) {
    this.client = opts.client ?? new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});
    this.id = opts.model ?? CHECK_MODEL;
    this.effort = opts.effort ?? "medium";
  }

  async check(draft: Draft, story: Story, now: Date): Promise<CheckOutcome> {
    let response;
    try {
      response = await this.client.beta.messages.parse({
        model: this.id,
        max_tokens: 8000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: this.effort, format: betaZodOutputFormat(checkOutputSchema) },
        system: [{ type: "text", text: CHECK_SYSTEM_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } }],
        messages: [{ role: "user", content: checkMessage(draft, story, now) }],
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return { ok: false, reason: "rate limited" };
      if (err instanceof Anthropic.AuthenticationError) return { ok: false, reason: "bad ANTHROPIC_API_KEY" };
      if (err instanceof Anthropic.APIError) return { ok: false, reason: `API ${err.status}` };
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    };
    if (response.stop_reason === "refusal") return { ok: false, reason: "the model declined to rate it", usage };
    if (response.stop_reason === "max_tokens" || !response.parsed_output) return { ok: false, reason: "no usable rating came back", usage };
    return { ok: true, result: toCheckResult(response.parsed_output, response.model ?? this.id, now), usage };
  }
}
