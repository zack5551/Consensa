import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase/admin";
import { noStore } from "@/lib/supabase/account-server";

/**
 * Health check for the uptime monitor (AEGIS). It answers 200 when the site is up and, once accounts are on, the
 * Montréal database answers too; 503 when the database doesn't. It returns only a status word: no versions, no
 * error text, no personal information, so it is safe to call from outside.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = adminSupabase();
  if (!admin) return NextResponse.json({ status: "ok", database: "off" }, { headers: noStore });
  const { error } = await admin.from("question_windows").select("slug", { head: true, count: "exact" }).limit(1);
  if (error) return NextResponse.json({ status: "degraded", database: "down" }, { status: 503, headers: noStore });
  return NextResponse.json({ status: "ok", database: "up" }, { headers: noStore });
}
