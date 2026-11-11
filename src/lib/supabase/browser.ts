"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabasePublic } from "./env";

let client: SupabaseClient | null = null;

/** The browser client, or null in preview mode. It only ever holds the publishable key. */
export function browserSupabase(): SupabaseClient | null {
  if (!supabasePublic) return null;
  client ??= createBrowserClient(supabasePublic.url, supabasePublic.key);
  return client;
}
