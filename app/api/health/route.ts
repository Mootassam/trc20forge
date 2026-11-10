import { NextResponse } from "next/server";
import { isDesktop, markSeen } from "@/lib/desktop";

export const dynamic = "force-dynamic";

/**
 * Liveness check. The desktop launcher uses it to tell "our app is already running" from "port taken",
 * and open app tabs call it as a heartbeat so the hidden desktop app can stop itself once they're closed.
 */
export function GET() {
  markSeen();
  return NextResponse.json({ app: "trc20-forge", ok: true, desktop: isDesktop() }, { headers: { "cache-control": "no-store" } });
}
