import type { SavedToken } from "../token-store";
import { reservedReason } from "../token/schema";
import { NETWORKS, TRON_ADDRESS, type NetworkId } from "./networks";

/**
 * Coins the "Top up a test wallet" tool can send: native TRX, the network's OFFICIAL test tokens,
 * and the user's own saved tokens. Everything here only ever runs on testnets.
 */
export type TopUpAsset =
  | { kind: "trx"; key: "TRX"; symbol: "TRX"; name: string; decimals: 6; presets: string[] }
  | { kind: "trc20"; key: string; address: string; symbol: string; name: string; decimals: number; official: boolean; presets: string[]; faucet?: string };

/**
 * Official test tokens per testnet, verified on-chain (symbol / name / decimals read from the contract).
 * Nile USDT is Tether's test deployment that the Nile faucet hands out; it has no value.
 */
export const OFFICIAL_TEST_TOKENS: Partial<Record<NetworkId, { address: string; symbol: string; name: string; decimals: number }[]>> = {
  nile: [{ address: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf", symbol: "USDT", name: "Tether USD (Nile test)", decimals: 6 }],
};

/** Rough per-transfer fee budget kept back so the TRX top-up can't leave too little for the token transfers. */
export const FEE_RESERVE_TRX = { perToken: 15, base: 2 } as const;

/**
 * Builds the asset list for `network` (empty on mainnet). Saved tokens whose name or symbol imitates a
 * real asset (USDT, TETHER, USDC, …) are left out: only the official test contract may appear as USDT,
 * so a look-alike can never be handed out as if it were the real test coin.
 */
export function topUpAssets(network: NetworkId, saved: SavedToken[]): TopUpAsset[] {
  if (!NETWORKS[network].testnet) return [];
  const official = OFFICIAL_TEST_TOKENS[network] ?? [];
  const officialAddrs = new Set(official.map((t) => t.address));
  const out: TopUpAsset[] = [{ kind: "trx", key: "TRX", symbol: "TRX", name: "TRON (test TRX)", decimals: 6, presets: ["10", "50", "100"] }];
  for (const t of official) {
    out.push({ kind: "trc20", key: t.address, ...t, official: true, presets: ["100", "1000"], faucet: NETWORKS[network].faucet });
  }
  const seen = new Set<string>();
  for (const t of saved) {
    if (t.network !== network || !TRON_ADDRESS.test(t.address) || officialAddrs.has(t.address) || seen.has(t.address)) continue;
    if (reservedReason(t.name, t.symbol)) continue;
    seen.add(t.address);
    out.push({ kind: "trc20", key: t.address, address: t.address, symbol: t.symbol, name: t.name, decimals: t.decimals, official: false, presets: ["100", "1000", "10000"] });
  }
  return out;
}

/** Saved tokens left out of the top-up because they imitate a real asset (shown to the user as a note). */
export function hiddenLookalikes(network: NetworkId, saved: SavedToken[]): SavedToken[] {
  const official = new Set((OFFICIAL_TEST_TOKENS[network] ?? []).map((t) => t.address));
  return saved.filter((t) => t.network === network && !official.has(t.address) && !!reservedReason(t.name, t.symbol));
}

/** TRX (in sun) to keep in the sender's wallet for the fees of `tokenTransfers` TRC-20 sends. */
export function feeReserveSun(tokenTransfers: number): bigint {
  return BigInt(FEE_RESERVE_TRX.base + FEE_RESERVE_TRX.perToken * tokenTransfers) * 1_000_000n;
}

// ---- recent recipients (a per-browser convenience only) ----------------------------------------

export const RECENT_KEY = "trc20-forge:topup-recipients:v1";
const MAX_RECENT = 5;

export function readRecent(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): string[] {
  try {
    const raw = JSON.parse(storage?.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((a): a is string => typeof a === "string" && TRON_ADDRESS.test(a)).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function rememberRecent(address: string, storage: Pick<Storage, "getItem" | "setItem"> | undefined = globalThis.localStorage): string[] {
  if (!TRON_ADDRESS.test(address)) return readRecent(storage);
  const list = [address, ...readRecent(storage).filter((a) => a !== address)].slice(0, MAX_RECENT);
  try {
    storage?.setItem(RECENT_KEY, JSON.stringify(list));
  } catch { /* storage unavailable */ }
  return list;
}
