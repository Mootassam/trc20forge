import type { NetworkId } from "./networks";
import { TRON_ADDRESS, ZERO_ADDRESS_BASE58 } from "./networks";

/** One TRC-20 transfer of a single token, as shown in "My tokens" → History. */
export type Transfer = { txid: string; at: number; from: string; to: string; value: string };

const TXID = /^[0-9a-f]{64}$/i;

/**
 * Validates TronGrid's `/v1/accounts/{owner}/transactions/trc20` response and keeps only
 * well-formed transfers of `token` (the indexer response is treated as untrusted input).
 */
export function parseHistory(json: unknown, token: string): Transfer[] {
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const out: Transfer[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const info = r.token_info as { address?: unknown } | undefined;
    if (info?.address !== token) continue;
    const { transaction_id: txid, block_timestamp: at, from, to, value } = r;
    if (typeof txid !== "string" || !TXID.test(txid)) continue;
    if (typeof at !== "number" || typeof value !== "string" || !/^\d+$/.test(value)) continue;
    if (typeof from !== "string" || typeof to !== "string" || !TRON_ADDRESS.test(from) || !TRON_ADDRESS.test(to)) continue;
    out.push({ txid, at, from, to, value });
  }
  return out;
}

export type Direction = "in" | "out" | "self" | "created";

/** How a transfer looks from `owner`'s point of view. */
export function directionOf(t: Transfer, owner: string): Direction {
  if (t.from === ZERO_ADDRESS_BASE58) return "created";
  if (t.from === owner && t.to === owner) return "self";
  return t.to === owner ? "in" : "out";
}

export async function fetchHistory(network: NetworkId, token: string, owner: string): Promise<Transfer[]> {
  const res = await fetch("/api/history", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ network, token, owner }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { transfers?: Transfer[]; error?: string };
  if (!res.ok || !body.transfers) throw new Error(body.error ?? "Couldn't load the history.");
  return body.transfers;
}
