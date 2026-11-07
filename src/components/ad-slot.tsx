import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { adSlots, adsAllowedOn, type AdSlotId } from "@/lib/ads";

type Props = { slot: AdSlotId; locale: Locale; t: Dictionary["ads"] };

/**
 * A labelled ad slot with a fixed size, so a filled ad never shifts the layout. Until the ad network lands (M5),
 * it shows a house ad from Consensa. Refuses to render on ad-free screens (see src/lib/ads.ts).
 */
export function AdSlot({ slot, locale, t }: Props) {
  const def = adSlots[slot];
  if (!adsAllowedOn(def.screen)) return null;
  const rail = def.kind === "rail";
  return (
    <aside
      aria-label={t.label}
      data-ad-slot={slot}
      className={`grid content-start gap-1 border-y-2 border-ink px-4 py-5 ${rail ? "min-h-[600px] w-[300px]" : "min-h-[148px]"}`}
    >
      <p className="m-0 flex items-center justify-between text-caption font-semibold uppercase tracking-wide text-ink-2">
        <span>{t.label}</span>
        <span className="normal-case tracking-normal">{t.house}</span>
      </p>
      <p className="m-0 font-display text-title-sm font-bold">{t.houseTitle}</p>
      <p className="m-0 text-body-sm text-ink-2">{t.houseBody}</p>
      <Link href={`/${locale}/methodology`} className="justify-self-start text-body-sm font-semibold text-link underline underline-offset-4">
        {t.houseCta}
      </Link>
    </aside>
  );
}
