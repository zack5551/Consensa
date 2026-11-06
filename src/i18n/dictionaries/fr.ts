import type { Dictionary } from "./en";

/** Quebec French strings. Non-breaking spaces ( ,  ) before % : ? ! ; per OQLF usage. */
const fr = {
  meta: {
    title: "Consensa : ce que le Canada prévoit",
    description: "Faites des prévisions rapides sur des questions canadiennes et voyez où le Canada se situe, province par province. Gratuit, sans argent, sans prix.",
  },
  nav: { today: "Aujourd’hui", record: "Mon dossier", skipToContent: "Aller au contenu", language: "Langue", switchTo: "English" },
  legal: {
    noValue: "Gratuit. Aucune valeur monétaire. Aucun achat requis.",
    footer: "Gratuit · Sans argent · Sans prix · 18 ans et +",
    sample: "Questions et chiffres fictifs pendant la construction.",
  },
  today: {
    title: "Les cinq du jour",
    subtitle: "Faites votre prévision. Voyez où le Canada se situe.",
    tagline: "Ce que le Canada prévoit.",
  },
  question: {
    canadaSays: "Le Canada pense",
    chance: "de chances",
    yes: "Oui",
    no: "Non",
    forecasters: "prévisionnistes",
    closes: "Ferme le",
    closed: "Fermée",
    poll: "Sondage · non évalué",
    scored: "Évaluée",
    makeYourCall: "Faire ma prévision",
    open: "Ouvrir la question",
    back: "Toutes les questions du jour",
  },
  chart: {
    title: "L’évolution de la prévision",
    summary: "Au cours des {days} derniers jours, la prévision du Canada est passée de {from} à {to}.",
    range: { week: "1 sem.", month: "1 mois", all: "Tout" },
  },
  province: {
    title: "Le Canada pense oui, par province",
    summary: "Le plus élevé au {high} ({highValue}), le plus bas au {low} ({lowValue}).",
    names: { BC: "C.-B.", AB: "Alberta", PR: "Prairies", ON: "Ontario", QC: "Québec", AT: "Atlantique" },
    short: { BC: "C.-B.", AB: "Alb.", PR: "Prairies", ON: "Ont.", QC: "Qc", AT: "Atl." },
  },
  call: {
    title: "Votre prévision",
    hint: "Quelle est la probabilité? Glissez pour la choisir.",
    sliderLabel: "Votre probabilité que la réponse soit oui",
    quick: { unlikely: "Peu probable", tossUp: "50-50", likely: "Probable" },
    you: "Vous",
    save: "Confirmer ma prévision",
    saved: "Prévision enregistrée",
    change: "Modifier",
    sameAsCrowd: "Vous êtes en ligne avec le Canada.",
    moreThan: "Vous êtes {n} points plus confiant que le Canada.",
    lessThan: "Vous êtes {n} points moins confiant que le Canada.",
    scoredWhen: "Elle sera évaluée à la publication du résultat officiel.",
    demoNote: "Les prévisions ne sont pas encore enregistrées dans cet aperçu.",
  },
  why: {
    title: "Pourquoi ça a bougé",
    byline: "Rédigé par IA, revu par un éditeur",
    note: "Ceci explique ce qui a changé. Ce n’est pas un conseil de prévision.",
    sources: "Sources",
  },
  resolution: {
    title: "Comment elle sera résolue",
    source: "Source officielle",
    resolvesOn: "Résultat attendu",
  },
  design: {
    title: "Système de design",
    intro: "Les jetons et composants qui servent à bâtir chaque écran de Consensa. Les écrans du produit suivront.",
    colours: "Couleurs",
    type: "Échelle typographique",
    spacing: "Espacement",
    components: "Composants",
    swatches: { ink: "Encre", ink2: "Ardoise", paper: "Papier", yes: "Sarcelle · oui", no: "Violet · non", accent: "Rouge Canada · accent seulement" },
    sampleLine: "Ce que le Canada prévoit.",
  },
  notFound: { title: "Question introuvable", back: "Retour aux questions du jour" },
} satisfies Dictionary;

export default fr;
