import { NextResponse, type NextRequest } from "next/server";
import { browserErrorSchema, toErrorEvent } from "@/lib/error-report";
import { rateLimiter } from "@/lib/rate-limit";
import { adminSupabase } from "@/lib/supabase/admin";
import { noStore, sameOrigin } from "@/lib/supabase/account-server";

/** Error reports from our own pages (see src/lib/error-report.ts). One instance-wide budget: no IP is read or kept. */
const allowReport = rateLimiter({ limit: 30, windowMs: 60_000 });

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  if (!allowReport("all")) return new NextResponse(null, { status: 204, headers: noStore });
  const parsed = browserErrorSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400, headers: noStore });
  const admin = adminSupabase();
  if (admin) await admin.from("error_events").insert(toErrorEvent("browser", parsed.data));
  return new NextResponse(null, { status: 204, headers: noStore });
}
