import { TRON_ADDRESS, type NetworkId } from "./tron/networks";

/** A token the user deployed or imported, remembered in this browser. */
export type SavedToken = {
  address: string;
  network: NetworkId;
  name: string;
  symbol: string;
  decimals: number;
  features?: { burn?: boolean; batch?: boolean; erc165?: boolean; timed?: boolean };
  txid?: string;
  addedAt: number;
  source: "deployed" | "imported";
};

export const TOKENS_KEY = "trc20-forge:tokens:v1";
export const TOKENS_EVENT = "trc20-forge:tokens-changed";

const NETWORKS: NetworkId[] = ["mainnet", "nile", "shasta"];

function isSavedToken(t: unknown): t is SavedToken {
  const x = t as SavedToken;
  return (
    !!x && typeof x === "object" && TRON_ADDRESS.test(x.address) && NETWORKS.includes(x.network) &&
    typeof x.name === "string" && typeof x.symbol === "string" &&
    Number.isInteger(x.decimals) && x.decimals >= 0 && x.decimals <= 77
  );
}

export function readTokens(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): SavedToken[] {
  try {
    const raw = JSON.parse(storage?.getItem(TOKENS_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter(isSavedToken) : [];
  } catch {
    return [];
  }
}

function write(list: SavedToken[], storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage) {
  try {
    storage?.setItem(TOKENS_KEY, JSON.stringify(list));
    if (typeof window !== "undefined") window.dispatchEvent(new Event(TOKENS_EVENT));
  } catch { /* storage unavailable */ }
}

const same = (a: Pick<SavedToken, "address" | "network">, b: Pick<SavedToken, "address" | "network">) => a.address === b.address && a.network === b.network;

/** Adds or updates (same address + network) and keeps newest first. */
export function saveToken(token: SavedToken, storage: Storage | undefined = globalThis.localStorage): SavedToken[] {
  if (!isSavedToken(token)) throw new Error("Invalid token record.");
  const list = [token, ...readTokens(storage).filter((t) => !same(t, token))];
  write(list, storage);
  return list;
}

export function removeToken(t: Pick<SavedToken, "address" | "network">, storage: Storage | undefined = globalThis.localStorage): SavedToken[] {
  const list = readTokens(storage).filter((x) => !same(x, t));
  write(list, storage);
  return list;
}
