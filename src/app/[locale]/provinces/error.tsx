"use client";

import { RouteError } from "@/components/route-states";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError reset={reset} />;
}
