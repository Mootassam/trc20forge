"use client";

import type { AbiItem } from "../token/compile";
import { FREE_DAILY_BANDWIDTH, ORIGIN_ENERGY_LIMIT, type AccountResources } from "./cost";
import { NETWORKS, networkFromHost, type NetworkId } from "./networks";
import { MAX_TIMED_SECONDS, MIN_TIMED_SECONDS } from "../token/schema";

/** Minimal surface of the TronWeb instance TronLink injects. */
type ContractMethod = {
  call(): Promise<unknown>;
  send(options?: { feeLimit?: number; callValue?: number; shouldPollResponse?: boolean }): Promise<unknown>;
};

type TronWebLike = {
  ready?: boolean;
  defaultAddress?: { base58?: string | false; hex?: string | false };
  fullNode?: { host?: string };
  address: { fromHex(hex: string): string };
  transactionBuilder: {
    createSmartContract(
      options: {
        abi: AbiItem[]; bytecode: string; feeLimit: number; callValue: number;
        userFeePercentage: number; originEnergyLimit: number; name: string;
      },
      issuer: string,
    ): Promise<{ txID: string; contract_address?: string; raw_data: unknown }>;
  };
  trx: {
    sign(tx: unknown): Promise<unknown>;
    sendRawTransaction(signed: unknown): Promise<{ result?: boolean; txid?: string; code?: string; message?: string }>;
    getAccount(address: string): Promise<{ address?: string; balance?: number; type?: string }>;
    sendTransaction(to: string, amountSun: number): Promise<{ result?: boolean; txid?: string; code?: string; message?: string; transaction?: { txID?: string } }>;
    getContract?(address: string): Promise<{ contract_address?: string; bytecode?: string } | null | undefined>;
    getAccountResources(address: string): Promise<{
      EnergyLimit?: number; EnergyUsed?: number; freeNetLimit?: number; freeNetUsed?: number; NetLimit?: number; NetUsed?: number;
    }>;
    getTransactionInfo(txid: string): Promise<{
      id?: string; blockNumber?: number; contract_address?: string;
      receipt?: { result?: string; energy_usage_total?: number; net_fee?: number; energy_fee?: number };
      fee?: number; result?: string; resMessage?: string;
    }>;
  };
  contract(abi: AbiItem[], address: string): Promise<Record<string, (...args: unknown[]) => ContractMethod>> | Record<string, (...args: unknown[]) => ContractMethod>;
  isAddress?(address: string): boolean;
};

type TronLinkLike = { ready?: boolean; tronWeb?: TronWebLike; request(args: { method: string; params?: unknown }): Promise<unknown> };

declare global {
  interface Window {
    tronLink?: TronLinkLike;
    tronWeb?: TronWebLike;
  }
}

export type WalletState =
  | { status: "unavailable" }
  | { status: "locked" }
  | { status: "connected"; address: string; network: NetworkId | null; host: string };

export function getTronWeb(): TronWebLike | null {
  if (typeof window === "undefined") return null;
  return window.tronLink?.tronWeb ?? window.tronWeb ?? null;
}

export function readWallet(): WalletState {
  if (typeof window === "undefined" || (!window.tronLink && !window.tronWeb)) return { status: "unavailable" };
  const tw = getTronWeb();
  const address = tw?.defaultAddress?.base58;
  if (!tw || !address) return { status: "locked" };
  const host = tw.fullNode?.host ?? "";
  return { status: "connected", address, network: networkFromHost(host), host };
}

/** Asks TronLink for permission (TIP-1102). Resolves with the new wallet state. */
export async function connectWallet(): Promise<WalletState> {
  const tl = window.tronLink;
  if (!tl) {
    if (window.tronWeb) return readWallet();
    throw new Error("TronLink is not installed. Install the TronLink browser extension, then reload this page.");
  }
  const res = (await tl.request({ method: "tron_requestAccounts" })) as { code?: number; message?: string } | undefined;
  if (res && typeof res === "object" && "code" in res && res.code !== 200) {
    if (res.code === 4001) throw new Error("Connection request was rejected in TronLink.");
    throw new Error(res.message || "TronLink is locked. Unlock it and try again.");
  }
  // TronLink injects the address shortly after approval.
  for (let i = 0; i < 20; i++) {
    const s = readWallet();
    if (s.status === "connected") return s;
    await new Promise((r) => setTimeout(r, 150));
  }
  return readWallet();
}

/** Reads balance and resources through TronLink's own (authenticated) node, avoiding public rate limits. */
export async function readAccountResources(address: string): Promise<AccountResources> {
  const tw = getTronWeb();
  if (!tw) throw new Error("TronLink not available.");
  const [acc, res] = await Promise.all([tw.trx.getAccount(address), tw.trx.getAccountResources(address)]);
  return {
    activated: Boolean(acc?.address),
    balanceSun: Math.max(0, Number(acc?.balance ?? 0)),
    energyAvailable: Math.max(0, (res?.EnergyLimit ?? 0) - (res?.EnergyUsed ?? 0)),
    bandwidthAvailable:
      Math.max(0, (res?.NetLimit ?? 0) - (res?.NetUsed ?? 0)) +
      Math.max(0, (res?.freeNetLimit ?? FREE_DAILY_BANDWIDTH) - (res?.freeNetUsed ?? 0)),
  };
}

/**
 * Asks TronLink to switch to another TRON network. TronLink shows its own
 * confirmation popup; the user approves it there.
 */
export async function switchNetwork(network: NetworkId): Promise<void> {
  const tl = window.tronLink;
  if (!tl) throw new Error("TronLink is not installed.");
  try {
    const res = (await tl.request({ method: "wallet_switchEthereumChain", params: [{ chainId: NETWORKS[network].chainId }] })) as
      | { code?: number; message?: string }
      | null
      | undefined;
    if (res && typeof res === "object" && typeof res.code === "number" && res.code !== 200) throw new Error(res.message || `TronLink refused (code ${res.code}).`);
  } catch (e) {
    const msg = (e as { message?: string })?.message ?? String(e);
    const manual = `Click the TronLink icon → the network name at the top → ${NETWORKS[network].label}.`;
    if (/reject|denied|cancel|4001/i.test(msg)) throw new Error(`Network switch was rejected in TronLink. ${manual}`);
    if (/unknown method|not supported|unsupported/i.test(msg)) throw new Error(`Your TronLink version can't switch networks for websites. Switch it manually: ${manual}`);
    throw new Error(`${msg.replace(/\.?\s*$/, ".")} Switch manually: ${manual}`);
  }
}

/**
 * Asks TronLink to add a TRC-20 token to the user's asset list (TIP-1102 `wallet_watchAsset`).
 * TronLink reads name/symbol/decimals from the contract itself and shows a confirm popup.
 */
type Requester = { request(args: { method: string; params?: unknown }): Promise<unknown> };

/** Every request-capable provider TronLink may inject: TIP-1193 `window.tron` first, then legacy objects. */
export function tronProviders(w: Record<string, unknown> = typeof window !== "undefined" ? (window as never) : {}): Requester[] {
  const out: Requester[] = [];
  for (const key of ["tron", "tronLink", "tronWeb"]) {
    const p = w[key] as Partial<Requester> | undefined;
    if (p && typeof p.request === "function" && !out.includes(p as Requester)) out.push(p as Requester);
  }
  return out;
}

/**
 * Asks the wallet to add a TRC-20 token to the user's asset list (`wallet_watchAsset`, TronLink docs).
 * Works on TRON mainnet and Nile. Tries each injected provider until one supports the method.
 */
export async function addTokenToWallet(address: string, providers: Requester[] = tronProviders()): Promise<void> {
  if (!providers.length) throw new Error("TronLink is not installed.");
  let last = "";
  for (const p of providers) {
    try {
      const res = await p.request({ method: "wallet_watchAsset", params: { type: "trc20", options: { address } } });
      if (res === false) throw new Error("TronLink did not add the token.");
      const code = res && typeof res === "object" ? (res as { code?: unknown }).code : undefined;
      if (typeof code === "number" && code !== 200) throw new Error((res as { message?: string }).message || `Wallet refused (code ${code}).`);
      return;
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? String(e);
      if (/reject|denied|cancel|4001/i.test(msg)) throw new Error("You cancelled the request in TronLink.");
      last = msg; // unsupported on this provider: try the next one
    }
  }
  throw new Error(/unknown method|not supported|unsupported/i.test(last) ? "Your TronLink version can't add tokens from websites." : last || "Your wallet did not add the token.");
}

export type DeployProgress =
  | { phase: "building" }
  | { phase: "signing" }
  | { phase: "broadcasting" }
  | { phase: "confirming"; txid: string; address: string }
  | { phase: "done"; txid: string; address: string; energyUsed?: number; feeSun?: number; checked: boolean }
  | { phase: "failed"; error: string; txid?: string; address?: string };

function hexToUtf8(hex: string): string {
  try {
    return decodeURIComponent(hex.replace(/(..)/g, "%$1"));
  } catch {
    return hex;
  }
}

function humanError(e: unknown): string {
  const msg = typeof e === "string" ? e : (e as { message?: string })?.message ?? JSON.stringify(e);
  if (/confirmation declined|cancel|reject/i.test(msg)) return "Transaction was rejected in TronLink.";
  if (/balance is not sufficient|not enough|insufficient/i.test(msg)) return "Not enough TRX to pay the network fee.";
  if (/does not exist|account.*not.*activ/i.test(msg)) return "This account is not activated on this network. Send it some TRX first.";
  return msg;
}

/**
 * Deploys the compiled token through TronLink, then waits for the receipt and
 * reads totalSupply() back from the chain as a final sanity check.
 */
export async function deployToken(
  opts: { abi: AbiItem[]; bytecode: string; name: string; feeLimitSun: number; expectedSupplyRaw: bigint },
  onProgress: (p: DeployProgress) => void,
): Promise<void> {
  const tw = getTronWeb();
  const owner = tw?.defaultAddress?.base58;
  if (!tw || !owner) throw new Error("Connect TronLink first.");

  let txid: string | undefined;
  let address: string | undefined;
  try {
    onProgress({ phase: "building" });
    const tx = await tw.transactionBuilder.createSmartContract(
      {
        abi: opts.abi,
        bytecode: opts.bytecode,
        feeLimit: opts.feeLimitSun,
        callValue: 0,
        userFeePercentage: 100, // token users pay their own energy; deployer is never drained
        originEnergyLimit: ORIGIN_ENERGY_LIMIT,
        name: opts.name,
      },
      owner,
    );
    if (!tx.contract_address) throw new Error("TronWeb did not return a contract address.");
    address = tw.address.fromHex(tx.contract_address);

    onProgress({ phase: "signing" });
    const signed = await tw.trx.sign(tx);

    onProgress({ phase: "broadcasting" });
    const sent = await tw.trx.sendRawTransaction(signed);
    if (!sent.result) throw new Error(sent.message ? hexToUtf8(sent.message) : sent.code || "Broadcast failed.");
    txid = sent.txid ?? tx.txID;

    onProgress({ phase: "confirming", txid, address });
    const deadline = Date.now() + 120_000;
    let info: Awaited<ReturnType<TronWebLike["trx"]["getTransactionInfo"]>> = {};
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      info = await tw.trx.getTransactionInfo(txid).catch(() => ({}));
      if (info?.id) break;
    }
    if (!info?.id) throw new Error("Not confirmed after 2 minutes. Check the transaction on Tronscan; it may still succeed.");
    const result = info.receipt?.result;
    if (result && result !== "SUCCESS") {
      const why = info.resMessage ? hexToUtf8(info.resMessage) : result;
      throw new Error(result === "OUT_OF_ENERGY" ? "Ran out of energy. Increase the fee limit and deploy again." : `Deployment failed: ${why}`);
    }

    let checked = false;
    try {
      const c = await tw.contract(opts.abi, address);
      const supply = await c.totalSupply().call();
      checked = BigInt(String((supply as { toString(): string }).toString())) === opts.expectedSupplyRaw;
    } catch {
      /* node may lag a block behind; the receipt already proved success */
    }

    onProgress({
      phase: "done", txid, address, checked,
      energyUsed: info.receipt?.energy_usage_total,
      feeSun: info.fee,
    });
  } catch (e) {
    onProgress({ phase: "failed", error: humanError(e), txid, address });
  }
}

// ---------------------------------------------------------------------------
// Working with existing tokens ("My tokens")
// ---------------------------------------------------------------------------

/** Minimal standard TRC-20 ABI: enough to read metadata/balances and transfer for any TRC-20. */
export const TRC20_ABI: AbiItem[] = [
  { type: "function", name: "name", inputs: [], outputs: [{ name: "", type: "string" }], stateMutability: "view" },
  { type: "function", name: "symbol", inputs: [], outputs: [{ name: "", type: "string" }], stateMutability: "view" },
  { type: "function", name: "decimals", inputs: [], outputs: [{ name: "", type: "uint8" }], stateMutability: "view" },
  { type: "function", name: "totalSupply", inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "transfer", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable" },
];

const toBig = (v: unknown): bigint => {
  const s = typeof v === "bigint" ? v.toString() : String((v as { toString(): string })?.toString?.() ?? v);
  if (!/^\d+$/.test(s)) throw new Error(`Unexpected number from contract: ${s}`);
  return BigInt(s);
};

async function token(address: string) {
  const tw = getTronWeb();
  if (!tw) throw new Error("Connect TronLink first.");
  return { tw, c: await tw.contract(TRC20_ABI, address) };
}

/** Reads name/symbol/decimals/totalSupply from the chain TronLink is connected to. */
export async function readTokenInfo(address: string): Promise<{ name: string; symbol: string; decimals: number; totalSupply: bigint }> {
  const { c } = await token(address);
  try {
    const [name, symbol, decimals, totalSupply] = await Promise.all([c.name().call(), c.symbol().call(), c.decimals().call(), c.totalSupply().call()]);
    const d = Number(toBig(decimals));
    if (!Number.isInteger(d) || d > 77) throw new Error("bad decimals");
    return { name: String(name), symbol: String(symbol), decimals: d, totalSupply: toBig(totalSupply) };
  } catch {
    throw new Error("No TRC-20 token found at this address on the network TronLink is using. Check the address and the network.");
  }
}

export async function readBalance(address: string, owner: string): Promise<bigint> {
  const { c } = await token(address);
  return toBig(await c.balanceOf(owner).call());
}

/**
 * True when `address` holds smart-contract code (e.g. a token contract). Tokens sent to a contract
 * that wasn't built to receive them are stuck forever, so the UI asks for explicit confirmation.
 */
export async function isContractAddress(address: string): Promise<boolean> {
  const tw = getTronWeb();
  if (!tw) return false;
  try {
    const acc = await tw.trx.getAccount(address);
    if (acc?.type === "Contract") return true;
  } catch { /* fall through */ }
  try {
    const c = await tw.trx.getContract?.(address);
    return !!(c && (c.contract_address || c.bytecode));
  } catch {
    return false;
  }
}

export type SendProgress =
  | { phase: "signing" }
  | { phase: "confirming"; txid: string }
  | { phase: "done"; txid: string; feeSun?: number }
  | { phase: "failed"; error: string; txid?: string };

/** Polls for the receipt of `txid` (up to 90 s) and throws a readable error if it failed on-chain. */
async function waitForReceipt(tw: TronWebLike, txid: string): Promise<number | undefined> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const info = await tw.trx.getTransactionInfo(txid).catch(() => ({} as Awaited<ReturnType<TronWebLike["trx"]["getTransactionInfo"]>>));
    if (info?.id) {
      const result = info.receipt?.result;
      if (result && result !== "SUCCESS") {
        const reason = info.resMessage ? hexToUtf8(info.resMessage) : "";
        throw new Error(result === "OUT_OF_ENERGY" ? "Ran out of energy. Keep a few TRX in the wallet and try again." : `Transaction failed: ${reason || result}`);
      }
      return info.fee;
    }
  }
  throw new Error("Not confirmed after 90 seconds. Check the transaction on Tronscan; it may still succeed.");
}

const txidOf = (res: unknown): string | undefined =>
  typeof res === "string" ? res : (res as { txid?: string })?.txid ?? (res as { transaction?: { txID?: string } })?.transaction?.txID;

/** Sends one contract call through TronLink, then waits for the on-chain receipt. */
async function runTx(tw: TronWebLike, method: ContractMethod, feeLimitSun: number, onProgress: (p: SendProgress) => void): Promise<void> {
  let txid: string | undefined;
  try {
    onProgress({ phase: "signing" });
    txid = txidOf(await method.send({ feeLimit: feeLimitSun, shouldPollResponse: false }));
    if (!txid) throw new Error("TronLink did not return a transaction id.");
    onProgress({ phase: "confirming", txid });
    const feeSun = await waitForReceipt(tw, txid);
    onProgress({ phase: "done", txid, feeSun });
  } catch (e) {
    onProgress({ phase: "failed", error: humanError(e), txid });
  }
}

/**
 * Sends `raw` units of a TRC-20 to `to`. TronLink shows the transaction and the user signs it.
 * The fee limit only caps energy burn; a normal transfer uses ~1-3 TRX.
 *
 * With `durationSec` (tokens deployed with "Timed sends" only) the tokens are locked for the
 * recipient instead: they claim them before the expiry, otherwise the sender reclaims them.
 */
export async function sendToken(
  opts: { token: string; to: string; raw: bigint; feeLimitSun?: number; allowSelf?: boolean; allowContract?: boolean; durationSec?: number },
  onProgress: (p: SendProgress) => void,
): Promise<void> {
  let tw: TronWebLike;
  let method: ContractMethod;
  try {
    const t = await token(opts.token);
    tw = t.tw;
    const from = tw.defaultAddress?.base58;
    if (!from) throw new Error("Connect TronLink first.");
    if (tw.isAddress && !tw.isAddress(opts.to)) throw new Error("Recipient is not a valid TRON address.");
    if (opts.to === opts.token) throw new Error("Don't send tokens to the token contract itself; they would be rejected.");
    if (opts.to === from && !opts.allowSelf) throw new Error("That's your own wallet. Tick \"send to myself\" to confirm a self-transfer (it only costs a fee).");
    if (!opts.allowContract && (await isContractAddress(opts.to))) {
      throw new Error("The recipient is a smart contract, not a wallet. Tokens sent to most contracts are lost forever.");
    }
    if (opts.raw <= 0n) throw new Error("Amount must be greater than 0.");
    const bal = toBig(await t.c.balanceOf(from).call());
    if (bal < opts.raw) throw new Error("Amount is more than your balance.");

    if (opts.durationSec !== undefined) {
      const d = opts.durationSec;
      if (!Number.isInteger(d) || d < MIN_TIMED_SECONDS || d > MAX_TIMED_SECONDS) throw new Error("Expiry must be between 1 minute and 365 days.");
      const tc = await tw.contract(TIMED_ABI, opts.token);
      method = tc.sendTimed(opts.to, opts.raw.toString(), d);
    } else {
      method = t.c.transfer(opts.to, opts.raw.toString());
    }
  } catch (e) {
    onProgress({ phase: "failed", error: humanError(e) });
    return;
  }
  // sendTimed writes a new record (3 storage slots), so it gets more fee headroom than a transfer.
  await runTx(tw, method, opts.feeLimitSun ?? (opts.durationSec !== undefined ? 100_000_000 : 50_000_000), onProgress);
}

// ---------------------------------------------------------------------------
// Timed sends (tokens deployed with the "Timed sends" feature)
// ---------------------------------------------------------------------------

const u256 = (name: string) => ({ name, type: "uint256" });
export const TIMED_ABI: AbiItem[] = [
  { type: "function", name: "sendTimed", inputs: [{ name: "to", type: "address" }, u256("value"), u256("duration")], outputs: [u256("id")], stateMutability: "nonpayable" },
  { type: "function", name: "claimTimed", inputs: [u256("id")], outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable" },
  { type: "function", name: "reclaimTimed", inputs: [u256("id")], outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable" },
  { type: "function", name: "timedSendCount", inputs: [], outputs: [u256("")], stateMutability: "view" },
  {
    type: "function", name: "timedSend", inputs: [u256("id")], stateMutability: "view",
    outputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, u256("value"), u256("expiresAt"), { name: "status", type: "uint8" }],
  },
];

export type TimedSendStatus = "pending" | "claimed" | "reclaimed";
export type TimedSendRecord = { id: number; from: string; to: string; value: bigint; expiresAt: number; status: TimedSendStatus };

/** True when the token at `address` was deployed with the "Timed sends" feature. */
export async function supportsTimedSends(address: string): Promise<boolean> {
  const tw = getTronWeb();
  if (!tw) return false;
  try {
    const c = await tw.contract(TIMED_ABI, address);
    toBig(await c.timedSendCount().call());
    return true;
  } catch {
    return false;
  }
}

const toBase58 = (tw: TronWebLike, v: unknown): string => {
  const s = String(v);
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(s)) return s;
  const hex = s.replace(/^0x/, "");
  return tw.address.fromHex(hex.length === 40 ? `41${hex}` : hex);
};

/** Reads the most recent timed sends (newest first) that involve `owner`, as sender or recipient. */
export async function listTimedSends(address: string, owner: string, scan = 60): Promise<TimedSendRecord[]> {
  const tw = getTronWeb();
  if (!tw) throw new Error("Connect TronLink first.");
  const c = await tw.contract(TIMED_ABI, address);
  const count = Number(toBig(await c.timedSendCount().call()));
  const ids = Array.from({ length: Math.min(count, scan) }, (_, i) => count - 1 - i);
  const rows = await Promise.all(
    ids.map(async (id) => {
      const r = (await c.timedSend(id).call()) as Record<string | number, unknown>;
      const status = Number(toBig(r.status ?? r[4]));
      return {
        id,
        from: toBase58(tw, r.from ?? r[0]),
        to: toBase58(tw, r.to ?? r[1]),
        value: toBig(r.value ?? r[2]),
        expiresAt: Number(toBig(r.expiresAt ?? r[3])),
        status: (status === 2 ? "claimed" : status === 3 ? "reclaimed" : "pending") as TimedSendStatus,
      };
    }),
  );
  return rows.filter((r) => r.from === owner || r.to === owner);
}

/** Recipient claims (before expiry) or sender reclaims (after expiry) timed send `id`. */
export async function settleTimedSend(address: string, id: number, action: "claim" | "reclaim", onProgress: (p: SendProgress) => void): Promise<void> {
  const tw = getTronWeb();
  if (!tw) return onProgress({ phase: "failed", error: "Connect TronLink first." });
  try {
    const c = await tw.contract(TIMED_ABI, address);
    await runTx(tw, action === "claim" ? c.claimTimed(id) : c.reclaimTimed(id), 50_000_000, onProgress);
  } catch (e) {
    onProgress({ phase: "failed", error: humanError(e) });
  }
}

// ---------------------------------------------------------------------------
// Test-wallet top-up (testnets only)
// ---------------------------------------------------------------------------

/** 1 TRX = 1,000,000 sun. */
export const SUN_PER_TRX = 1_000_000n;

/** Native TRX balance of `address` in sun (0 for an account that was never activated). */
export async function readTrxBalance(address: string): Promise<bigint> {
  const tw = getTronWeb();
  if (!tw) throw new Error("Connect TronLink first.");
  const acc = await tw.trx.getAccount(address);
  return BigInt(Math.max(0, Math.trunc(Number(acc?.balance ?? 0))));
}

/**
 * Throws unless TronLink is on a known TESTNET. The top-up tool moves coins between your own test
 * wallets; this guard makes sure it can never run against mainnet, whatever the UI shows.
 */
export function assertTestnet(): NetworkId {
  const w = readWallet();
  if (w.status !== "connected") throw new Error("Connect TronLink first.");
  if (!w.network || !NETWORKS[w.network].testnet) throw new Error("Top-up works on test networks only. Switch TronLink to Nile Testnet.");
  return w.network;
}

/** Sends native TRX (testnets only). TronLink shows the transfer and the user signs it. */
export async function sendTrx(opts: { to: string; sun: bigint }, onProgress: (p: SendProgress) => void): Promise<void> {
  let txid: string | undefined;
  try {
    assertTestnet();
    const tw = getTronWeb()!;
    const from = tw.defaultAddress?.base58;
    if (!from) throw new Error("Connect TronLink first.");
    if (tw.isAddress && !tw.isAddress(opts.to)) throw new Error("Recipient is not a valid TRON address.");
    if (opts.to === from) throw new Error("That's your own wallet.");
    if (opts.sun <= 0n) throw new Error("Amount must be greater than 0.");
    if (opts.sun > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Amount is too large.");
    if ((await readTrxBalance(from)) < opts.sun) throw new Error("Amount is more than your TRX balance.");
    onProgress({ phase: "signing" });
    const res = await tw.trx.sendTransaction(opts.to, Number(opts.sun));
    if (res && res.result === false) throw new Error(res.message ? hexToUtf8(res.message) : res.code || "The network rejected the transfer.");
    txid = txidOf(res);
    if (!txid) throw new Error("TronLink did not return a transaction id.");
    onProgress({ phase: "confirming", txid });
    const feeSun = await waitForReceipt(tw, txid);
    onProgress({ phase: "done", txid, feeSun });
  } catch (e) {
    onProgress({ phase: "failed", error: humanError(e), txid });
  }
}
