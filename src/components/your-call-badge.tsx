"use client";

import { useSyncExternalStore } from "react";
import { readCall, subscribeCalls } from "@/lib/calls-store";

/** "Your call: 40%" on a card, once you've made one. Renders nothing on the server and before hydration. */
export function YourCallBadge({ slug, template, format }: { slug: string; template: string; format: "en" | "fr" }) {
  const value = useSyncExternalStore(subscribeCalls, () => readCall(slug), () => null);
  if (value === null) return null;
  const pct = new Intl.NumberFormat(format === "fr" ? "fr-CA" : "en-CA", { style: "percent" }).format(value / 100);
  return (
    <span className="rounded-full border border-side-a px-2 py-0.5 text-caption font-semibold text-side-a-text tabular">
      {template.replace("{value}", pct)}
    </span>
  );
}
