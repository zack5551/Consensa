/**
 * Drafts questions with the Claude API. Server-only: it needs ANTHROPIC_API_KEY.
 *
 * - Model: Claude Opus 5.5, the current default. Bilingual writing and rule judgment are the hard part here, and a
 *   cycle drafts only a handful of stories, so quality beats cost.
 * - Structured output: the response is constrained to `llmOutputSchema` and then re-validated against the strict
 *   `draftSchema`. The model's output is never trusted: the safety screen and validator run on it afterwards.
 * - Prompt caching on the frozen system prompt.
 * - Refusals: server-side fallback is on, and a refusal that still comes back is a skip, not an error.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { categories } from "@/lib/question";
import type { DraftContext, DraftOutcome, Drafter } from "@/engine/draft/drafter";
import { SYSTEM_PROMPT, userMessage } from "@/engine/draft/prompt";
import { comparators, draftSchema, resolverSchema, type Resolver, type Story } from "@/engine/types";

export const DRAFT_MODEL = "claude-opus-5-5";

const pair = z.object({ en: z.string(), fr: z.string() });

/**
 * What the model fills in. Kept flat and simple (no unions, nullable fields) so it fits the structured-output
 * grammar; `toDraft` turns it into the strict schema.
 */
export const llmOutputSchema = z.object({
  decision: z.enum(["draft", "skip"]),
  reason: z.string(),
  draft: z
    .object({
      slug: z.string(),
      category: z.enum(categories),
      question: pair,
      scored: z.boolean(),
      closesAt: z.string().describe("ISO 8601 UTC, e.g. 2026-12-09T14:30:00Z"),
      resolution: z.object({
        source: z.object({ name: pair, url: z.string() }),
        rule: pair,
        resolvesAt: z.string().describe("ISO 8601 UTC"),
      }),
      resolver: z.object({
        kind: z.enum(["boc-policy-rate", "statcan-vector", "eccc-daily-climate", "manual"]),
        decisionDate: z.string().nullable(),
        direction: z.enum(["cut", "hike", "hold"]).nullable(),
        vectorId: z.number().int().nullable(),
        refPeriod: z.string().nullable(),
        comparator: z.enum(comparators).nullable(),
        threshold: z.number().nullable(),
        unit: z.string().nullable(),
        climateId: z.string().nullable(),
        element: z.enum(["TOTAL_SNOW", "TOTAL_PRECIPITATION", "MAX_TEMPERATURE", "MIN_TEMPERATURE"]).nullable(),
        aggregate: z.enum(["sum", "max", "min"]).nullable(),
        from: z.string().nullable(),
        to: z.string().nullable(),
        check: z.string().nullable(),
      }),
      editorNote: z.string(),
    })
    .nullable(),
});
export type LlmOutput = z.infer<typeof llmOutputSchema>;

type LlmResolver = NonNullable<LlmOutput["draft"]>["resolver"];

function toResolver(r: LlmResolver): Resolver {
  const { kind, ...rest } = r;
  const fields = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== null));
  return resolverSchema.parse({ kind, ...fields });
}

/** Model output → strict draft, or the reason it doesn't qualify. */
export function toDraft(out: LlmOutput): { ok: true; draft: z.infer<typeof draftSchema> } | { ok: false; reason: string } {
  if (out.decision === "skip" || !out.draft) return { ok: false, reason: out.reason || "declined" };
  try {
    const draft = draftSchema.parse({ ...out.draft, resolver: toResolver(out.draft.resolver) });
    return { ok: true, draft };
  } catch (err) {
    const detail = err instanceof z.ZodError ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : String(err);
    return { ok: false, reason: `invalid draft: ${detail}` };
  }
}

export interface ClaudeDrafterOptions {
  apiKey?: string;
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  client?: Anthropic;
}

export class ClaudeDrafter implements Drafter {
  readonly id: string;
  private readonly client: Anthropic;
  private readonly effort: NonNullable<ClaudeDrafterOptions["effort"]>;

  constructor(opts: ClaudeDrafterOptions = {}) {
    this.client = opts.client ?? new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});
    this.id = opts.model ?? DRAFT_MODEL;
    this.effort = opts.effort ?? "high";
  }

  async draft(story: Story, ctx: DraftContext): Promise<DraftOutcome> {
    let response;
    try {
      response = await this.client.beta.messages.parse({
        model: this.id,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: this.effort, format: betaZodOutputFormat(llmOutputSchema) },
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } }],
        messages: [{ role: "user", content: userMessage(story, ctx.now, ctx.releases, ctx.existing) }],
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return { status: "error", reason: "rate limited", drafter: this.id };
      if (err instanceof Anthropic.AuthenticationError) return { status: "error", reason: "bad ANTHROPIC_API_KEY", drafter: this.id };
      if (err instanceof Anthropic.APIError) return { status: "error", reason: `API ${err.status}: ${err.message}`, drafter: this.id };
      return { status: "error", reason: err instanceof Error ? err.message : String(err), drafter: this.id };
    }

    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    };
    const drafter = response.model ?? this.id;
    if (response.stop_reason === "refusal") return { status: "skip", reason: "model declined (refusal)", drafter, usage };
    if (response.stop_reason === "max_tokens") return { status: "error", reason: "output cut off at max_tokens", drafter, usage };
    if (!response.parsed_output) return { status: "error", reason: "no structured output", drafter, usage };

    const result = toDraft(response.parsed_output);
    return result.ok ? { status: "draft", draft: result.draft, drafter, usage } : { status: "skip", reason: result.reason, drafter, usage };
  }
}
