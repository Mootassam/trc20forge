// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AmountError, formatUnits, parseUnits } from "@/lib/units";
import { readTokens, removeToken, saveToken, TOKENS_KEY, type SavedToken } from "@/lib/token-store";
import { listTimedSends, readTokenInfo, sendToken, settleTimedSend, supportsTimedSends, type SendProgress } from "@/lib/tron/tronlink";
import { directionOf, parseHistory } from "@/lib/tron/history";
import { humanDuration } from "@/lib/duration";

const ADDR = "TRBtryZAMt3sw4wyxTE7efrUwrPB5g4rki";
const TO = "TLsV52sRDL79HXGGm9yzwKibb6BeruhUzy";
const ME = "TRQA1YaQXu2ecBhGMvcJvMTj8abMCstX5T";
const OTHER_CONTRACT = "TLotkFnXkrQpCseNG8FF9YYBvKfmkPbngx";

describe("units", () => {
  it("parses exactly, without floating point", () => {
    expect(parseUnits("12.5", 6)).toBe(12_500_000n);
    expect(parseUnits("0.000001", 6)).toBe(1n);
    expect(parseUnits("50", 0)).toBe(50n);
    expect(parseUnits("1000000000000000", 18)).toBe(10n ** 33n);
    expect(parseUnits("0.1", 18)).toBe(10n ** 17n);
  });

  it("rejects bad input with clear messages", () => {
    for (const bad of ["", "-1", "1,000", "1e6", "abc", ".5", "1.", "0", "0.000"]) expect(() => parseUnits(bad, 6), bad).toThrow(AmountError);
    expect(() => parseUnits("1.5", 0)).toThrow(/whole numbers only/);
    expect(() => parseUnits("1.1234567", 6)).toThrow(/at most 6 decimal/);
  });

  it("formats and round-trips", () => {
    expect(formatUnits(12_500_000n, 6)).toBe("12.5");
    expect(formatUnits(1_234_567_000_000n, 6)).toBe("1,234,567");
    expect(formatUnits(50n, 0)).toBe("50");
    expect(formatUnits(1n, 18)).toBe("0.000000000000000001");
    for (const v of ["1", "0.5", "123456.123456"]) expect(formatUnits(parseUnits(v, 6), 6, false)).toBe(v);
  });
});

describe("token store", () => {
  beforeEach(() => localStorage.clear());
  const t: SavedToken = { address: ADDR, network: "nile", name: "BAMA", symbol: "BAMA", decimals: 0, addedAt: 1, source: "deployed" };

  it("saves, de-duplicates by address+network, removes", () => {
    saveToken(t);
    saveToken({ ...t, name: "BAMA renamed" });
    saveToken({ ...t, network: "mainnet" });
    expect(readTokens()).toHaveLength(2);
    expect(readTokens()[1].name).toBe("BAMA renamed");
    removeToken(t);
    expect(readTokens().map((x) => x.network)).toEqual(["mainnet"]);
  });

  it("ignores corrupted or malicious storage", () => {
    localStorage.setItem(TOKENS_KEY, JSON.stringify([{ address: "evil", network: "nile" }, { ...t, decimals: -1 }, t, "x", null]));
    expect(readTokens()).toEqual([t]);
    localStorage.setItem(TOKENS_KEY, "{not json");
    expect(readTokens()).toEqual([]);
    expect(() => saveToken({ ...t, address: "bad" })).toThrow();
  });
});

/** Fake TronLink-injected tronWeb with an in-memory token. */
function fakeTronWeb(opts: { balance: bigint; receipt?: string; reject?: boolean; timed?: boolean }) {
  const transfer = vi.fn((to: string, value: string) => ({
    call: async () => true,
    send: async () => {
      if (opts.reject) throw new Error("Confirmation declined by user");
      return "a".repeat(64);
    },
    to, value,
  }));
  const tx = (name: string) => vi.fn((...args: unknown[]) => ({ call: async () => true, send: async () => (opts.reject ? Promise.reject(new Error("Confirmation declined by user")) : "b".repeat(64)), name, args }));
  const sendTimed = tx("sendTimed");
  const claimTimed = tx("claimTimed");
  const reclaimTimed = tx("reclaimTimed");
  const records = [
    { from: "41" + "aa".repeat(20), to: "41" + "bb".repeat(20), value: { toString: () => "5" }, expiresAt: { toString: () => "100" }, status: 1 },
    { from: "41" + "cc".repeat(20), to: "41" + "dd".repeat(20), value: { toString: () => "9" }, expiresAt: { toString: () => "200" }, status: 2 },
  ];
  const timedFns = opts.timed
    ? {
        sendTimed, claimTimed, reclaimTimed,
        timedSendCount: () => ({ call: async () => ({ toString: () => String(records.length) }) }),
        timedSend: (id: number) => ({ call: async () => records[id] }),
      }
    : { timedSendCount: () => ({ call: async () => { throw new Error("REVERT opcode executed"); } }) };
  const contract = {
    ...timedFns,
    name: () => ({ call: async () => "BAMA" }),
    symbol: () => ({ call: async () => "BAMA" }),
    decimals: () => ({ call: async () => 0 }),
    totalSupply: () => ({ call: async () => ({ toString: () => "50" }) }),
    balanceOf: () => ({ call: async () => ({ toString: () => opts.balance.toString() }) }),
    transfer,
  };
  (window as unknown as { tronWeb: unknown }).tronWeb = {
    defaultAddress: { base58: ME },
    address: { fromHex: (h: string) => (h === "41" + "aa".repeat(20) ? ME : h === "41" + "bb".repeat(20) ? TO : "T" + h.slice(2, 35)) },
    isAddress: (a: string) => /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a),
    contract: async () => contract,
    trx: {
      getTransactionInfo: async () => ({ id: "x", fee: 345000, receipt: { result: opts.receipt ?? "SUCCESS" } }),
      getAccount: async (a: string) => (a === OTHER_CONTRACT ? { address: a, type: "Contract" } : { address: a }),
      getContract: async (a: string) => (a === OTHER_CONTRACT ? { contract_address: a, bytecode: "60" } : {}),
    },
  };
  return { transfer, sendTimed, claimTimed, reclaimTimed };
}

describe("send token", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 1000 }));

  it("reads token info from the chain", async () => {
    fakeTronWeb({ balance: 50n });
    expect(await readTokenInfo(ADDR)).toEqual({ name: "BAMA", symbol: "BAMA", decimals: 0, totalSupply: 50n });
  });

  it("sends raw units and reports progress through confirmation", async () => {
    const { transfer } = fakeTronWeb({ balance: 50n });
    const steps: SendProgress[] = [];
    await sendToken({ token: ADDR, to: TO, raw: 10n }, (p) => steps.push(p));
    expect(transfer).toHaveBeenCalledWith(TO, "10");
    expect(steps.map((s) => s.phase)).toEqual(["signing", "confirming", "done"]);
    expect(steps.at(-1)).toMatchObject({ phase: "done", feeSun: 345000 });
  });

  it("refuses unsafe sends before asking TronLink to sign", async () => {
    const { transfer } = fakeTronWeb({ balance: 5n });
    const last = async (o: Parameters<typeof sendToken>[0]) => { let p: SendProgress | undefined; await sendToken(o, (x) => (p = x)); return p; };
    expect(await last({ token: ADDR, to: TO, raw: 10n })).toMatchObject({ phase: "failed", error: /more than your balance/ });
    expect(await last({ token: ADDR, to: ADDR, raw: 1n })).toMatchObject({ phase: "failed", error: /token contract itself/ });
    expect(await last({ token: ADDR, to: "nope", raw: 1n })).toMatchObject({ phase: "failed", error: /not a valid TRON address/ });
    expect(await last({ token: ADDR, to: ME, raw: 1n })).toMatchObject({ phase: "failed", error: /your own wallet/ });
    expect(transfer).not.toHaveBeenCalled();
    expect(await last({ token: ADDR, to: ME, raw: 1n, allowSelf: true })).toMatchObject({ phase: "done" });
    expect(transfer).toHaveBeenCalledOnce();
    expect(transfer).toHaveBeenCalledWith(ME, "1");
    // any other smart contract (e.g. an old token) is refused unless explicitly confirmed
    expect(await last({ token: ADDR, to: OTHER_CONTRACT, raw: 1n })).toMatchObject({ phase: "failed", error: /smart contract/ });
    expect(transfer).toHaveBeenCalledOnce();
    expect(await last({ token: ADDR, to: OTHER_CONTRACT, raw: 1n, allowContract: true })).toMatchObject({ phase: "done" });
  }, 20_000);

  it("reports rejection and on-chain failure", async () => {
    fakeTronWeb({ balance: 50n, reject: true });
    let p: SendProgress | undefined;
    await sendToken({ token: ADDR, to: TO, raw: 1n }, (x) => (p = x));
    expect(p).toMatchObject({ phase: "failed", error: /rejected in TronLink/ });
    fakeTronWeb({ balance: 50n, receipt: "OUT_OF_ENERGY" });
    await sendToken({ token: ADDR, to: TO, raw: 1n }, (x) => (p = x));
    expect(p).toMatchObject({ phase: "failed", error: /energy/ });
  });
});

describe("timed sends (wallet side)", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 1000 }));

  it("detects support and sends with an expiry", async () => {
    fakeTronWeb({ balance: 50n });
    expect(await supportsTimedSends(ADDR)).toBe(false);
    const { transfer, sendTimed } = fakeTronWeb({ balance: 50n, timed: true });
    expect(await supportsTimedSends(ADDR)).toBe(true);
    const steps: SendProgress[] = [];
    await sendToken({ token: ADDR, to: TO, raw: 10n, durationSec: 600 }, (p) => steps.push(p));
    expect(sendTimed).toHaveBeenCalledWith(TO, "10", 600);
    expect(transfer).not.toHaveBeenCalled();
    expect(steps.at(-1)).toMatchObject({ phase: "done" });
  }, 20_000);

  it("refuses an out-of-range expiry before signing", async () => {
    const { sendTimed } = fakeTronWeb({ balance: 50n, timed: true });
    for (const d of [59, 365 * 86400 + 1, 1.5]) {
      let p: SendProgress | undefined;
      await sendToken({ token: ADDR, to: TO, raw: 1n, durationSec: d }, (x) => (p = x));
      expect(p, String(d)).toMatchObject({ phase: "failed", error: /between 1 minute and 365 days/ });
    }
    expect(sendTimed).not.toHaveBeenCalled();
  });

  it("lists only this wallet's timed sends, newest first, and claims/reclaims", async () => {
    const { claimTimed, reclaimTimed } = fakeTronWeb({ balance: 50n, timed: true });
    expect(await listTimedSends(ADDR, ME)).toEqual([{ id: 0, from: ME, to: TO, value: 5n, expiresAt: 100, status: "pending" }]);
    let p: SendProgress | undefined;
    await settleTimedSend(ADDR, 0, "reclaim", (x) => (p = x));
    expect(reclaimTimed).toHaveBeenCalledWith(0);
    expect(p).toMatchObject({ phase: "done" });
    await settleTimedSend(ADDR, 3, "claim", (x) => (p = x));
    expect(claimTimed).toHaveBeenCalledWith(3);
  }, 20_000);
});

describe("history", () => {
  const tx = "e".repeat(64);
  const row = (o: Record<string, unknown>) => ({ transaction_id: tx, block_timestamp: 1, from: ME, to: TO, value: "5", token_info: { address: ADDR }, ...o });

  it("keeps only well-formed transfers of the requested token", () => {
    const json = { data: [row({}), row({ token_info: { address: TO } }), row({ value: "-1" }), row({ to: "evil" }), row({ transaction_id: "x" }), null, "x"] };
    expect(parseHistory(json, ADDR)).toEqual([{ txid: tx, at: 1, from: ME, to: TO, value: "5" }]);
    expect(parseHistory({}, ADDR)).toEqual([]);
    expect(parseHistory(null, ADDR)).toEqual([]);
  });

  it("labels direction from the wallet's point of view", () => {
    const t = { txid: tx, at: 1, value: "1" };
    expect(directionOf({ ...t, from: ME, to: TO }, ME)).toBe("out");
    expect(directionOf({ ...t, from: TO, to: ME }, ME)).toBe("in");
    expect(directionOf({ ...t, from: ME, to: ME }, ME)).toBe("self");
    expect(directionOf({ ...t, from: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb", to: ME }, ME)).toBe("created");
  });

  it("formats durations", () => {
    expect(humanDuration(59)).toBe("59 s");
    expect(humanDuration(90)).toBe("1 min 30 s");
    expect(humanDuration(3600)).toBe("1 h");
    expect(humanDuration(90_061)).toBe("1 day 1 h");
    expect(humanDuration(-5)).toBe("0 s");
  });
});
