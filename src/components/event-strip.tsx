import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { formatCount, formatEasternTime } from "@/lib/format";
import type { EventHub } from "@/lib/heat";
import { fill } from "@/lib/text";

/** When an event's line reads "Starts …" or "Under way". */
export function eventWhen(at: string, now: Date, locale: Locale, t: Dictionary["event"]): string {
  return Date.parse(at) <= now.getTime() ? t.underway : fill(t.starts, { when: formatEasternTime(at, locale) });
}

/**
 * Big events coming up (the Oscars, the Grey Cup, a Bank of Canada day), each linking to its own page. Shown only while
 * an event is up, so most days it renders nothing. Not a nav item: it lives on the board.
 */
export function EventStrip({ events, locale, t, now }: { events: readonly EventHub[]; locale: Locale; t: Dictionary; now: Date }) {
  if (events.length === 0) return null;
  return (
    <section aria-labelledby="events-label" className="grid gap-3 border-t-2 border-ink pt-3">
      <h2 id="events-label" className="m-0 text-caption font-bold uppercase tracking-widest text-ink-2">
        {t.board.eventsLabel}
      </h2>
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {events.map(({ event, questions }) => (
          <li key={event.id} className="relative grid gap-1 rounded-card border border-line bg-surface p-4 transition-colors duration-[var(--cn-duration-fast)] hover:border-line-strong">
            <Link href={`/${locale}/event/${event.id}`} className="font-display text-title-sm font-bold leading-snug text-balance text-ink after:absolute after:inset-0 after:rounded-card hover:underline focus-visible:underline">
              {event.name[locale]}
            </Link>
            <span className="text-caption text-ink-2 tabular">
              {eventWhen(event.at, now, locale, t.event)} · {questions.length === 1 ? t.board.countOne : fill(t.board.count, { n: formatCount(questions.length, locale) })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
