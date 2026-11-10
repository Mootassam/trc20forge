/** Behaviour of the optional, owner-free extensions: burn, burnFrom, batchTransfer, supportsInterface. */
import { beforeAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { createEVM, type EVM } from "@ethereumjs/evm";
import { Address, bytesToHex, createZeroAddress, hexToBytes } from "@ethereumjs/util";
import { keccak256 } from "ethereum-cryptography/keccak.js";
import { utf8ToBytes } from "ethereum-cryptography/utils.js";
import { compilerInput, contractName, generateContract, sourceFileName } from "@/lib/token/generate";
import { auditAbi, parseCompilerOutput } from "@/lib/token/compile";
import type { TokenConfig } from "@/lib/token/schema";

const solc = createRequire(import.meta.url)("solc");
const ALL = { burn: true, batch: true, erc165: true, timed: true };
const cfg: TokenConfig = { name: "Feature Coin", symbol: "FEAT", supply: "1000", decimals: "0", features: ALL };

const acct = (n: number) => new Address(hexToBytes(("0x" + n.toString(16).padStart(40, "0")) as `0x${string}`));
const [alice, bob, carol, dave] = [acct(0xa11ce), acct(0xb0b), acct(0xca401), acct(0xda7e)];
const word = (v: bigint) => v.toString(16).padStart(64, "0");
const addr = (a: Address) => a.toString().slice(2).padStart(64, "0");
const selector = (sig: string) => bytesToHex(keccak256(utf8ToBytes(sig))).slice(2, 10);

let evm: EVM;
let token: Address;
/** Block timestamp (seconds) used for every call. */
let now = 1_000_000n;

async function call(from: Address, sig: string, ...args: string[]) {
  const block = { header: { number: 1n, coinbase: createZeroAddress(), timestamp: now, difficulty: 0n, prevRandao: new Uint8Array(32), gasLimit: 30_000_000n, baseFeePerGas: undefined, getBlobGasPrice: () => undefined } } as unknown as Parameters<EVM["runCall"]>[0]["block"];
  const r = await evm.runCall({ block, caller: from, to: token, data: hexToBytes(("0x" + selector(sig) + args.join("")) as `0x${string}`), gasLimit: 10_000_000n });
  const ret = bytesToHex(r.execResult.returnValue);
  let revert = "";
  if (ret.startsWith("0x08c379a0")) {
    const len = Number(BigInt("0x" + ret.slice(10 + 64, 10 + 128)));
    revert = Buffer.from(ret.slice(10 + 128, 10 + 128 + len * 2), "hex").toString("utf8");
  }
  return { ok: !r.execResult.exceptionError, ret, revert, gas: r.execResult.executionGasUsed };
}
const num = async (from: Address, sig: string, ...a: string[]) => BigInt((await call(from, sig, ...a)).ret);
const bal = (a: Address) => num(bob, "balanceOf(address)", addr(a));
const supply = () => num(bob, "totalSupply()");

/** ABI-encode (address[], uint256[]) for batchTransfer. */
function encodeBatch(to: Address[], values: bigint[]) {
  const head1 = 64n, head2 = 64n + 32n + 32n * BigInt(to.length);
  return [word(head1), word(head2), word(BigInt(to.length)), ...to.map(addr), word(BigInt(values.length)), ...values.map(word)];
}

beforeAll(async () => {
  const a = parseCompilerOutput(solc.compile(compilerInput(cfg)), sourceFileName(cfg), contractName(cfg), "x");
  expect(auditAbi(a.abi, ALL)).toMatchObject({ ok: true, missing: [], forbidden: [] });
  evm = await createEVM();
  const r = await evm.runCall({ caller: alice, data: hexToBytes(("0x" + a.bytecode) as `0x${string}`), gasLimit: 10_000_000n });
  expect(r.execResult.exceptionError).toBeUndefined();
  token = r.createdAddress!;
});

describe("burn / burnFrom", () => {
  it("burns own tokens and lowers total supply", async () => {
    expect(await supply()).toBe(1000n);
    expect((await call(alice, "burn(uint256)", word(100n))).ok).toBe(true);
    expect(await bal(alice)).toBe(900n);
    expect(await supply()).toBe(900n);
  });

  it("cannot burn more than the balance or someone else's tokens", async () => {
    expect((await call(bob, "burn(uint256)", word(1n))).revert).toBe("TRC20: burn amount exceeds balance");
    expect((await call(bob, "burnFrom(address,uint256)", addr(alice), word(1n))).revert).toBe("TRC20: insufficient allowance");
    expect(await supply()).toBe(900n);
  });

  it("burnFrom spends allowance", async () => {
    await call(alice, "approve(address,uint256)", addr(bob), word(50n));
    expect((await call(bob, "burnFrom(address,uint256)", addr(alice), word(30n))).ok).toBe(true);
    expect(await num(bob, "allowance(address,address)", addr(alice), addr(bob))).toBe(20n);
    expect(await supply()).toBe(870n);
    expect(await bal(alice)).toBe(870n);
  });
});

describe("batchTransfer", () => {
  it("sends to many recipients atomically", async () => {
    const r = await call(alice, "batchTransfer(address[],uint256[])", ...encodeBatch([bob, carol, dave], [10n, 20n, 30n]));
    expect(r.ok).toBe(true);
    expect([await bal(bob), await bal(carol), await bal(dave)]).toEqual([10n, 20n, 30n]);
    expect(await bal(alice)).toBe(810n);
  });

  it("reverts everything if any transfer fails, and validates input", async () => {
    const before = await bal(bob);
    expect((await call(alice, "batchTransfer(address[],uint256[])", ...encodeBatch([bob, carol], [1n, 10_000n]))).revert).toBe("TRC20: transfer amount exceeds balance");
    expect(await bal(bob)).toBe(before);
    expect((await call(alice, "batchTransfer(address[],uint256[])", ...encodeBatch([bob, carol], [1n]))).revert).toBe("TRC20: recipients and values length mismatch");
    expect((await call(alice, "batchTransfer(address[],uint256[])", ...encodeBatch([], []))).revert).toBe("TRC20: batch size must be 1-200");
    const many = Array.from({ length: 201 }, (_, i) => acct(0x1000 + i));
    expect((await call(alice, "batchTransfer(address[],uint256[])", ...encodeBatch(many, many.map(() => 1n)))).revert).toBe("TRC20: batch size must be 1-200");
  });

  it("handles a full 200-recipient airdrop", async () => {
    const many = Array.from({ length: 200 }, (_, i) => acct(0x2000 + i));
    const r = await call(alice, "batchTransfer(address[],uint256[])", ...encodeBatch(many, many.map(() => 1n)));
    expect(r.ok).toBe(true);
    expect(await bal(many[199])).toBe(1n);
  });
});

describe("supportsInterface", () => {
  it("reports ERC-165 and ERC-20 only", async () => {
    const id = (hex: string) => hex.padEnd(64, "0");
    expect(await num(bob, "supportsInterface(bytes4)", id("01ffc9a7"))).toBe(1n);
    expect(await num(bob, "supportsInterface(bytes4)", id("36372b07"))).toBe(1n);
    expect(await num(bob, "supportsInterface(bytes4)", id("ffffffff"))).toBe(0n);
  });
});

describe("timed sends", () => {
  const timed = async (id: bigint) => {
    const r = await call(bob, "timedSend(uint256)", word(id));
    const w = (i: number) => BigInt("0x" + r.ret.slice(2 + 64 * i, 2 + 64 * (i + 1)));
    return { from: w(0), to: w(1), value: w(2), expiresAt: w(3), status: w(4) };
  };
  const send = (from: Address, to: Address, value: bigint, duration: bigint) =>
    call(from, "sendTimed(address,uint256,uint256)", addr(to), word(value), word(duration));
  const tokenBal = () => num(bob, "balanceOf(address)", token.toString().slice(2).padStart(64, "0"));

  it("locks tokens in the contract and lets the recipient claim before expiry", async () => {
    now = 2_000_000n;
    const startAlice = await bal(alice);
    const startCarol = await bal(carol);
    const r = await send(alice, carol, 25n, 600n);
    expect(r.ok, r.revert).toBe(true);
    expect(BigInt(r.ret)).toBe(0n); // first id
    expect(await bal(alice)).toBe(startAlice - 25n);
    expect(await bal(carol)).toBe(startCarol); // nothing yet: no balance that could later vanish
    expect(await tokenBal()).toBe(25n);
    expect(await num(bob, "timedSendCount()")).toBe(1n);
    expect(await timed(0n)).toMatchObject({ value: 25n, expiresAt: 2_000_600n, status: 1n });

    expect((await call(alice, "claimTimed(uint256)", word(0n))).revert).toBe("TRC20: only the recipient can claim");
    expect((await call(alice, "reclaimTimed(uint256)", word(0n))).revert).toBe("TRC20: timed send has not expired yet");
    now = 2_000_599n;
    expect((await call(carol, "claimTimed(uint256)", word(0n))).ok).toBe(true);
    expect(await bal(carol)).toBe(startCarol + 25n);
    expect(await tokenBal()).toBe(0n);
    expect((await timed(0n)).status).toBe(2n);
    expect((await call(carol, "claimTimed(uint256)", word(0n))).revert).toBe("TRC20: timed send already settled");
    // claimed tokens are permanent: the sender can never take them back
    now = 9_000_000n;
    expect((await call(alice, "reclaimTimed(uint256)", word(0n))).revert).toBe("TRC20: timed send already settled");
    expect(await bal(carol)).toBe(startCarol + 25n);
  });

  it("returns unclaimed tokens to the sender after expiry (also for sends to yourself)", async () => {
    now = 3_000_000n;
    const startAlice = await bal(alice);
    expect((await send(alice, dave, 7n, 60n)).ok).toBe(true); // id 1
    expect((await send(alice, alice, 3n, 60n)).ok).toBe(true); // id 2, self test
    expect(await bal(alice)).toBe(startAlice - 10n);
    now = 3_000_060n; // exactly at expiry: recipient too late, sender may reclaim
    expect((await call(dave, "claimTimed(uint256)", word(1n))).revert).toBe("TRC20: timed send has expired");
    expect((await call(dave, "reclaimTimed(uint256)", word(1n))).revert).toBe("TRC20: only the sender can reclaim");
    expect((await call(alice, "reclaimTimed(uint256)", word(1n))).ok).toBe(true);
    expect((await call(alice, "reclaimTimed(uint256)", word(2n))).ok).toBe(true);
    expect(await bal(alice)).toBe(startAlice);
    expect(await bal(dave)).toBe(30n); // unchanged from the batch test
    expect((await timed(1n)).status).toBe(3n);
    expect(await tokenBal()).toBe(0n);
  });

  it("validates input and keeps total supply constant", async () => {
    const s = await supply();
    expect((await send(alice, bob, 1n, 59n)).revert).toBe("TRC20: duration must be 60 seconds to 365 days");
    expect((await send(alice, bob, 1n, 365n * 86400n + 1n)).revert).toBe("TRC20: duration must be 60 seconds to 365 days");
    expect((await send(alice, bob, 0n, 600n)).revert).toBe("TRC20: timed send of zero");
    expect((await send(alice, bob, 10n ** 9n, 600n)).revert).toBe("TRC20: transfer amount exceeds balance");
    expect((await call(alice, "sendTimed(address,uint256,uint256)", word(0n), word(1n), word(600n))).revert).toBe("TRC20: transfer to the zero address");
    expect((await call(alice, "sendTimed(address,uint256,uint256)", token.toString().slice(2).padStart(64, "0"), word(1n), word(600n))).revert).toBe("TRC20: transfer to the token contract");
    expect((await call(alice, "claimTimed(uint256)", word(99n))).revert).toBe("TRC20: unknown timed send");
    // tokens waiting in the contract can't be moved by transfer/burn tricks
    expect((await call(alice, "transfer(address,uint256)", token.toString().slice(2).padStart(64, "0"), word(1n))).revert).toBe("TRC20: transfer to the token contract");
    expect(await supply()).toBe(s);
  });
});

describe("feature combinations", () => {
  const combos = Array.from({ length: 16 }, (_, m) => ({ burn: !!(m & 1), batch: !!(m & 2), erc165: !!(m & 4), timed: !!(m & 8) }));
  it("every combination compiles cleanly and passes the strict ABI audit", () => {
    for (const features of combos) {
      const c = { ...cfg, features };
      const a = parseCompilerOutput(solc.compile(compilerInput(c)), sourceFileName(c), contractName(c), "x");
      expect(a.warnings, JSON.stringify(features)).toEqual([]);
      expect(auditAbi(a.abi, features), JSON.stringify(features)).toMatchObject({ ok: true });
    }
  }, 180_000);

  it("never contains mint/owner/pause/blacklist code", () => {
    const src = generateContract(cfg);
    expect(src).not.toMatch(/function\s+(mint|pause|freeze|blacklist|owner|transferOwnership)\b/i);
    expect(src).not.toMatch(/onlyOwner|selfdestruct|delegatecall|payable/);
  });

  it("the strict audit flags unexpected functions", () => {
    const a = parseCompilerOutput(solc.compile(compilerInput(cfg)), sourceFileName(cfg), contractName(cfg), "x");
    expect(auditAbi(a.abi, {}).ok).toBe(false); // burn etc. not expected -> flagged
  });
});
