/** English strings. Every key must also exist in fr.ts (enforced by tests/unit/dictionaries.test.ts). */
const en = {
  meta: {
    title: "Consensa: what Canada thinks happens next",
    description: "Make quick probability calls on Canadian questions and see where Canada lands, province by province. Free, no money, no prizes.",
  },
  nav: { today: "Today", record: "My record", skipToContent: "Skip to content", language: "Language", switchTo: "Français" },
  legal: {
    noValue: "Free to play. No cash value. No purchase necessary.",
    footer: "Free · No money · No prizes · 18+",
    sample: "Sample questions and numbers while we build.",
  },
  today: {
    title: "Today's five",
    subtitle: "Make your call. See where Canada lands.",
    tagline: "What Canada thinks happens next.",
  },
  question: {
    canadaSays: "Canada says",
    chance: "chance",
    yes: "Yes",
    no: "No",
    forecasters: "forecasters",
    closes: "Closes",
    closed: "Closed",
    poll: "Poll · not scored",
    scored: "Scored",
    makeYourCall: "Make your call",
    open: "Open question",
    back: "All of today's questions",
  },
  chart: {
    title: "How the forecast moved",
    summary: "Over the last {days} days, Canada's forecast went from {from} to {to}.",
    range: { week: "1W", month: "1M", all: "All" },
  },
  province: {
    title: "Canada says yes, by province",
    summary: "Highest in {high} at {highValue}, lowest in {low} at {lowValue}.",
    names: { BC: "BC", AB: "Alberta", PR: "Prairies", ON: "Ontario", QC: "Quebec", AT: "Atlantic" },
    short: { BC: "BC", AB: "AB", PR: "Prairies", ON: "ON", QC: "QC", AT: "Atl." },
  },
  call: {
    title: "Your call",
    hint: "How likely is it? Slide to set your probability.",
    sliderLabel: "Your probability that the answer is yes",
    quick: { unlikely: "Unlikely", tossUp: "Toss-up", likely: "Likely" },
    you: "You",
    save: "Make my call",
    saved: "Call saved",
    change: "Change",
    sameAsCrowd: "You're right in line with Canada.",
    moreThan: "You're {n} points more confident than Canada.",
    lessThan: "You're {n} points less confident than Canada.",
    scoredWhen: "It's scored when the official result is published.",
    demoNote: "Calls aren't stored yet in this preview.",
  },
  why: {
    title: "Why it moved",
    byline: "Written by AI, reviewed by an editor",
    note: "This explains what changed. It isn't advice on how to call it.",
    sources: "Sources",
  },
  resolution: {
    title: "How this resolves",
    source: "Official source",
    resolvesOn: "Result expected",
  },
  design: {
    title: "Design system",
    intro: "The tokens and components every Consensa screen is built from. Product screens come next.",
    colours: "Colour",
    type: "Type scale",
    spacing: "Spacing",
    components: "Components",
    swatches: { ink: "Ink", ink2: "Slate", paper: "Paper", yes: "Teal · yes", no: "Violet · no", accent: "Canada red · accent only" },
    sampleLine: "What Canada thinks happens next.",
  },
  notFound: { title: "We couldn't find that question", back: "Back to today's questions" },
} as const;

type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };
export type Dictionary = Widen<typeof en>;
export default en satisfies Dictionary;
