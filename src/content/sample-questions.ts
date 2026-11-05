import { questionSchema, type Question } from "@/lib/question";

/**
 * Sample questions until the database lands. Numbers are illustrative.
 * History is built from keyframes (day, percent) so the charts look like real crowds, deterministically.
 */
function series(days: number, keyframes: ReadonlyArray<readonly [number, number]>): number[] {
  return Array.from({ length: days }, (_, d) => {
    const next = keyframes.findIndex(([day]) => day >= d);
    const [d1, v1] = keyframes[Math.max(0, next)] ?? keyframes[keyframes.length - 1]!;
    const [d0, v0] = keyframes[Math.max(0, next - 1)] ?? [d1, v1];
    const t = d1 === d0 ? 1 : (d - d0) / (d1 - d0);
    const wobble = Math.sin(d * 1.7) * 0.8 + Math.sin(d * 0.6) * 0.6;
    return Math.round(Math.min(99, Math.max(1, v0 + (v1 - v0) * t + (d === days - 1 ? 0 : wobble))));
  });
}

const raw = [
  {
    slug: "boc-cut-dec-2026",
    category: "economy",
    question: {
      en: "Will the Bank of Canada cut its policy rate at its December decision?",
      fr: "La Banque du Canada baissera-t-elle son taux directeur à sa décision de décembre ?",
    },
    scored: true,
    closesAt: "2026-12-09T14:45:00Z",
    forecasters: 18420,
    history: series(30, [[0, 51], [12, 53], [16, 41], [24, 40], [26, 37], [29, 38]]),
    provinces: { BC: 41, AB: 47, PR: 44, ON: 36, QC: 31, AT: 39 },
    events: [
      { dayIndex: 15, label: { en: "Jobs report", fr: "Emploi" } },
      { dayIndex: 25, label: { en: "Governor's speech", fr: "Discours du gouverneur" } },
    ],
    why: {
      body: {
        en: "The crowd's chance of a December cut fell from 53% to 38% over two weeks. The biggest drop came after Statistics Canada's jobs report showed more hiring than expected, which many forecasters read as less pressure to cut. A smaller dip followed the Governor's speech, which repeated that future moves depend on the data.",
        fr: "Selon la foule, la probabilité d’une baisse en décembre est passée de 53 % à 38 % en deux semaines. La plus forte baisse a suivi l’Enquête sur la population active de Statistique Canada, qui montrait plus d’embauches que prévu. Un recul plus léger a suivi le discours du gouverneur, qui a répété que les prochaines décisions dépendront des données.",
      },
      sources: [
        { en: "Statistics Canada · Labour Force Survey", fr: "Statistique Canada · Enquête sur la population active" },
        { en: "Bank of Canada · speech", fr: "Banque du Canada · discours" },
      ],
    },
    resolution: {
      source: { name: { en: "Bank of Canada", fr: "Banque du Canada" }, url: "https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/" },
      rule: {
        en: "Resolves YES if the Bank of Canada announces a lower target for the overnight rate on its scheduled December 2026 decision date. Any other outcome resolves NO.",
        fr: "Résolue OUI si la Banque du Canada annonce une cible plus basse pour le taux du financement à un jour à sa date de décision prévue de décembre 2026. Tout autre résultat donne NON.",
      },
      resolvesAt: "2026-12-09T15:00:00Z",
    },
  },
  {
    slug: "yyz-snow-nov-2026",
    category: "weather",
    question: {
      en: "Will Toronto Pearson get 10 cm of snow before Nov. 30?",
      fr: "L’aéroport Pearson de Toronto recevra-t-il 10 cm de neige avant le 30 novembre ?",
    },
    scored: true,
    closesAt: "2026-11-30T04:59:00Z",
    forecasters: 9310,
    history: series(30, [[0, 30], [10, 34], [20, 45], [29, 41]]),
    provinces: { BC: 33, AB: 38, PR: 36, ON: 49, QC: 42, AT: 35 },
    events: [{ dayIndex: 19, label: { en: "Storm outlook", fr: "Prévision de tempête" } }],
    resolution: {
      source: { name: { en: "Environment and Climate Change Canada", fr: "Environnement et Changement climatique Canada" }, url: "https://climate.weather.gc.ca/" },
      rule: {
        en: "Resolves YES if total snowfall recorded at Toronto Pearson (YYZ) from Nov. 1 to Nov. 30, 2026 (23:59 ET) is 10 cm or more in ECCC daily data.",
        fr: "Résolue OUI si les chutes de neige totales à Pearson (YYZ) du 1er au 30 novembre 2026 (23 h 59 HE) atteignent 10 cm ou plus selon les données quotidiennes d’ECCC.",
      },
      resolvesAt: "2026-12-01T17:00:00Z",
    },
  },
  {
    slug: "home-prices-nov-2026",
    category: "housing",
    question: {
      en: "Will Canada's average home price in November be higher than a year earlier?",
      fr: "Le prix moyen des maisons au Canada en novembre sera-t-il plus élevé qu’un an plus tôt ?",
    },
    scored: true,
    closesAt: "2026-12-14T13:00:00Z",
    forecasters: 11205,
    history: series(30, [[0, 52], [15, 55], [29, 57]]),
    provinces: { BC: 49, AB: 61, PR: 58, ON: 54, QC: 63, AT: 66 },
    events: [],
    resolution: {
      source: { name: { en: "CREA monthly statistics", fr: "Statistiques mensuelles de l’ACI" }, url: "https://stats.crea.ca/en-CA/" },
      rule: {
        en: "Resolves YES if CREA's actual (not seasonally adjusted) national average price for November 2026 is higher than for November 2025.",
        fr: "Résolue OUI si le prix moyen national réel (non désaisonnalisé) de l’ACI pour novembre 2026 dépasse celui de novembre 2025.",
      },
      resolvesAt: "2026-12-15T14:00:00Z",
    },
  },
  {
    slug: "junos-french-album-2027",
    category: "culture",
    question: {
      en: "Will a French-language album win Album of the Year at the 2027 Junos?",
      fr: "Un album francophone remportera-t-il l’album de l’année aux Juno 2027 ?",
    },
    scored: true,
    closesAt: "2027-03-28T23:00:00Z",
    forecasters: 6740,
    history: series(30, [[0, 15], [29, 18]]),
    provinces: { BC: 12, AB: 10, PR: 11, ON: 14, QC: 39, AT: 15 },
    events: [],
    resolution: {
      source: { name: { en: "The JUNO Awards", fr: "Les prix JUNO" }, url: "https://junoawards.ca/" },
      rule: {
        en: "Resolves YES if the 2027 Album of the Year winner is an album sung mainly in French, as listed by the JUNO Awards.",
        fr: "Résolue OUI si l’album de l’année 2027 est un album chanté principalement en français, selon les prix JUNO.",
      },
      resolvesAt: "2027-03-29T03:00:00Z",
    },
  },
  {
    slug: "leafs-playoffs-2027",
    category: "sports",
    question: {
      en: "Do you think the Maple Leafs make the 2027 playoffs?",
      fr: "Pensez-vous que les Maple Leafs feront les séries de 2027 ?",
    },
    scored: false,
    closesAt: "2027-04-15T23:00:00Z",
    forecasters: 22980,
    history: series(30, [[0, 70], [14, 61], [29, 64]]),
    provinces: { BC: 52, AB: 49, PR: 55, ON: 78, QC: 47, AT: 66 },
    events: [],
    resolution: {
      source: { name: { en: "Just-for-fun poll (not scored)", fr: "Sondage pour le plaisir (non évalué)" }, url: "https://www.nhl.com/standings" },
      rule: {
        en: "This is a poll, not a scored forecast. It shows what Canadians think and doesn't count toward anyone's record.",
        fr: "Ceci est un sondage, pas une prévision évaluée. Il montre ce que pensent les Canadiens et ne compte pas dans le dossier de qui que ce soit.",
      },
      resolvesAt: "2027-04-20T04:00:00Z",
    },
  },
] satisfies ReadonlyArray<unknown>;

/** Validated at import so a bad sample fails the build, not the page. */
export const sampleQuestions: readonly Question[] = raw.map((q) => questionSchema.parse(q));

export function getQuestion(slug: string): Question | undefined {
  return sampleQuestions.find((q) => q.slug === slug);
}
