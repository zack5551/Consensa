"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabasePublic } from "./env";

let client: Promise<SupabaseClient> | null = null;

/**
 * The browser client, or null in preview mode. It only ever holds the publishable key. Supabase is loaded only when
 * someone actually signs in, so it stays out of the first-load bundle (perf budget: 150 kB per route).
 */
export function browserSupabase(): Promise<SupabaseClient | null> {
  const config = supabasePublic;
  if (!config) return Promise.resolve(null);
  client ??= import("@supabase/ssr").then(({ createBrowserClient }) => createBrowserClient(config.url, config.key));
  return client;
}
