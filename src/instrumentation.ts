/**
 * Server errors go to the in-house error log in the Montréal database (src/lib/error-report.ts): scrubbed, no
 * request details beyond the path. Never throws: a failing report must not break the page.
 */
import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (error, request) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const [{ adminSupabase }, { toErrorEvent }] = await Promise.all([import("@/lib/supabase/admin"), import("@/lib/error-report")]);
    const admin = adminSupabase();
    if (!admin) return;
    const err = error instanceof Error ? error : new Error(String(error));
    const digest = (err as Error & { digest?: unknown }).digest;
    await admin
      .from("error_events")
      .insert(toErrorEvent("server", { route: request.path, name: err.name, message: err.message, stack: err.stack, digest: typeof digest === "string" ? digest : undefined }));
  } catch {
    // Reporting is best effort.
  }
};
