"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { THEME_STORAGE_KEY, themes, type Theme } from "./theme";

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    if (theme === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
}

type Props = { labels: Record<Theme, string>; changeLabel: string };

/** One button that cycles System → Light → Dark. Its name says the current theme and what pressing does. */
export function ThemeToggle({ labels, changeLabel }: Props) {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const value = document.documentElement.dataset.theme;
    setTheme(value === "light" || value === "dark" ? value : "system");
  }, []);

  function cycle() {
    const next = themes[(themes.indexOf(theme) + 1) % themes.length] ?? "system";
    setTheme(next);
    apply(next);
  }

  const icon = theme === "light" ? "sun" : theme === "dark" ? "moon" : "system";
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`${changeLabel}: ${labels[theme]}`}
      title={`${changeLabel}: ${labels[theme]}`}
      className="grid size-10 place-items-center rounded-full text-ink-2 transition-colors duration-[var(--cn-duration-fast)] hover:bg-sunken hover:text-ink"
    >
      <Icon name={icon} />
    </button>
  );
}
