import { NextResponse, type NextRequest } from "next/server";
import { rateLimiter } from "@/lib/rate-limit";
import { newChallenge } from "@/lib/server/bot-check";
import { callerIp } from "@/lib/server/proxy-check";

/** At most 30 challenges a minute per caller on this server instance. The address is only a key in memory: never logged or stored. */
const allowChallenge = rateLimiter({ limit: 30, windowMs: 60_000 });

/** A fresh bot-check challenge (valid 10 minutes). 204 means the check is off here, so the browser skips it. */
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  if (!allowChallenge(callerIp(request.headers, Boolean(process.env.VERCEL)) ?? "unknown")) return NextResponse.json({ error: "slow down" }, { status: 429, headers: { ...headers, "Retry-After": "60" } });
  const challenge = await newChallenge();
  return challenge ? NextResponse.json(challenge, { headers }) : new NextResponse(null, { status: 204, headers });
}
