import { isOpen, questionSchema, questionState, type Question } from "@/lib/question";
import { moreSampleQuestions } from "./more-questions";
import { series } from "./series";

/**
 * The preview's fixed "now", so sample states (closing soon, closed, resolved) render the same on every build.
 * Live data replaces this with the real clock in M3.
 */
export const SAMPLE_NOW = new Date("2026-11-06T12:00:00Z");

const raw = [
  {
    slug: "boc-cut-dec-2026",
    category: "economy",
    question: {
      en: "Will the Bank of Canada cut its policy rate at its December decision?",
      fr: "La Banque du Canada baissera-t-elle son taux directeur à sa décision de décembre?",
    },
    scored: true,
    closesAt: "2026-12-09T14:45:00Z",
    forecasters: 18420,
    history: series(30, [[0, 51], [12, 53], [16, 41], [24, 40], [26, 37], [29, 38]]),
    provinces: { BC: 41, AB: 47, PR: 44, ON: 36, QC: 31, AT: 39 },
    languages: { en: 40, fr: 33 },
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
    slug: "giller-debut-2026",
    category: "culture",
    question: {
      en: "Will a debut book win the 2026 Giller Prize?",
      fr: "Un premier livre remportera-t-il le prix Giller 2026?",
    },
    scored: true,
    closesAt: "2026-11-08T04:59:00Z",
    forecasters: 4120,
    history: series(30, [[0, 22], [9, 24], [21, 33], [29, 31]]),
    provinces: { BC: 30, AB: 27, PR: 29, ON: 34, QC: 28, AT: 33 },
    languages: { en: 31, fr: 30 },
    events: [{ dayIndex: 21, label: { en: "Shortlist", fr: "Liste finale" } }],
    resolution: {
      source: { name: { en: "Scotiabank Giller Prize", fr: "Prix Giller Banque Scotia" }, url: "https://scotiabankgillerprize.ca/" },
      rule: {
        en: "Resolves YES if the 2026 winner is the author's first published book of fiction, as described by the prize.",
        fr: "Résolue OUI si l’œuvre gagnante de 2026 est le premier livre de fiction publié de son auteur ou autrice, selon le prix.",
      },
      resolvesAt: "2026-11-17T03:00:00Z",
    },
  },
  {
    slug: "yyz-snow-nov-2026",
    category: "weather",
    question: {
      en: "Will Toronto Pearson get 10 cm of snow before Nov. 30?",
      fr: "L’aéroport Pearson de Toronto recevra-t-il 10 cm de neige avant le 30 novembre?",
    },
    scored: true,
    closesAt: "2026-11-30T04:59:00Z",
    forecasters: 9310,
    history: series(30, [[0, 30], [10, 34], [20, 45], [29, 41]]),
    provinces: { BC: 33, AB: 38, PR: 36, ON: 49, QC: 42, AT: 35 },
    languages: { en: 42, fr: 39 },
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
      fr: "Le prix moyen des maisons au Canada en novembre sera-t-il plus élevé qu’un an plus tôt?",
    },
    scored: true,
    closesAt: "2026-12-14T13:00:00Z",
    forecasters: 11205,
    history: series(30, [[0, 52], [15, 55], [29, 57]]),
    provinces: { BC: 49, AB: 61, PR: 58, ON: 54, QC: 63, AT: 66 },
    languages: { en: 55, fr: 62 },
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
      fr: "Un album francophone remportera-t-il l’album de l’année aux Juno 2027?",
    },
    scored: true,
    closesAt: "2027-03-28T23:00:00Z",
    forecasters: 6740,
    history: series(30, [[0, 15], [29, 18]]),
    provinces: { BC: 12, AB: 10, PR: 11, ON: 14, QC: 39, AT: 15 },
    languages: { en: 13, fr: 37 },
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
      fr: "Pensez-vous que les Maple Leafs feront les séries de 2027?",
    },
    scored: false,
    closesAt: "2027-04-15T23:00:00Z",
    forecasters: 22980,
    history: series(30, [[0, 70], [14, 61], [29, 64]]),
    provinces: { BC: 52, AB: 49, PR: 55, ON: 78, QC: 47, AT: 66 },
    languages: { en: 67, fr: 48 },
    events: [],
    resolution: {
      source: { name: { en: "Just-for-fun poll (not scored)", fr: "Sondage pour le plaisir (non évalué)" }, url: "https://www.nhl.com/standings" },
      rule: {
        en: "This is a poll, not a scored forecast. It shows what Canadians think and doesn't count toward anyone's record.",
        fr: "Ceci est un sondage, pas une prévision évaluée. Il montre ce que pensent les Canadiens et ne compte dans le bilan de personne.",
      },
      resolvesAt: "2027-04-20T04:00:00Z",
    },
  },
  {
    slug: "jobs-rate-oct-2026",
    category: "economy",
    question: {
      en: "Will Canada's October unemployment rate be 7.0% or higher?",
      fr: "Le taux de chômage d’octobre au Canada sera-t-il de 7,0 % ou plus?",
    },
    scored: true,
    closesAt: "2026-11-05T13:00:00Z",
    forecasters: 8655,
    history: series(30, [[0, 58], [18, 55], [29, 49]]),
    provinces: { BC: 47, AB: 52, PR: 46, ON: 53, QC: 41, AT: 50 },
    languages: { en: 51, fr: 43 },
    events: [],
    resolution: {
      source: { name: { en: "Statistics Canada · Labour Force Survey", fr: "Statistique Canada · Enquête sur la population active" }, url: "https://www150.statcan.gc.ca/n1/dai-quo/ssi/homepage/rel-com/indicator-eng.htm" },
      rule: {
        en: "Resolves YES if the seasonally adjusted national unemployment rate for October 2026 is 7.0% or higher in the first Labour Force Survey release.",
        fr: "Résolue OUI si le taux de chômage national désaisonnalisé d’octobre 2026 est de 7,0 % ou plus dans la première publication de l’Enquête sur la population active.",
      },
      resolvesAt: "2026-11-06T13:30:00Z",
    },
  },
  {
    slug: "cpi-sept-2026",
    category: "economy",
    question: {
      en: "Will September's inflation rate be 2.0% or higher?",
      fr: "Le taux d’inflation de septembre sera-t-il de 2,0 % ou plus?",
    },
    scored: true,
    closesAt: "2026-10-21T12:15:00Z",
    forecasters: 12870,
    history: series(30, [[0, 49], [11, 56], [22, 63], [29, 71]]),
    provinces: { BC: 68, AB: 74, PR: 70, ON: 72, QC: 69, AT: 73 },
    languages: { en: 71, fr: 70 },
    events: [{ dayIndex: 22, label: { en: "Gas prices up", fr: "Hausse de l’essence" } }],
    resolution: {
      source: { name: { en: "Statistics Canada · Consumer Price Index", fr: "Statistique Canada · Indice des prix à la consommation" }, url: "https://www150.statcan.gc.ca/n1/en/subjects/prices_and_price_indexes/consumer_price_indexes" },
      rule: {
        en: "Resolves YES if the all-items CPI rose 2.0% or more year over year in September 2026, in Statistics Canada's first release.",
        fr: "Résolue OUI si l’IPC d’ensemble a augmenté de 2,0 % ou plus sur un an en septembre 2026, selon la première publication de Statistique Canada.",
      },
      resolvesAt: "2026-10-21T12:30:00Z",
      result: { outcome: "yes", publishedAt: "2026-10-21T12:30:00Z" },
    },
  },
  {
    slug: "boc-hold-oct-2026",
    category: "economy",
    question: {
      en: "Will the Bank of Canada hold its policy rate at its October 2026 decision?",
      fr: "La Banque du Canada maintiendra-t-elle son taux directeur à sa décision d’octobre 2026?",
    },
    scored: true,
    closesAt: "2026-10-28T13:45:00Z",
    forecasters: 15930,
    history: series(30, [[0, 58], [12, 66], [24, 74], [29, 77]]),
    provinces: { BC: 75, AB: 79, PR: 76, ON: 78, QC: 74, AT: 77 },
    languages: { en: 78, fr: 74 },
    events: [{ dayIndex: 12, label: { en: "CPI release", fr: "Publication de l’IPC" } }],
    resolution: {
      source: { name: { en: "Bank of Canada", fr: "Banque du Canada" }, url: "https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/" },
      rule: {
        en: "Resolves YES if the target for the overnight rate is unchanged after the scheduled October 2026 decision.",
        fr: "Résolue OUI si la cible du taux du financement à un jour reste inchangée après la décision prévue d’octobre 2026.",
      },
      resolvesAt: "2026-10-28T14:00:00Z",
      result: { outcome: "yes", publishedAt: "2026-10-28T14:00:00Z" },
    },
  },
  {
    slug: "mtl-snow-oct-2026",
    category: "weather",
    question: {
      en: "Will Montréal get its first measurable snow before Nov. 1?",
      fr: "Montréal recevra-t-elle sa première neige mesurable avant le 1er novembre?",
    },
    scored: true,
    closesAt: "2026-10-25T04:00:00Z",
    forecasters: 7210,
    history: series(30, [[0, 35], [18, 41], [29, 44]]),
    provinces: { BC: 40, AB: 46, PR: 45, ON: 42, QC: 47, AT: 43 },
    languages: { en: 41, fr: 47 },
    events: [],
    resolution: {
      source: { name: { en: "Environment and Climate Change Canada", fr: "Environnement et Changement climatique Canada" }, url: "https://climate.weather.gc.ca/" },
      rule: {
        en: "Resolves YES if Montréal–Trudeau (YUL) records 0.2\u00a0cm of snow or more on any day before Nov. 1, 2026 (ET), in ECCC daily data.",
        fr: "Résolue OUI si Montréal-Trudeau (YUL) enregistre au moins 0,2\u00a0cm de neige un jour avant le 1er novembre 2026 (HE), selon les données quotidiennes d’ECCC.",
      },
      resolvesAt: "2026-11-01T17:00:00Z",
      result: { outcome: "no", publishedAt: "2026-11-01T17:00:00Z" },
    },
  },
  {
    slug: "box-office-oct-2026",
    category: "culture",
    question: {
      en: "Will a Canadian film place in the national box-office top five on Thanksgiving weekend?",
      fr: "Un film canadien se classera-t-il parmi les cinq premiers au box-office national à l’Action de grâce?",
    },
    scored: true,
    closesAt: "2026-10-09T23:00:00Z",
    forecasters: 3480,
    history: series(30, [[0, 24], [20, 29], [29, 27]]),
    provinces: { BC: 25, AB: 22, PR: 24, ON: 27, QC: 36, AT: 26 },
    languages: { en: 24, fr: 35 },
    events: [],
    resolution: {
      source: { name: { en: "Telefilm Canada · box-office data", fr: "Téléfilm Canada · données du box-office" }, url: "https://telefilm.ca/en/" },
      rule: {
        en: "Resolves YES if a Canadian-certified film ranks in the top five for Canada over Oct. 9 to 12, 2026, in the first published weekend figures.",
        fr: "Résolue OUI si un film certifié canadien se classe parmi les cinq premiers au Canada du 9 au 12 octobre 2026, selon les premiers chiffres publiés.",
      },
      resolvesAt: "2026-10-14T16:00:00Z",
      result: { outcome: "yes", publishedAt: "2026-10-14T16:00:00Z", disputed: true },
    },
  },
  ...moreSampleQuestions,
] satisfies ReadonlyArray<unknown>;

/** Validated at import so a bad sample fails the build, not the page. */
export const sampleQuestions: readonly Question[] = raw.map((q) => questionSchema.parse(q));

export function getQuestion(slug: string): Question | undefined {
  return sampleQuestions.find((q) => q.slug === slug);
}

/** Today's five: the first five open questions in editorial order. */
export function todaysFive(now: Date = SAMPLE_NOW): Question[] {
  return sampleQuestions.filter((q) => isOpen(questionState(q, now))).slice(0, 5);
}
