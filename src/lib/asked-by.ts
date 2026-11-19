import { z } from "zod";
import { cardSafe } from "@/lib/card-text";
import { fill } from "@/lib/text";

/**
 * Who asked a guest or brand question, and the label that says so (LEX, guest-and-brand-questions-rules.md, "Labels").
 * The reader must know at a glance who paid, so the label sits next to the question everywhere it goes: the question
 * page, the embed, the share card and the share post. No shipped question carries one yet; guest and brand questions
 * are a later build, and this is the slot they fill.
 *
 * - A brand question (the brand pays or gives anything of value): "Sponsored by [Brand]" / « Commandité par [Marque] ».
 * - A guest question, unpaid: "Asked by [Name]" / « Question de [Nom] ».
 * - A guest question with a material connection (paid, given anything of value, or promoting their own book, show or
 *   product): "Asked by [Name] · Paid partnership" / « Question de [Nom] · Partenariat rémunéré ».
 */

/**
 * Brand sectors LEX does not accept at launch ("Excluded brands and guests"). A sponsor declares its sector, and the
 * schema refuses these, so a gambling, prediction-market or crypto sponsor can never reach a page or a card.
 */
export const excludedSponsorSectors = [
  // Political: parties, candidates, riding associations, third parties, advocacy and issue campaigns, election-period government ads.
  "political",
  // Gambling: casinos, lotteries, sportsbooks, sweepstakes operators.
  "gambling",
  "prediction-market",
  // Crypto and risky finance.
  "crypto",
  "trading-app",
  "forex-cfd",
  "payday-lender",
  // Restricted by law.
  "cannabis",
  "tobacco-vaping",
  "prescription-drug",
  "weapons",
  "adult",
  // Excluded at launch; LEX revisits with provincial rules later.
  "alcohol",
] as const;

/** Sectors a sponsor may declare. Anything not listed needs LEX before it is added here. */
export const sponsorSectors = [
  "retail",
  "food",
  "media",
  "technology",
  "telecom",
  "travel",
  "sport-and-outdoors",
  "culture",
  "education",
  "nonprofit",
  "other",
  ...excludedSponsorSectors,
] as const;

const excluded = new Set<string>(excludedSponsorSectors);

/** A name the card fonts can draw whole, so the label never loses a letter on the share card. */
const labelName = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine((name) => cardSafe(name) === name, { message: "The name must use only characters the share card can draw." });

export const askedBySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("sponsor"),
    name: labelName,
    sector: z.enum(sponsorSectors).refine((s) => !excluded.has(s), { message: "LEX does not accept sponsors from this sector." }),
  }),
  z.object({
    kind: z.literal("guest"),
    name: labelName,
    /** Paid, given anything of value, or promoting their own product: adds "Paid partnership". The guest confirms it in writing. */
    paidPartnership: z.boolean(),
    /** LEX: written permission from the guest to use their name and question (Quebec Civil Code arts. 3, 35, 36). */
    writtenPermission: z.literal(true),
  }),
]);
export type AskedBy = z.infer<typeof askedBySchema>;

export type AskedByLabels = {
  /** "Sponsored by {name}" */
  sponsor: string;
  /** "Asked by {name}" */
  guest: string;
  /** "Paid partnership" */
  paidPartnership: string;
};

/** The one label for a guest or brand question, in LEX's exact wording. */
export function askedByLabel(askedBy: AskedBy, labels: AskedByLabels): string {
  if (askedBy.kind === "sponsor") return fill(labels.sponsor, { name: askedBy.name });
  const guest = fill(labels.guest, { name: askedBy.name });
  return askedBy.paidPartnership ? `${guest} · ${labels.paidPartnership}` : guest;
}
