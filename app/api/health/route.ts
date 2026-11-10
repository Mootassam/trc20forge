import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness check used by the desktop launcher to tell "our app is already running" from "port taken". */
export function GET() {
  return NextResponse.json({ app: "trc20-forge", ok: true });
}
