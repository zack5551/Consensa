import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { isLocale, locales } from "@/i18n/config";
import { inter, manrope } from "@/styles/fonts";
import "@/styles/globals.css";

// No `dynamicParams = false` here: Next applies it to every page below this layout, so a question, event or embed
// published after the build would 404 instead of rendering on first visit (zack's 404 on new questions, 2026-11-27).
// An unknown locale still gets a 404 from the check in the layout below.

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

/** Bare root layout for the media embed widget: no header, nav or footer, so it fits inside a publisher's iframe. */
export default async function EmbedLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={`${locale}-CA`} className={`${manrope.variable} ${inter.variable}`}>
      <body className="bg-transparent p-2">{children}</body>
    </html>
  );
}
