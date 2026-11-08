import type { questionSchema } from "@/lib/question";
import type { z } from "zod";
import { series } from "./series";

/**
 * More sample questions for the Board, category boards and search (ORBIT). Same rules as the rest:
 * a named official source, an exact threshold, a close before the answer is known, EN and FR written natively.
 * Sports stay as unscored polls. Numbers are illustrative.
 */
export const moreSampleQuestions = [
  {
    slug: "gdp-q3-2026",
    category: "economy",
    question: {
      en: "Will Canada's real GDP grow in the third quarter of 2026?",
      fr: "Le PIB réel du Canada aura-t-il progressé au troisième trimestre de 2026?",
    },
    scored: true,
    closesAt: "2026-11-27T13:00:00Z",
    forecasters: 7420,
    history: series(30, [[0, 61], [10, 58], [20, 64], [29, 66]]),
    provinces: { BC: 63, AB: 70, PR: 66, ON: 64, QC: 68, AT: 65 },
    languages: { en: 65, fr: 68 },
    events: [{ dayIndex: 19, label: { en: "Monthly GDP estimate", fr: "Estimation mensuelle du PIB" } }],
    resolution: {
      source: { name: { en: "Statistics Canada · GDP by industry", fr: "Statistique Canada · PIB par industrie" }, url: "https://www150.statcan.gc.ca/n1/en/subjects/economic_accounts/gross_domestic_product" },
      rule: {
        en: "Resolves YES if Statistics Canada's first estimate of real GDP for Q3 2026 shows growth above 0.0% quarter over quarter.",
        fr: "Résolue OUI si la première estimation du PIB réel du 3e trimestre de 2026 par Statistique Canada montre une croissance supérieure à 0,0 % d’un trimestre à l’autre.",
      },
      resolvesAt: "2026-11-27T13:30:00Z",
    },
  },
  {
    slug: "boc-hold-jan-2027",
    category: "economy",
    question: {
      en: "Will the Bank of Canada hold its policy rate at its January 2027 decision?",
      fr: "La Banque du Canada maintiendra-t-elle son taux directeur à sa décision de janvier 2027?",
    },
    scored: true,
    closesAt: "2027-01-27T14:45:00Z",
    forecasters: 5210,
    history: series(21, [[0, 55], [10, 59], [20, 62]]),
    provinces: { BC: 60, AB: 66, PR: 63, ON: 61, QC: 58, AT: 62 },
    languages: { en: 62, fr: 59 },
    events: [],
    resolution: {
      source: { name: { en: "Bank of Canada", fr: "Banque du Canada" }, url: "https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/" },
      rule: {
        en: "Resolves YES if the target for the overnight rate announced on the scheduled January 2027 decision date is unchanged from the previous target.",
        fr: "Résolue OUI si la cible du taux du financement à un jour annoncée à la date de décision prévue de janvier 2027 est inchangée par rapport à la cible précédente.",
      },
      resolvesAt: "2027-01-27T15:00:00Z",
    },
  },
  {
    slug: "usd-cad-dec-2026",
    category: "economy",
    question: {
      en: "Will the Bank of Canada's U.S. dollar rate for Dec. 31 be under 1.37 Canadian dollars?",
      fr: "Le taux de change du dollar américain de la Banque du Canada pour le 31 décembre sera-t-il inférieur à 1,37 dollar canadien?",
    },
    scored: true,
    closesAt: "2026-12-30T21:00:00Z",
    forecasters: 3980,
    history: series(30, [[0, 44], [12, 48], [22, 41], [29, 46]]),
    provinces: { BC: 45, AB: 50, PR: 47, ON: 46, QC: 44, AT: 43 },
    languages: { en: 47, fr: 44 },
    events: [],
    resolution: {
      source: { name: { en: "Bank of Canada · daily exchange rates", fr: "Banque du Canada · taux de change quotidiens" }, url: "https://www.bankofcanada.ca/rates/exchange/daily-exchange-rates/" },
      rule: {
        en: "Resolves YES if the Bank of Canada's published USD/CAD daily rate for Dec. 31, 2026 is below 1.3700.",
        fr: "Résolue OUI si le taux quotidien USD/CAD publié par la Banque du Canada pour le 31 décembre 2026 est inférieur à 1,3700.",
      },
      resolvesAt: "2026-12-31T21:30:00Z",
    },
  },
  {
    slug: "boc-cut-oct-2026",
    category: "economy",
    question: {
      en: "Did the Bank of Canada cut its policy rate at its October 2026 decision?",
      fr: "La Banque du Canada a-t-elle baissé son taux directeur à sa décision d’octobre 2026?",
    },
    scored: true,
    closesAt: "2026-10-28T13:45:00Z",
    forecasters: 16310,
    history: series(30, [[0, 47], [14, 40], [29, 33]]),
    provinces: { BC: 35, AB: 30, PR: 33, ON: 34, QC: 31, AT: 36 },
    languages: { en: 34, fr: 31 },
    events: [],
    resolution: {
      source: { name: { en: "Bank of Canada", fr: "Banque du Canada" }, url: "https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/" },
      rule: {
        en: "Resolves YES if the Bank of Canada announced a lower target for the overnight rate on its scheduled October 2026 decision date.",
        fr: "Résolue OUI si la Banque du Canada a annoncé une cible plus basse pour le taux du financement à un jour à sa date de décision prévue d’octobre 2026.",
      },
      resolvesAt: "2026-10-28T14:00:00Z",
      result: { outcome: "no", publishedAt: "2026-10-28T14:00:00Z" },
    },
  },
  {
    slug: "montreal-white-christmas-2026",
    category: "weather",
    question: {
      en: "Will Montréal have a white Christmas in 2026?",
      fr: "Montréal aura-t-elle un Noël blanc en 2026?",
    },
    scored: true,
    closesAt: "2026-12-20T05:00:00Z",
    forecasters: 14090,
    history: series(30, [[0, 68], [15, 63], [29, 66]]),
    provinces: { BC: 58, AB: 61, PR: 63, ON: 64, QC: 74, AT: 66 },
    languages: { en: 62, fr: 73 },
    events: [],
    resolution: {
      source: { name: { en: "Environment and Climate Change Canada", fr: "Environnement et Changement climatique Canada" }, url: "https://climate.weather.gc.ca/" },
      rule: {
        en: "Resolves YES if snow on the ground at Montréal–Trudeau (YUL) is 2 cm or more on the morning of Dec. 25, 2026, in ECCC daily data.",
        fr: "Résolue OUI si la neige au sol à Montréal-Trudeau (YUL) atteint 2 cm ou plus le matin du 25 décembre 2026, selon les données quotidiennes d’ECCC.",
      },
      resolvesAt: "2026-12-26T17:00:00Z",
    },
  },
  {
    slug: "winnipeg-minus-30-2026",
    category: "weather",
    question: {
      en: "Will Winnipeg hit −30 °C before the end of 2026?",
      fr: "Winnipeg atteindra-t-elle −30 °C avant la fin de 2026?",
    },
    scored: true,
    closesAt: "2026-12-01T06:00:00Z",
    forecasters: 6025,
    history: series(30, [[0, 49], [18, 46], [29, 52]]),
    provinces: { BC: 47, AB: 55, PR: 61, ON: 50, QC: 48, AT: 46 },
    languages: { en: 53, fr: 47 },
    events: [{ dayIndex: 24, label: { en: "Arctic air outlook", fr: "Prévision d’air arctique" } }],
    resolution: {
      source: { name: { en: "Environment and Climate Change Canada", fr: "Environnement et Changement climatique Canada" }, url: "https://climate.weather.gc.ca/" },
      rule: {
        en: "Resolves YES if the minimum temperature at Winnipeg Richardson (YWG) reaches −30.0 °C or colder on any day from Dec. 1 to Dec. 31, 2026, in ECCC daily data.",
        fr: "Résolue OUI si la température minimale à Winnipeg Richardson (YWG) atteint −30,0 °C ou moins un jour entre le 1er et le 31 décembre 2026, selon les données quotidiennes d’ECCC.",
      },
      resolvesAt: "2027-01-02T17:00:00Z",
    },
  },
  {
    slug: "toronto-vacancy-2026",
    category: "housing",
    question: {
      en: "Will Toronto's purpose-built rental vacancy rate be 3% or higher in CMHC's 2026 report?",
      fr: "Le taux d’inoccupation des logements locatifs construits à cette fin à Toronto sera-t-il de 3 % ou plus dans le rapport 2026 de la SCHL?",
    },
    scored: true,
    closesAt: "2026-12-09T14:00:00Z",
    forecasters: 4870,
    history: series(30, [[0, 38], [16, 45], [29, 51]]),
    provinces: { BC: 49, AB: 47, PR: 46, ON: 55, QC: 50, AT: 48 },
    languages: { en: 52, fr: 48 },
    events: [],
    resolution: {
      source: { name: { en: "CMHC · Rental Market Report", fr: "SCHL · Rapport sur le marché locatif" }, url: "https://www.cmhc-schl.gc.ca/professionals/housing-markets-data-and-research/market-reports/rental-market-reports-major-centres" },
      rule: {
        en: "Resolves YES if CMHC's 2026 Rental Market Report gives a vacancy rate of 3.0% or higher for purpose-built rentals in the Toronto census metropolitan area.",
        fr: "Résolue OUI si le Rapport sur le marché locatif 2026 de la SCHL indique un taux d’inoccupation de 3,0 % ou plus pour les logements locatifs construits à cette fin dans la RMR de Toronto.",
      },
      resolvesAt: "2026-12-10T15:00:00Z",
    },
  },
  {
    slug: "housing-starts-nov-2026",
    category: "housing",
    question: {
      en: "Will November's housing starts top 250,000 at an annual rate?",
      fr: "Le nombre de logements commencés en novembre dépassera-t-il 250 000 en rythme annuel?",
    },
    scored: true,
    closesAt: "2026-12-14T13:00:00Z",
    forecasters: 3310,
    history: series(30, [[0, 41], [14, 46], [29, 44]]),
    provinces: { BC: 46, AB: 49, PR: 45, ON: 42, QC: 43, AT: 44 },
    languages: { en: 44, fr: 43 },
    events: [],
    resolution: {
      source: { name: { en: "CMHC · housing starts", fr: "SCHL · logements commencés" }, url: "https://www.cmhc-schl.gc.ca/professionals/housing-markets-data-and-research/housing-data/data-tables/housing-market-data/monthly-housing-starts-construction-data-tables" },
      rule: {
        en: "Resolves YES if CMHC's first release of the seasonally adjusted annual rate of total housing starts for November 2026 is above 250,000 units.",
        fr: "Résolue OUI si la première publication par la SCHL du rythme annuel désaisonnalisé du nombre total de logements commencés en novembre 2026 dépasse 250 000 logements.",
      },
      resolvesAt: "2026-12-15T13:15:00Z",
    },
  },
  {
    slug: "bye-bye-ratings-2026",
    category: "culture",
    question: {
      en: "Will Radio-Canada's Bye Bye 2026 draw more than 4 million viewers?",
      fr: "Le Bye Bye 2026 de Radio-Canada attirera-t-il plus de 4 millions de téléspectateurs?",
    },
    scored: true,
    closesAt: "2026-12-31T23:00:00Z",
    forecasters: 8810,
    history: series(30, [[0, 52], [15, 55], [29, 58]]),
    provinces: { BC: 44, AB: 46, PR: 45, ON: 51, QC: 63, AT: 52 },
    languages: { en: 49, fr: 64 },
    events: [],
    resolution: {
      source: { name: { en: "Numeris (as reported by Radio-Canada)", fr: "Numeris (selon Radio-Canada)" }, url: "https://numeris.ca/" },
      rule: {
        en: "Resolves YES if the first Numeris audience figure for the Dec. 31, 2026 broadcast of Bye Bye, as published by Radio-Canada, is above 4,000,000 viewers.",
        fr: "Résolue OUI si le premier chiffre d’auditoire Numeris pour la diffusion du Bye Bye du 31 décembre 2026, publié par Radio-Canada, dépasse 4 000 000 de téléspectateurs.",
      },
      resolvesAt: "2027-01-08T15:00:00Z",
    },
  },
  {
    slug: "csa-french-film-2027",
    category: "culture",
    question: {
      en: "Will a French-language film win Best Motion Picture at the 2027 Canadian Screen Awards?",
      fr: "Un film en français remportera-t-il le prix du meilleur film aux prix Écrans canadiens 2027?",
    },
    scored: true,
    closesAt: "2027-05-01T23:00:00Z",
    forecasters: 2940,
    history: series(30, [[0, 33], [29, 36]]),
    provinces: { BC: 28, AB: 27, PR: 29, ON: 31, QC: 52, AT: 33 },
    languages: { en: 29, fr: 51 },
    events: [],
    resolution: {
      source: { name: { en: "Academy of Canadian Cinema & Television", fr: "Académie canadienne du cinéma et de la télévision" }, url: "https://www.academy.ca/" },
      rule: {
        en: "Resolves YES if the 2027 Best Motion Picture winner is a film made mainly in French, as listed by the Academy.",
        fr: "Résolue OUI si le lauréat du meilleur film 2027 est un film tourné principalement en français, selon l’Académie.",
      },
      resolvesAt: "2027-05-03T04:00:00Z",
    },
  },
  {
    slug: "ev-share-q3-2026",
    category: "science",
    question: {
      en: "Were more than 15% of new vehicles registered in Canada in Q3 2026 zero-emission?",
      fr: "Plus de 15 % des véhicules neufs immatriculés au Canada au 3e trimestre de 2026 étaient-ils zéro émission?",
    },
    scored: true,
    closesAt: "2026-12-01T13:00:00Z",
    forecasters: 4120,
    history: series(30, [[0, 39], [14, 36], [29, 34]]),
    provinces: { BC: 45, AB: 27, PR: 29, ON: 33, QC: 44, AT: 31 },
    languages: { en: 33, fr: 42 },
    events: [],
    resolution: {
      source: { name: { en: "Statistics Canada · new motor vehicle registrations", fr: "Statistique Canada · immatriculations de véhicules automobiles neufs" }, url: "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=2010002501" },
      rule: {
        en: "Resolves YES if zero-emission vehicles (battery electric plus plug-in hybrid) make up more than 15.0% of new registrations for Q3 2026 in Statistics Canada's first release.",
        fr: "Résolue OUI si les véhicules zéro émission (électriques à batterie et hybrides rechargeables) représentent plus de 15,0 % des immatriculations neuves du 3e trimestre de 2026 dans la première publication de Statistique Canada.",
      },
      resolvesAt: "2026-12-02T13:30:00Z",
    },
  },
  {
    slug: "arctic-ice-dec-2026",
    category: "science",
    question: {
      en: "Will Canadian Arctic sea ice cover be below its 1991–2020 average on Dec. 1?",
      fr: "La couverture de glace de mer de l’Arctique canadien sera-t-elle sous sa moyenne 1991-2020 le 1er décembre?",
    },
    scored: true,
    closesAt: "2026-11-25T17:00:00Z",
    forecasters: 2580,
    history: series(30, [[0, 72], [29, 77]]),
    provinces: { BC: 79, AB: 72, PR: 74, ON: 77, QC: 78, AT: 76 },
    languages: { en: 77, fr: 78 },
    events: [],
    resolution: {
      source: { name: { en: "Canadian Ice Service", fr: "Service canadien des glaces" }, url: "https://www.canada.ca/en/environment-climate-change/services/ice-forecasts-observations.html" },
      rule: {
        en: "Resolves YES if the Canadian Ice Service's weekly ice coverage for the Canadian Arctic nearest Dec. 1, 2026 is below the 1991–2020 median for that week.",
        fr: "Résolue OUI si la couverture de glace hebdomadaire du Service canadien des glaces pour l’Arctique canadien la plus proche du 1er décembre 2026 est sous la médiane 1991-2020 pour cette semaine.",
      },
      resolvesAt: "2026-12-03T17:00:00Z",
    },
  },
  {
    slug: "canadian-team-cup-2027",
    category: "sports",
    question: {
      en: "Do you think a Canadian team wins the 2027 Stanley Cup?",
      fr: "Pensez-vous qu’une équipe canadienne remportera la coupe Stanley en 2027?",
    },
    scored: false,
    closesAt: "2027-06-01T23:00:00Z",
    forecasters: 19640,
    history: series(30, [[0, 41], [12, 37], [29, 39]]),
    provinces: { BC: 40, AB: 46, PR: 42, ON: 39, QC: 35, AT: 37 },
    languages: { en: 40, fr: 35 },
    events: [],
    resolution: {
      source: { name: { en: "Just-for-fun poll (not scored)", fr: "Sondage pour le plaisir (non évalué)" }, url: "https://www.nhl.com/" },
      rule: {
        en: "This is a poll, not a scored forecast. It shows what Canadians think and doesn't count toward anyone's record.",
        fr: "Ceci est un sondage, pas une prévision évaluée. Il montre ce que pensent les Canadiens et ne compte dans le bilan de personne.",
      },
      resolvesAt: "2027-06-30T04:00:00Z",
    },
  },
  {
    slug: "ghg-emissions-2025",
    category: "science",
    question: {
      en: "Will Canada’s greenhouse gas emissions fall in 2025?",
      fr: "Les émissions de gaz à effet de serre du Canada baisseront-elles en 2025?",
    },
    scored: true,
    closesAt: "2027-04-14T13:00:00Z",
    forecasters: 3980,
    history: series(30, [[0, 44], [11, 47], [21, 42], [29, 44]]),
    provinces: { BC: 52, AB: 34, PR: 41, ON: 46, QC: 55, AT: 45 },
    languages: { en: 42, fr: 50 },
    events: [
      { dayIndex: 10, label: { en: "Alberta emissions report", fr: "Rapport sur les émissions de l’Alberta" } },
      { dayIndex: 21, label: { en: "Federal climate plan", fr: "Plan climatique fédéral" } },
    ],
    why: {
      body: {
        en: "The crowd has hovered near 44% all month. Alberta’s latest emissions report — flat year over year — nudged it up to 47%, then the federal climate plan, which leans on industrial rules that take years to bite, pulled it back to 42%. The number now waits on the official inventory in April.",
        fr: "La foule tourne autour de 44 % depuis un mois. Le plus récent rapport sur les émissions de l’Alberta — stable d’une année à l’autre — l’a fait monter à 47 %, puis le plan climatique fédéral, qui s’appuie sur des règles industrielles aux effets lents, l’a ramenée à 42 %. Le chiffre attend maintenant l’inventaire officiel d’avril.",
      },
      sources: [
        { en: "Environment and Climate Change Canada · National Inventory Report", fr: "Environnement et Changement climatique Canada · Rapport d’inventaire national" },
      ],
    },
    resolution: {
      source: { name: { en: "Environment and Climate Change Canada", fr: "Environnement et Changement climatique Canada" }, url: "https://www.canada.ca/en/environment-climate-change/services/climate-change/greenhouse-gas-emissions/inventory.html" },
      rule: {
        en: "Resolves YES if the National Inventory Report shows Canada’s 2025 greenhouse gas emissions (excluding land use) below the 2024 total.",
        fr: "Résolue OUI si le Rapport d’inventaire national montre que les émissions de gaz à effet de serre du Canada en 2025 (sans l’affectation des terres) sont inférieures au total de 2024.",
      },
      resolvesAt: "2027-04-30T13:00:00Z",
    },
  },
  {
    slug: "hottest-year-2026",
    category: "science",
    question: {
      en: "Will 2026 be the hottest year on record in Canada?",
      fr: "2026 sera-t-elle l’année la plus chaude jamais enregistrée au Canada?",
    },
    scored: true,
    closesAt: "2026-12-31T23:00:00Z",
    forecasters: 5120,
    history: series(30, [[0, 58], [9, 61], [19, 57], [29, 59]]),
    provinces: { BC: 62, AB: 55, PR: 58, ON: 60, QC: 57, AT: 61 },
    languages: { en: 59, fr: 58 },
    events: [
      { dayIndex: 9, label: { en: "September heat wave", fr: "Vague de chaleur de septembre" } },
      { dayIndex: 19, label: { en: "October cold snap", fr: "Vague de froid d’octobre" } },
    ],
    why: {
      body: {
        en: "The crowd has held near 59% all month. A September heat wave across the Prairies pushed it to 61%, then an October cold snap pulled it back to 57%. The year is still tracking close to 2023, the warmest on record, so the number waits on the annual climate summary in January.",
        fr: "La foule se tient près de 59 % depuis un mois. Une vague de chaleur de septembre dans les Prairies l’a poussée à 61 %, puis une vague de froid d’octobre l’a ramenée à 57 %. L’année suit encore de près 2023, la plus chaude jamais enregistrée, alors le chiffre attend le bilan climatique annuel de janvier.",
      },
      sources: [
        { en: "Environment and Climate Change Canada · Annual climate summary", fr: "Environnement et Changement climatique Canada · Bilan climatique annuel" },
      ],
    },
    resolution: {
      source: { name: { en: "Environment and Climate Change Canada", fr: "Environnement et Changement climatique Canada" }, url: "https://www.canada.ca/en/environment-climate-change/services/climate-change/science-research-data/climate-trends-variability.html" },
      rule: {
        en: "Resolves YES if Environment and Climate Change Canada’s annual climate summary ranks 2026 as the warmest year on record for Canada.",
        fr: "Résolue OUI si le bilan climatique annuel d’Environnement et Changement climatique Canada classe 2026 comme l’année la plus chaude jamais enregistrée au Canada.",
      },
      resolvesAt: "2027-01-15T13:00:00Z",
    },
  },
  {
    slug: "housing-starts-2026",
    category: "housing",
    question: {
      en: "Will housing starts in Canada top 250,000 in 2026?",
      fr: "Les logements commencés au Canada dépasseront-ils 250 000 en 2026?",
    },
    scored: true,
    closesAt: "2026-12-31T23:00:00Z",
    forecasters: 6840,
    history: series(30, [[0, 49], [12, 52], [22, 47], [29, 50]]),
    provinces: { BC: 54, AB: 58, PR: 47, ON: 48, QC: 44, AT: 52 },
    events: [
      { dayIndex: 12, label: { en: "September starts beat expectations", fr: "Les logements commencés de septembre dépassent les attentes" } },
      { dayIndex: 22, label: { en: "Ontario permits slow", fr: "Ralentissement des permis en Ontario" } },
    ],
    why: {
      body: {
        en: "The crowd has stayed near 50% all month. September starts came in stronger than expected and lifted it to 52%, then slower Ontario permits pulled it back to 47%. Starts are running just below the pace 250,000 needs, so the number waits on CMHC’s January release.",
        fr: "La foule se tient près de 50 % depuis un mois. Les logements commencés de septembre, plus nombreux que prévu, l’ont fait monter à 52 %, puis le ralentissement des permis en Ontario l’a ramenée à 47 %. Le rythme est légèrement sous celui qu’il faut pour atteindre 250 000, alors le chiffre attend la publication de janvier de la SCHL.",
      },
      sources: [
        { en: "Canada Mortgage and Housing Corporation · Housing starts", fr: "Société canadienne d’hypothèques et de logement · Logements commencés" },
      ],
    },
    resolution: {
      source: { name: { en: "Canada Mortgage and Housing Corporation", fr: "Société canadienne d’hypothèques et de logement" }, url: "https://www.cmhc-schl.gc.ca/professionals/housing-markets-data-and-research/market-reports/housing-market-data" },
      rule: {
        en: "Resolves YES if CMHC reports total housing starts in Canada for 2026 above 250,000.",
        fr: "Résolue OUI si la SCHL déclare un total de logements commencés au Canada en 2026 supérieur à 250 000.",
      },
      resolvesAt: "2027-01-15T13:00:00Z",
    },
  },
  {
    slug: "hpi-up-2027",
    category: "housing",
    question: {
      en: "Will the national home price index rise in 2027?",
      fr: "L’indice national des prix des logements augmentera-t-il en 2027?",
    },
    scored: true,
    closesAt: "2027-12-31T23:00:00Z",
    forecasters: 4210,
    history: series(30, [[0, 46], [10, 43], [20, 48], [29, 45]]),
    provinces: { BC: 41, AB: 52, PR: 49, ON: 43, QC: 47, AT: 44 },
    languages: { en: 45, fr: 46 },
    events: [
      { dayIndex: 10, label: { en: "Fall sales cool", fr: "Refroidissement des ventes d’automne" } },
      { dayIndex: 20, label: { en: "Listings tighten", fr: "Resserrement des inscriptions" } },
    ],
    why: {
      body: {
        en: "The crowd has drifted near 45% all month. Cooler fall sales pulled it down to 43%, then tighter listings pushed it back to 48%. Prices are flat heading into the new year, so the number waits on the December 2027 index.",
        fr: "La foule oscille autour de 45 % depuis un mois. Le refroidissement des ventes d’automne l’a fait reculer à 43 %, puis le resserrement des inscriptions l’a ramenée à 48 %. Les prix sont stables à l’approche de la nouvelle année, alors le chiffre attend l’indice de décembre 2027.",
      },
      sources: [
        { en: "Canadian Real Estate Association · MLS® Home Price Index", fr: "Association canadienne de l’immobilier · Indice des prix des propriétés MLS®" },
      ],
    },
    resolution: {
      source: { name: { en: "Canadian Real Estate Association", fr: "Association canadienne de l’immobilier" }, url: "https://www.crea.ca/housing-market-stats/mls-home-price-index/" },
      rule: {
        en: "Resolves YES if CREA’s MLS® Home Price Index (national composite, seasonally adjusted) for December 2027 is above December 2026.",
        fr: "Résolue OUI si l’Indice des prix des propriétés MLS® de l’ACI (composite national, désaisonnalisé) de décembre 2027 est supérieur à celui de décembre 2026.",
      },
      resolvesAt: "2028-01-15T13:00:00Z",
    },
  },
  {
    slug: "white-christmas-toronto-2026",
    category: "weather",
    question: {
      en: "Will Toronto have a white Christmas in 2026?",
      fr: "Toronto aura-t-elle un Noël blanc en 2026?",
    },
    scored: true,
    closesAt: "2026-12-24T23:00:00Z",
    forecasters: 8930,
    history: series(30, [[0, 63], [8, 59], [18, 66], [29, 64]]),
    provinces: { BC: 58, AB: 61, PR: 63, ON: 70, QC: 66, AT: 60 },
    events: [
      { dayIndex: 8, label: { en: "Mild stretch", fr: "Période de douceur" } },
      { dayIndex: 18, label: { en: "Lake-effect snow", fr: "Neige d’effet de lac" } },
    ],
    why: {
      body: {
        en: "The crowd has held near 64% all month. A mild stretch in early November pulled it down to 59%, then lake-effect snow across southern Ontario pushed it back to 66%. Toronto usually keeps snow on the ground this late in December, so the number waits on Christmas morning.",
        fr: "La foule se tient près de 64 % depuis un mois. Une période de douceur au début de novembre l’a fait reculer à 59 %, puis la neige d’effet de lac dans le sud de l’Ontario l’a ramenée à 66 %. Toronto garde habituellement de la neige au sol si tard en décembre, alors le chiffre attend le matin de Noël.",
      },
      sources: [
        { en: "Environment and Climate Change Canada · Toronto Pearson observations", fr: "Environnement et Changement climatique Canada · Observations de Toronto Pearson" },
      ],
    },
    resolution: {
      source: { name: { en: "Environment and Climate Change Canada", fr: "Environnement et Changement climatique Canada" }, url: "https://weather.gc.ca/city/pages/on-143_metric_e.html" },
      rule: {
        en: "Resolves YES if Environment and Climate Change Canada reports at least 2 cm of snow on the ground at Toronto Pearson on the morning of December 25, 2026.",
        fr: "Résolue OUI si Environnement et Changement climatique Canada rapporte au moins 2 cm de neige au sol à Toronto Pearson le matin du 25 décembre 2026.",
      },
      resolvesAt: "2026-12-25T13:00:00Z",
    },
  },
  {
    slug: "unemployment-below-6-2027",
    category: "economy",
    question: {
      en: "Will Canada’s unemployment rate fall below 6% in 2027?",
      fr: "Le taux de chômage du Canada passera-t-il sous les 6 % en 2027?",
    },
    scored: true,
    closesAt: "2027-12-31T23:00:00Z",
    forecasters: 6120,
    history: series(30, [[0, 31], [11, 28], [21, 33], [29, 30]]),
    provinces: { BC: 34, AB: 27, PR: 29, ON: 30, QC: 33, AT: 26 },
    languages: { en: 30, fr: 31 },
    events: [
      { dayIndex: 11, label: { en: "Manufacturing sheds jobs", fr: "Pertes d’emplois dans le secteur manufacturier" } },
      { dayIndex: 21, label: { en: "October jobs beat expectations", fr: "L’emploi d’octobre dépasse les attentes" } },
    ],
    why: {
      body: {
        en: "The crowd has stayed near 30% all month. Manufacturing job losses pulled it down to 28%, then a stronger-than-expected October jobs report lifted it to 33%. Unemployment is hovering near 7%, so getting under 6% in 2027 would take a real hiring run — the number waits on each monthly release.",
        fr: "La foule se tient près de 30 % depuis un mois. Les pertes d’emplois dans le secteur manufacturier l’ont fait reculer à 28 %, puis un rapport sur l’emploi d’octobre plus fort que prévu l’a fait monter à 33 %. Le chômage tourne autour de 7 %, alors passer sous les 6 % en 2027 exigerait une vraie vague d’embauches — le chiffre attend chaque publication mensuelle.",
      },
      sources: [
        { en: "Statistics Canada · Labour Force Survey", fr: "Statistique Canada · Enquête sur la population active" },
      ],
    },
    resolution: {
      source: { name: { en: "Statistics Canada", fr: "Statistique Canada" }, url: "https://www150.statcan.gc.ca/n1/en/subjects/labour/labour_force_survey" },
      rule: {
        en: "Resolves YES if any monthly Labour Force Survey release in 2027 shows Canada’s unemployment rate (seasonally adjusted) below 6.0%.",
        fr: "Résolue OUI si une publication mensuelle de l’Enquête sur la population active en 2027 montre un taux de chômage canadien (désaisonnalisé) inférieur à 6,0 %.",
      },
      resolvesAt: "2028-01-15T13:00:00Z",
    },
  },
] satisfies ReadonlyArray<z.input<typeof questionSchema>>;
