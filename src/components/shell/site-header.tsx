import Link from "next/link";
import { LocaleSwitch } from "@/components/locale-switch";
import { Wordmark } from "@/components/wordmark";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { Icon } from "./icons";
import { localeHref } from "./nav-items";
import { PrimaryNav } from "./primary-nav";
import { ThemeToggle } from "./theme-toggle";

type Props = { locale: Locale; t: Pick<Dictionary, "nav" | "shell"> };

/**
 * The sticky top bar on every screen. Left: the wordmark (home). Middle: the five destinations (tablet
 * and up). Right: search, theme, the EN/FR switch and sign in. On phones the destinations move to the
 * bottom tab bar, so the header keeps only what fits one thumb-width row at French length.
 */
export function SiteHeader({ locale, t }: Props) {
  const labels = { today: t.nav.today, board: t.nav.board, provinces: t.nav.provinces, leaderboard: t.nav.leaderboard, record: t.nav.record };
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-2 px-4 md:gap-4">
        <Link href={localeHref(locale, "/")} aria-label={t.nav.home} className="-ml-1 rounded-control px-1 py-1">
          <Wordmark />
        </Link>
        <div className="flex-1 md:flex md:justify-center">
          <PrimaryNav locale={locale} labels={labels} navLabel={t.nav.main} />
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={localeHref(locale, "/search")}
            className="grid size-10 place-items-center rounded-full text-ink-2 transition-colors duration-[var(--cn-duration-fast)] hover:bg-sunken hover:text-ink"
          >
            <Icon name="search" />
            <span className="sr-only">{t.nav.search}</span>
          </Link>
          <ThemeToggle labels={{ system: t.shell.theme.system, light: t.shell.theme.light, dark: t.shell.theme.dark }} changeLabel={t.shell.theme.change} />
          <LocaleSwitch locale={locale} label={t.nav.language} switchTo={t.nav.switchTo} />
          <Link
            href={localeHref(locale, "/sign-in")}
            className="ml-1 hidden rounded-control bg-ink px-3 py-2 text-body-sm font-bold text-paper transition-opacity duration-[var(--cn-duration-fast)] hover:opacity-90 sm:inline-flex"
          >
            {t.nav.signIn}
          </Link>
        </div>
      </div>
    </header>
  );
}
