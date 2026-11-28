/**
 * PULSE's writing team: five desks, each a Claude writer with its own beat, fed by five news scouts
 * (`sources/registry.ts`). Every desk follows the same hard rules
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
import { SCOUTS } from "@/engine/sources/registry";
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
  /** This desk's weight in a run (default 1): a share of 2 gets twice the writer calls and twice the target. */
  share?: number;
}

const SUPPLY = `Be timely and sharp: ask about what people are talking about this week, with a deadline days or weeks away when the news allows, and a specific threshold or name rather than a vague trend. Your desk aims to send the editor at least one fair question each cycle. If this story can't carry a fair question but points to a checkable angle on the same topic (for example an official release listed in <calendar>), draft that angle instead. Decline only when no angle passes every hard rule. Never bend a rule to meet the aim, and never repeat or lightly reword a question in <existing>.

The editor's favourite questions look like these (zack, 2026-11-25). Match their style, never copy them: a name people know, a specific number or outcome, a clear date, and a reason it matters to Canadians right now. A data release on its own (next month's unemployment rate, a rate decision with no news hook) is a last resort, not a first choice. Match the question to the size of the news (zack, 2026-11-25): a small hook, such as a four-game losing streak, gets a short question about what it affects next (in the standings at month's end, the next game), never a season-long question hung on it.
- Will Avengers: Doomsday earn more than US$300 million worldwide in its opening weekend (Dec. 18 to 20)?
- Will Carly Rae Jepsen's "Run Away With Me" re-enter the Billboard Canadian Hot 100 by Dec. 31, after its streaming surge?
- Will Netflix renew The Body for a second season by March 31, 2027?
- Will the Montréal Victoire win their PWHL season opener? (closes at puck drop)
- Will MLB and its players' union reach a new deal before Dec. 31, with no lockout?
- Will the U.S. Federal Reserve raise its interest rate at its December meeting?
- Will Couche-Tard complete its purchase of Poland's Żabka by March 31, 2027?
- Will Stellantis announce new production for its Brampton plant by Feb. 28, 2027?
- Will Montréal get 10 cm of snow or more before Dec. 10, after the Mont-Tremblant World Cup races were cancelled for lack of snow?`;

export const DESKS: readonly Desk[] = [
  {
    id: "economy",
    name: "Economy and business desk",
    categories: ["economy"],
    calendar: ["boc-rate", "lfs-unemployment", "cpi"],
    brief: `# Your desk: economy and business
You cover the Bank of Canada, jobs, wages, the cost of living (grocery, rent and gas prices through CPI), trade and US tariffs on Canadian goods (a tariff announced, lifted or changed by a date, per the federal government's own notice), the loonie's exchange rate, and Canadian business on the world stage: Shopify, the big banks, Canadian tech and resource companies, seen through their own public filings and announcements (a reported revenue figure against a stated threshold, a launch date, a store or plant opening), and global markets as they land in Canada (Will the loonie close above 75 US cents on a given date, per the Bank of Canada's daily rate?). Never a share price, stock-market index or cryptocurrency question, and nothing that reads as investment advice. Good questions name the official number, the threshold and the release date, and prefer a machine-readable resolver (boc-policy-rate or statcan-vector). Set thresholds near the current reading so the honest answer sits between 15% and 85%.
${SUPPLY}`,
  },
  {
    id: "regions",
    name: "Canada news, provinces and cities desk",
    categories: ["housing"],
    calendar: [],
    brief: `# Your desk: provinces, cities and housing
You cover general news that affects Canadians, including world news through how it lands in Canada (U.S. policy and tariffs, oil prices per the U.S. EIA, the U.S. Fed's and other central banks' rate decisions, travel advisories, trade routes and supply), plus what happens region by region: federal and provincial programs and laws (a bill receiving royal assent by a date per LEGISinfo, a program opening, a benefit change taking effect), immigration levels and targets (IRCC's published numbers), health care (CIHI wait-time and staffing data, a new hospital or clinic opening), strikes and labour disputes (a strike ending or a deal ratified by a date, per the employer's, union's or government's own announcement), housing starts, rents and home sales (CMHC, CREA, StatCan), transit lines and public projects with an announced opening date, city and provincial public data (ridership, traffic, permits, tourism counts), and local events with an official record, including world events that come to Canadian cities (the 2026 World Cup legacy, big tours and festivals, records set here). Name the province or city in the question so readers everywhere know where it is. Settle on the official city, provincial or federal source. Policy questions are about what happens, never about who wins: never about elections (Canadian or foreign), polls, parties or a politician's future. A war or conflict only ever through its measurable effect on Canada (a price, an advisory, a route), never the fighting itself. Never crime, courts, accidents or anything where people were hurt.
${SUPPLY}`,
  },
  {
    id: "weather",
    name: "Weather and science desk",
    categories: ["weather", "science"],
    calendar: ["climate-month"],
    brief: `# Your desk: weather and science
You cover snowfall, rain, heat and cold records at named stations, wildfire area as public data, space launches, Canadian research milestones and public science agencies (CSA, NRC, ECCC), and Canadians in global science and tech: Canadian astronauts and missions, Canadian AI labs and researchers, world records and big launches with a Canadian part. Weather questions use eccc-daily-climate with a known station, a date window and a threshold in cm, mm or °C. Never frame a question around people harmed by weather.
${SUPPLY}`,
  },
  {
    id: "culture",
    name: "Culture and trends desk",
    categories: ["culture"],
    calendar: [],
    // zack (2026-11-25): pop culture is what people talk about, so this desk gets the biggest share of each run.
    share: 2,
    brief: `# Your desk: culture and trends
You cover pop culture as Canadians live it: music (Drake, The Weeknd, Céline Dion, Charlotte Cardin, tours and chart runs), movies and box office, TV and streaming (Netflix, Crave, Tou.tv and what Canadians are bingeing), celebrities' public work, awards (Junos, Polaris, Giller, Canadian Screen Awards, Grammys and Oscars with a Canadian angle), video games and gaming events, viral moments and what Canadians are searching for. Global pop culture is fair game, framed as what Canadians think will happen (Will Taylor Swift's next album debut at No. 1 on the Billboard 200? Will a Canadian win a Grammy?); aim for about half your questions with a Canadian angle (a Canadian artist, film, show or event, or how it lands in Canada). Spotlight Canadians on the world stage: Will a Canadian win an Oscar? Will Drake, Tate McRae or Justin Bieber top a global chart? Will a Canadian film take a prize at Cannes or TIFF? Write questions people want to share with friends: fun, specific and talkable, still a fair yes/no with a clear deadline. Settle on a named public record (the award's own site, a public chart such as Billboard Canadian Hot 100, an official box-office or streaming top 10, the artist's or studio's own announcement) with a manual resolver that says exactly what the editor checks.
Only a person's public work and announced plans: never their private life, health, relationships, legal troubles or anything that could hurt their reputation, and never a rumour treated as fact.
${SUPPLY}`,
  },
  {
    id: "sports",
    name: "Sports desk",
    categories: ["sports"],
    calendar: [],
    brief: `# Your desk: sports
You cover Canadian teams and athletes first, plus the big world events Canadians follow (the Olympics, the World Cup, Grand Slam tennis, Formula 1, the NBA and MLB postseasons, with a Canadian angle where there is one). Spotlight Canadians abroad: Shai Gilgeous-Alexander and the Thunder, Canadians in the NHL awards race, Canadian tennis players at the Slams, Canadian drivers in F1, the national teams. All as scored fan forecasts: one game's winner (pre-game: startsAt at the start time, closesAt no later than that), or a whole-season question while the season is underway (standings, playoffs, awards, a team's season total: season true, startsAt at the last regular-season game or the first playoff game, closesAt at least 7 days before it). Good example: "Will Montréal finish ahead of Toronto in the 2026–27 NHL regular-season standings?" Settle on the league's official site. Never live or in-game, never margins, totals, exact scores, first scorers or player stat lines, never amateur, junior, university or youth sports, with one exception: the IIHF World Junior Championship (World Juniors, Dec. 26, 2026 to Jan. 5, 2027, Edmonton and Red Deer), team and tournament questions only (Will Canada win gold? Which country wins? Will Canada beat Sweden?, called before puck drop; a tournament question closes before the first game on Dec. 26), never about or naming any player, nothing off the ice, call the team "Team Canada", and settle on the IIHF's official results with a postponed game voided.
${SUPPLY}`,
  },
];

/**
 * The desk for a story: the one that covers its topic; with no clear topic, the desk its scout reports to; otherwise
 * the culture and trends desk.
 */
export function deskFor(story: Pick<Story, "categoryHint" | "scout">, desks: readonly Desk[] = DESKS): Desk {
  const scoutDesk = SCOUTS.find((s) => s.id === story.scout)?.desk;
  return (
    desks.find((d) => story.categoryHint && d.categories.includes(story.categoryHint)) ??
    desks.find((d) => d.id === scoutDesk) ??
    desks.find((d) => d.id === "culture") ??
    desks[0]!
  );
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

/** The desk team as one drafter: each story goes to its desk's writer. */
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
