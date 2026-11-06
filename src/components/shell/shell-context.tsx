"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";

/**
 * The few strings that client-only screens need when they can't receive props: error.tsx and
 * not-found.tsx are rendered by Next.js without params. The layout fills this from the dictionary,
 * so only these small slices reach the browser, not the whole dictionary.
 */
export type ShellStrings = {
  locale: Locale;
  status: Dictionary["status"];
  notFound: Dictionary["notFound"];
};

const ShellContext = createContext<ShellStrings | null>(null);

export function ShellProvider({ value, children }: { value: ShellStrings; children: ReactNode }) {
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellStrings {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useShell() must be used inside the [locale] layout");
  return value;
}
