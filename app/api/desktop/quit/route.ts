import { NextResponse } from "next/server";
import { isDesktop, requestQuit } from "@/lib/desktop";

export const dynamic = "force-dynamic";

/**
 * Stops the desktop app (its window is hidden, so this is the "Quit" button). Only exists in the desktop
 * build, and only accepts requests from the app's own page: another website open in the browser can't
 * shut it down (cross-site POSTs carry a foreign Origin header).
 */
export function POST(req: Request) {
  if (!isDesktop()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  requestQuit();
  return NextResponse.json({ ok: true });
}
