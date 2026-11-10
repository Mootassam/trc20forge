// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedToken } from "@/lib/token-store";
import { feeReserveSun, hiddenLookalikes, OFFICIAL_TEST_TOKENS, readRecent, RECENT_KEY, rememberRecent, topUpAssets } from "@/lib/tron/topup";
import { assertTestnet, readTrxBalance, sendTrx, type SendProgress } from "@/lib/tron/tronlink";

const ME = "TRQA1YaQXu2ecBhGMvcJvMTj8abMCstX5T";
const TO = "TCCnYpEpPPggDDUQncuX193URykLBYziSv";
const BAMA = "TNVAxkyzxxvXeQox8BcWD2gH1mERzRzA64";
const FAKE_USDT = "TMPCkYZ5j6iCCL6Lx8xyyT52Pk5tmabDPT";
const FAKE_TETHER = "TKCXxayHYVvbwJ1M8rzofHrxdimirpS9xV";
const NILE_USDT = OFFICIAL_TEST_TOKENS.nile![0].address;

const tok = (o: Partial<SavedToken>): SavedToken => ({ address: BAMA, network: "nile", name: "BAMA", symbol: "BAMA", decimals: 6, addedAt: 1, source: "deployed", ...o });

describe("top-up asset list", () => {
  const saved = [
    tok({}),
    tok({}), // duplicate
    tok({ address: FAKE_USDT, name: "TETHER", symbol: "USDT" }),
    tok({ address: FAKE_TETHER, name: "USDT", symbol: "TETHER" }),
    tok({ address: "TLotkFnXkrQpCseNG8FF9YYBvKfmkPbngx", network: "mainnet" }),
  ];

  it("offers TRX, the official test USDT and own tokens, never look-alikes", () => {
    const list = topUpAssets("nile", saved);
    expect(list.map((a) => a.symbol)).toEqual(["TRX", "USDT", "BAMA"]);
    const usdt = list[1];
    expect(usdt.kind === "trc20" && usdt.address).toBe(NILE_USDT);
    expect(usdt.kind === "trc20" && usdt.official).toBe(true);
    expect(list.some((a) => a.kind === "trc20" && (a.address === FAKE_USDT || a.address === FAKE_TETHER))).toBe(false);
    expect(hiddenLookalikes("nile", saved).map((t) => t.address)).toEqual([FAKE_USDT, FAKE_TETHER]);
  });

  it("is empty on mainnet", () => {
    expect(topUpAssets("mainnet", saved)).toEqual([]);
  });

  it("works on Shasta with TRX and own tokens only", () => {
    expect(topUpAssets("shasta", [tok({ network: "shasta" })]).map((a) => a.symbol)).toEqual(["TRX", "BAMA"]);
  });

  it("keeps a TRX fee reserve per token transfer", () => {
    expect(feeReserveSun(0)).toBe(2_000_000n);
    expect(feeReserveSun(2)).toBe(32_000_000n);
  });
});

describe("recent recipients", () => {
  beforeEach(() => localStorage.clear());
  it("remembers up to 5, newest first, and ignores junk", () => {
    for (let i = 0; i < 6; i++) rememberRecent(i % 2 ? TO : ME);
    expect(readRecent()).toEqual([TO, ME]);
    rememberRecent("evil");
    expect(readRecent()).toEqual([TO, ME]);
    localStorage.setItem(RECENT_KEY, JSON.stringify(["x", TO, 5]));
    expect(readRecent()).toEqual([TO]);
    localStorage.setItem(RECENT_KEY, "{bad");
    expect(readRecent()).toEqual([]);
  });
});

function fakeWallet(opts: { host?: string; balanceSun?: number; reject?: boolean } = {}) {
  const sendTransaction = vi.fn(async () => {
    if (opts.reject) throw new Error("Confirmation declined by user");
    return { result: true, txid: "c".repeat(64) };
  });
  const tw = {
    ready: true,
    defaultAddress: { base58: ME },
    fullNode: { host: opts.host ?? "https://nile.trongrid.io" },
    address: { fromHex: (h: string) => h },
    isAddress: (a: string) => /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a),
    trx: {
      getAccount: async (a: string) => (a === ME ? { address: "41", balance: opts.balanceSun ?? 100_000_000 } : {}),
      sendTransaction,
      getTransactionInfo: async (id: string) => ({ id, fee: 0 }),
    },
  };
  (window as unknown as { tronLink: unknown }).tronLink = { ready: true, tronWeb: tw, request: async () => ({ code: 200 }) };
  return { sendTransaction };
}

describe("sendTrx (testnets only)", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 1000 }));

  it("refuses to run on mainnet", async () => {
    const { sendTransaction } = fakeWallet({ host: "https://api.trongrid.io" });
    expect(() => assertTestnet()).toThrow(/test networks only/);
    let p: SendProgress | undefined;
    await sendTrx({ to: TO, sun: 1_000_000n }, (x) => (p = x));
    expect(p).toMatchObject({ phase: "failed", error: /test networks only/ });
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("validates recipient, amount and balance before signing", async () => {
    const { sendTransaction } = fakeWallet({ balanceSun: 5_000_000 });
    const cases: [string, bigint, RegExp][] = [[ME, 1n, /own wallet/], [TO, 0n, /greater than 0/], [TO, 6_000_000n, /more than your TRX/], ["Tbad", 1n, /not a valid/]];
    for (const [to, sun, err] of cases) {
      let p: SendProgress | undefined;
      await sendTrx({ to, sun }, (x) => (p = x));
      expect(p, String(err)).toMatchObject({ phase: "failed", error: err });
    }
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("sends TRX in sun and reports the confirmed tx", async () => {
    const { sendTransaction } = fakeWallet();
    expect(await readTrxBalance(ME)).toBe(100_000_000n);
    expect(await readTrxBalance(TO)).toBe(0n);
    const steps: SendProgress[] = [];
    await sendTrx({ to: TO, sun: 50_000_000n }, (x) => steps.push(x));
    expect(sendTransaction).toHaveBeenCalledWith(TO, 50_000_000);
    expect(steps.map((s) => s.phase)).toEqual(["signing", "confirming", "done"]);
  }, 20_000);

  it("turns a rejection into a readable error", async () => {
    fakeWallet({ reject: true });
    let p: SendProgress | undefined;
    await sendTrx({ to: TO, sun: 1n }, (x) => (p = x));
    expect(p).toMatchObject({ phase: "failed", error: "Transaction was rejected in TronLink." });
  });
});
