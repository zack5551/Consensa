import { NextResponse } from "next/server";
import { newChallenge } from "@/lib/server/bot-check";

/** A fresh bot-check challenge (valid 10 minutes). 204 means the check is off here, so the browser skips it. */
export async function GET() {
  const challenge = await newChallenge();
  const headers = { "Cache-Control": "no-store" };
  return challenge ? NextResponse.json(challenge, { headers }) : new NextResponse(null, { status: 204, headers });
}
