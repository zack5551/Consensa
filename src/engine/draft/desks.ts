/**
 * PULSE's writing team: four desks, each a Claude writer with its own beat. Every desk follows the same hard rules
 * (`prompt.ts`) and gets a short brief on top, so a culture story is written by the culture desk and a jobs story by
 * the economy desk. The team is one `Drafter`: the pipeline asks it to draft a story and it routes to the right desk.
 *
 * Each desk also has a supply target per cycle (`CycleConfig.perDesk`), so the queue keeps getting a few fresh
 * questions across topics even on a slow news day. When a desk has no hot stories left, it writes from the official
 * release calendar instead (`calendarStories`). A target never bends a rule: every draft still goes through the same
 * checks, and only an editor publishes.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Release } from "@/engine/sources/calendar";
import { ClaudeDrafter, type ClaudeDrafterOptions } from "@/engine/draft/claude";
import type { DraftContext, DraftOutcome, Drafter } from "@/engine/draft/drafter";
import type { Draft, Signal, Story } from "@/engine/types";

export interface Desk {
  id: string;
  name: string;
  categories: ReadonlyArray<Draft["category"]>;
  /** Calendar topics this desk can write from when the news runs thin. */
  calendar: ReadonlyArray<Release["topic"]>;
  brief: string;
}

const SUPPLY = `Your desk aims to send the editor at least one fair question each cycle. If this story can't carry a fair question but points to a checkable angle on the same topic (for example an official release listed in <calendar>), draft that angle instead. Decline only when no angle passes every hard rule. Never bend a rule to meet the aim, and never repeat or lightly reword a question in <existing>.`;

export const DESKS: readonly Desk[] = [
  {
    id: "economy",
    name: "Economy and housing desk",
    categories: ["economy", "housing"],
    calendar: ["boc-rate", "lfs-unemployment", "cpi"],
    brief: `# Your desk: economy and housing
You cover the Bank of Canada, jobs, prices, wages, trade, the loonie's exchange rate, housing starts, rents and home sales. Good questions name the official number, the threshold and the release date, and prefer a machine-readable resolver (boc-policy-rate or statcan-vector). Set thresholds near the current reading so the honest answer sits between 15% and 85%.
${SUPPLY}`,
  },
  {
    id: "weather",
    name: "Weather and science desk",
    categories: ["weather", "science"],
    calendar: ["climate-month"],
    brief: `# Your desk: weather and science
You cover snowfall, rain, heat and cold records at named stations, wildfire area as public data, space launches, Canadian research milestones and public science agencies (CSA, NRC, ECCC). Weather questions use eccc-daily-climate with a known station, a date window and a threshold in cm, mm or °C. Never frame a question around people harmed by weather.
${SUPPLY}`,
  },
  {
    id: "culture",
    name: "Culture and trends desk",
    categories: ["culture"],
    calendar: [],
    brief: `# Your desk: culture and trends
You cover Canadian film, music, books, TV, awards (Giller, Junos, Polaris, Canadian Screen Awards), box office and chart milestones, festivals, and what Canadians are searching for. Questions settle on a named official announcement (the award's own site, a public chart) with a manual resolver that says exactly what the editor checks. Never about a person's private life, health or relationships.
${SUPPLY}`,
  },
  {
    id: "sports",
    name: "Sports desk",
    categories: ["sports"],
    calendar: [],
    brief: `# Your desk: sports
You cover Canadian teams and athletes as scored pre-game fan forecasts: a season outcome, an award, or one game's winner with startsAt at the start time and closesAt no later than that. Settle on the league's official site. Never live or in-game, never margins, totals, exact scores, first scorers or player stat lines, never amateur, junior, university or youth sports.
${SUPPLY}`,
  },
];

/** The desk for a story, from its category hint. Stories with no clear category go to the culture and trends desk. */
export function deskFor(story: Pick<Story, "categoryHint">, desks: readonly Desk[] = DESKS): Desk {
  return desks.find((d) => story.categoryHint && d.categories.includes(story.categoryHint)) ?? desks.find((d) => d.id === "culture") ?? desks[0]!;
}

/**
 * Backfill stories built from the official release calendar, one per upcoming release, for desks whose news ran
 * thin. Heat 0, so they never crowd out a real story. Their ids are stable, so each release is written at most once.
 */
export function calendarStories(releases: readonly Release[], now: Date, desks: readonly Desk[] = DESKS): Story[] {
  return releases.flatMap((r) => {
    const desk = desks.find((d) => d.calendar.includes(r.topic));
    if (!desk) return [];
    const signal: Signal = {
      id: `calendar-${r.id}`,
      sourceId: "release-calendar",
      kind: "calendar",
      lang: "en",
      title: `${r.name.en}, ${r.at.slice(0, 10)}`,
      summary: `${r.name.fr}. Upcoming official release${r.refPeriod ? ` for ${r.refPeriod}` : ""}; source ${r.sourceUrl}`,
      url: r.sourceUrl,
      publishedAt: now.toISOString(),
      weight: 1,
    };
    return [
      {
        id: `calendar-${r.id}`,
        signals: [signal],
        headline: signal.title,
        langs: ["en", "fr"],
        firstSeenAt: signal.publishedAt,
        lastSeenAt: signal.publishedAt,
        heat: 0,
        categoryHint: desk.categories[0] ?? null,
      },
    ];
  });
}

/** The four-desk team as one drafter: each story goes to its desk's writer. */
export class DeskTeam implements Drafter {
  readonly id: string;
  private readonly writers: Map<string, Drafter>;

  constructor(
    private readonly desks: readonly Desk[] = DESKS,
    make: (desk: Desk) => Drafter,
  ) {
    this.writers = new Map(desks.map((d) => [d.id, make(d)]));
    this.id = `team:${[...this.writers.values()][0]?.id ?? "none"}`;
  }

  /** The Claude team: one Opus writer per desk, sharing one client. */
  static claude(opts: Omit<ClaudeDrafterOptions, "brief"> = {}, desks: readonly Desk[] = DESKS): DeskTeam {
    const client = opts.client ?? new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});
    return new DeskTeam(desks, (d) => new ClaudeDrafter({ ...opts, client, brief: d.brief }));
  }

  async draft(story: Story, ctx: DraftContext): Promise<DraftOutcome> {
    const desk = deskFor(story, this.desks);
    const outcome = await this.writers.get(desk.id)!.draft(story, ctx);
    return { ...outcome, desk: desk.id };
  }
}
