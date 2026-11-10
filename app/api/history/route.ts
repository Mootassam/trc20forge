import { NextResponse } from "next/server";
import { z } from "zod";
import { NETWORKS, TRON_ADDRESS } from "@/lib/tron/networks";
import { parseHistory } from "@/lib/tron/history";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  network: z.enum(["mainnet", "nile", "shasta"]),
  token: z.string().regex(TRON_ADDRESS),
  owner: z.string().regex(TRON_ADDRESS),
});

/**
 * Recent TRC-20 transfers of one token for one wallet, from TronGrid's indexer.
 * Proxied server-side so the browser isn't hit by CORS or keyless rate limits directly.
 */
export async function POST(req: Request) {
  const parsed = querySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid history request." }, { status: 400 });
  const { network, token, owner } = parsed.data;

  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.TRONGRID_API_KEY) headers["TRON-PRO-API-KEY"] = process.env.TRONGRID_API_KEY;
  const path = `/v1/accounts/${owner}/transactions/trc20?contract_address=${token}&limit=50&order_by=block_timestamp,desc`;

  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    try {
      const res = await fetch(NETWORKS[network].api + path, { headers, signal: AbortSignal.timeout(10_000), cache: "no-store" });
      lastStatus = res.status;
      if (res.ok) return NextResponse.json({ transfers: parseHistory(await res.json(), token) });
      if (res.status !== 429 && res.status < 500) break;
    } catch {
      lastStatus = 0;
    }
  }
  const error = lastStatus === 429
    ? "TronGrid is rate-limiting requests. Wait a minute and refresh, or set TRONGRID_API_KEY in .env.local."
    : "Couldn't load the history from TronGrid right now. Try again in a moment.";
  return NextResponse.json({ error }, { status: 502 });
}
