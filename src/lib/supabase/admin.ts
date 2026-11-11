import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabasePublic } from "./env";

let admin: SupabaseClient | null | undefined;

/**
 * The server's own client, with the secret key: it bypasses row-level security, so it is used only after the
 * server has checked who is asking. Never imported by a client component ("server-only" fails the build).
 */
export function adminSupabase(): SupabaseClient | null {
  if (admin !== undefined) return admin;
  const secret = process.env.SUPABASE_SECRET_KEY;
  admin = supabasePublic && secret && secret.length >= 20 ? createClient(supabasePublic.url, secret, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return admin;
}
