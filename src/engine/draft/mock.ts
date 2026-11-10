/**
 * A deterministic drafter for tests, local runs and previews until ANTHROPIC_API_KEY exists. It recognises a few
 * story shapes (Bank of Canada, jobs, snow) and fills a hand-written bilingual template tied to the
 * official calendar. Anything else is declined, the way the real drafter declines most stories.
 */
import { KNOWN_STATIONS, KNOWN_VECTORS, type Release } from "@/engine/sources/calendar";
import type { DraftContext, DraftOutcome, Drafter } from "@/engine/draft/drafter";
import { storyTokens } from "@/engine/stories";
import { draftSchema, type Draft, type Story } from "@/engine/types";

const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const SHORT_EN = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];

function minus(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) - minutes * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function next(ctx: DraftContext, topic: Release["topic"]): Release | undefined {
  return ctx.releases.find((r) => r.topic === topic && Date.parse(r.at) > ctx.now.getTime() + 2 * 86_400_000);
}

function boc(r: Release): Draft {
  const date = r.at.slice(0, 10);
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return {
    slug: `boc-cut-${MONTHS_EN[m - 1]!.slice(0, 3).toLowerCase()}-${y}`,
    category: "economy",
    question: {
      en: `Will the Bank of Canada cut its policy rate on ${SHORT_EN[m - 1]} ${d}, ${y}?`,
      fr: `La Banque du Canada baissera-t-elle son taux directeur le ${d} ${MONTHS_FR[m - 1]} ${y}?`,
    },
    scored: true,
    closesAt: minus(r.at, 15),
    resolution: {
      source: { name: { en: "Bank of Canada", fr: "Banque du Canada" }, url: r.sourceUrl },
      rule: {
        en: `Resolves YES if the Bank of Canada announces a lower target for the overnight rate on ${MONTHS_EN[m - 1]} ${d}, ${y}. Otherwise it resolves NO.`,
        fr: `Résolue OUI si la Banque du Canada annonce une cible plus basse pour le taux du financement à un jour le ${d} ${MONTHS_FR[m - 1]} ${y}. Sinon, elle est résolue NON.`,
      },
      resolvesAt: minus(r.at, -15),
    },
    resolver: { kind: "boc-policy-rate", decisionDate: date, direction: "cut" },
    editorNote: "Rate talk is in the news; the next scheduled decision settles it.",
  };
}

function jobs(r: Release, threshold: number): Draft {
  const [y, m] = r.refPeriod!.split("-").map(Number) as [number, number];
  const frThreshold = String(threshold).replace(".", ",");
  return {
    slug: `unemployment-${String(threshold).replace(".", "-")}pct-${MONTHS_EN[m - 1]!.slice(0, 3).toLowerCase()}-${y}`,
    category: "economy",
    question: {
      en: `Will Canada's unemployment rate be ${threshold}% or higher in ${MONTHS_EN[m - 1]} ${y}?`,
      fr: `Le taux de chômage au Canada atteindra-t-il ${frThreshold} % ou plus en ${MONTHS_FR[m - 1]} ${y}?`,
    },
    scored: true,
    closesAt: minus(r.at, 30),
    resolution: {
      source: { name: { en: "Statistics Canada · Labour Force Survey", fr: "Statistique Canada · Enquête sur la population active" }, url: r.sourceUrl },
      rule: {
        en: `Resolves YES if Statistics Canada's first published seasonally adjusted unemployment rate for Canada for ${MONTHS_EN[m - 1]} ${y} is ${threshold}% or higher. Otherwise it resolves NO.`,
        fr: `Résolue OUI si le premier taux de chômage désaisonnalisé publié par Statistique Canada pour le Canada pour ${MONTHS_FR[m - 1]} ${y} est de ${frThreshold} % ou plus. Sinon, elle est résolue NON.`,
      },
      resolvesAt: minus(r.at, -15),
    },
    resolver: { kind: "statcan-vector", vectorId: KNOWN_VECTORS.unemploymentRate, refPeriod: r.refPeriod!, comparator: ">=", threshold, unit: "%" },
    editorNote: "Jobs numbers are in the news; the next Labour Force Survey settles it.",
  };
}

function snow(r: Release): Draft {
  const [y, m] = r.refPeriod!.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const station = KNOWN_STATIONS.torontoPearson;
  const mm = String(m).padStart(2, "0");
  return {
    slug: `yyz-snow-25cm-${MONTHS_EN[m - 1]!.slice(0, 3).toLowerCase()}-${y}`,
    category: "weather",
    question: {
      en: `Will Toronto Pearson get 25 cm of snow or more in ${MONTHS_EN[m - 1]} ${y}?`,
      fr: `L’aéroport Pearson de Toronto recevra-t-il 25 cm de neige ou plus en ${MONTHS_FR[m - 1]} ${y}?`,
    },
    scored: true,
    closesAt: `${y}-${mm}-01T05:00:00Z`,
    resolution: {
      source: { name: { en: "Environment and Climate Change Canada", fr: "Environnement et Changement climatique Canada" }, url: r.sourceUrl },
      rule: {
        en: `Resolves YES if total snowfall at ${station.name.en} from ${MONTHS_EN[m - 1]} 1 to ${last}, ${y} is 25 cm or more in ECCC daily climate data. Otherwise it resolves NO.`,
        fr: `Résolue OUI si les chutes de neige totales à ${station.name.fr} du 1er au ${last} ${MONTHS_FR[m - 1]} ${y} atteignent 25 cm ou plus selon les données climatiques quotidiennes d’ECCC. Sinon, elle est résolue NON.`,
      },
      resolvesAt: r.at,
    },
    resolver: {
      kind: "eccc-daily-climate",
      climateId: station.climateId,
      element: "TOTAL_SNOW",
      aggregate: "sum",
      from: `${y}-${mm}-01`,
      to: `${y}-${mm}-${String(last).padStart(2, "0")}`,
      comparator: ">=",
      threshold: 25,
    },
    editorNote: "Snow is in the forecast; ECCC daily data settles the month.",
  };
}

export class MockDrafter implements Drafter {
  readonly id = "mock";

  async draft(story: Story, ctx: DraftContext): Promise<DraftOutcome> {
    const words = storyTokens(story.signals.map((s) => s.title).join(" "));
    const has = (...w: string[]) => w.some((x) => words.has(x));
    let draft: Draft | undefined;

    if (has("bank") && has("rate", "cut", "hike", "policy")) {
      const r = next(ctx, "boc-rate");
      if (r) draft = boc(r);
    } else if (has("unemployment", "job", "labour")) {
      const r = next(ctx, "lfs-unemployment");
      if (r) draft = jobs(r, 7);
    } else if (has("snow", "storm")) {
      const r = next(ctx, "climate-month");
      if (r) draft = snow(r);
    }

    if (!draft) return { status: "skip", reason: "no template fits this story", drafter: this.id };
    return { status: "draft", draft: draftSchema.parse(draft), drafter: this.id };
  }
}
