import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabasePublic } from "./env";

/** A per-request client that acts as the signed-in person (their session cookie), or null in preview mode. */
export async function serverSupabase(): Promise<SupabaseClient | null> {
  if (!supabasePublic) return null;
  const store = await cookies();
  return createServerClient(supabasePublic.url, supabasePublic.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          /* called from a Server Component: the middleware refreshes the session instead */
        }
      },
    },
  });
}
