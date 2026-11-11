import { publicSupabase } from "./config";

/** Read by name so Next inlines the public values into the browser bundle. */
export const supabasePublic = publicSupabase({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

/** True when real accounts are on. False in preview, CI and local dev without keys. */
export const accountsEnabled = supabasePublic !== null;
