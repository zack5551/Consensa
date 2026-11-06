import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { localeHref } from "./nav-items";

type Props = { locale: Locale; t: Pick<Dictionary, "legal" | "shell" | "nav"> };

/**
 * Every screen ends with the no-value promise (CLAUDE.md rule 3, LEX §1): "Free · No money · No prizes · 18+"
 * and LEX's exact no-value label. Then the plain-language legal pages, and the data-in-Canada promise.
 */
export function SiteFooter({ locale, t }: Props) {
  const links = [
    [t.shell.footer.about, "/#how"],
    [t.shell.footer.privacy, "/privacy"],
    [t.shell.footer.terms, "/terms"],
    [t.legal.design, "/design"],
  ] as const;
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-[1120px] gap-6 px-4 py-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="grid gap-2">
          <Wordmark />
          <p className="m-0 text-body-sm font-bold text-ink">{t.legal.footer}</p>
          <p className="m-0 text-body-sm text-ink-2">{t.legal.noValue}</p>
          <p className="m-0 text-caption text-ink-2">
            {t.shell.footer.dataInCanada} {t.shell.footer.bilingual}
          </p>
          <p className="m-0 text-caption text-ink-2">{t.legal.sample}</p>
        </div>
        <nav aria-label={t.shell.footer.label}>
          <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 md:justify-end">
            {links.map(([label, path]) => (
              <li key={path}>
                <Link href={localeHref(locale, path)} className="inline-flex min-h-6 items-center text-body-sm font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
