/*
 * Screen: not found (a stale link, a moved question, a typo).
 * One message: this page isn't here, but everything else is. One action: go back to today's five.
 * The screen itself is NotFoundView. This file gives every 404 its own title, "Page not found · Cansensa" /
 * « Page introuvable · Cansensa », so it never shows the home title or the title of the page that 404'd.
 */
import type { Metadata } from "next";
import { NotFoundView } from "@/components/shell/not-found-view";
import { notFoundMetadata } from "@/lib/not-found-metadata";

/**
 * Next.js hands the not-found file the [locale] segment's params; anything unexpected falls back to the default locale.
 * This sets the server-rendered head. Pages that can 404 also return notFoundMetadata(), because Next.js sends the
 * page's own metadata to the browser too.
 */
export async function generateMetadata(props: { params?: Promise<{ locale?: string }> }): Promise<Metadata> {
  return notFoundMetadata((await props.params)?.locale);
}

export default function NotFound() {
  return <NotFoundView />;
}
