/**
 * Executes the compiled token on an in-memory EVM (TVM is EVM-compatible for
 * everything this contract uses) and checks every function and revert path.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { createEVM, type EVM } from "@ethereumjs/evm";
import { Address, bytesToHex, hexToBytes } from "@ethereumjs/util";
import { keccak256 } from "ethereum-cryptography/keccak.js";
import { utf8ToBytes } from "ethereum-cryptography/utils.js";
import { compilerInput, contractName, sourceFileName } from "@/lib/token/generate";
import { parseCompilerOutput } from "@/lib/token/compile";
import type { TokenConfig } from "@/lib/token/schema";

const require = createRequire(import.meta.url);
const solc = require("solc");

const cfg: TokenConfig = { name: "Forge Demo Coin", symbol: "FDC", supply: "1000000", decimals: "6" };
const SUPPLY = 1_000_000n * 10n ** 6n;
const MAX = 2n ** 256n - 1n;

const acct = (n: number) => new Address(hexToBytes(("0x" + n.toString(16).padStart(40, "0")) as `0x${string}`));
const [alice, bob, carol] = [acct(0xa11ce), acct(0xb0b), acct(0xca401)];

const word = (v: bigint) => v.toString(16).padStart(64, "0");
const addr = (a: Address) => a.toString().slice(2).padStart(64, "0");
const selector = (sig: string) => bytesToHex(keccak256(utf8ToBytes(sig))).slice(2, 10);
const topic = (sig: string) => bytesToHex(keccak256(utf8ToBytes(sig)));

let evm: EVM;
let token: Address;

async function call(from: Address, sig: string, ...args: string[]) {
  const data = hexToBytes(("0x" + selector(sig) + args.join("")) as `0x${string}`);
  const r = await evm.runCall({ caller: from, to: token, data, gasLimit: 5_000_000n });
  const ret = bytesToHex(r.execResult.returnValue);
  return { ok: !r.execResult.exceptionError, ret, logs: r.execResult.logs ?? [], revert: decodeRevert(ret) };
}

function decodeRevert(ret: string): string {
  if (!ret.startsWith("0x08c379a0")) return "";
  const len = Number(BigInt("0x" + ret.slice(10 + 64, 10 + 128)));
  return Buffer.from(ret.slice(10 + 128, 10 + 128 + len * 2), "hex").toString("utf8");
}

const uint = (ret: string) => BigInt(ret);
const bal = async (a: Address) => uint((await call(alice, "balanceOf(address)", addr(a))).ret);
const allowanceOf = async (o: Address, s: Address) => uint((await call(alice, "allowance(address,address)", addr(o), addr(s))).ret);

beforeAll(async () => {
  const out = solc.compile(compilerInput(cfg));
  const art = parseCompilerOutput(out, sourceFileName(cfg), contractName(cfg), solc.version());
  evm = await createEVM();
  const r = await evm.runCall({ caller: alice, data: hexToBytes(("0x" + art.bytecode) as `0x${string}`), gasLimit: 10_000_000n });
  expect(r.execResult.exceptionError).toBeUndefined();
  token = r.createdAddress!;
  // constructor emits Transfer(0 -> deployer, supply)
  const log = r.execResult.logs![0];
  expect(bytesToHex(log[1][0])).toBe(topic("Transfer(address,address,uint256)"));
  expect(BigInt(bytesToHex(log[2]))).toBe(SUPPLY);
});

describe("TRC-20 behaviour", () => {
  it("exposes metadata", async () => {
    const str = (ret: string) => {
      const len = Number(BigInt("0x" + ret.slice(2 + 64, 2 + 128)));
      return Buffer.from(ret.slice(2 + 128, 2 + 128 + len * 2), "hex").toString("utf8");
    };
    expect(str((await call(bob, "name()")).ret)).toBe("Forge Demo Coin");
    expect(str((await call(bob, "symbol()")).ret)).toBe("FDC");
    expect(uint((await call(bob, "decimals()")).ret)).toBe(6n);
    expect(uint((await call(bob, "totalSupply()")).ret)).toBe(SUPPLY);
    expect(await bal(alice)).toBe(SUPPLY);
  });

  it("transfers and emits Transfer", async () => {
    const r = await call(alice, "transfer(address,uint256)", addr(bob), word(250n));
    expect(r.ok).toBe(true);
    expect(uint(r.ret)).toBe(1n);
    expect(await bal(bob)).toBe(250n);
    expect(await bal(alice)).toBe(SUPPLY - 250n);
    expect(bytesToHex(r.logs[0][1][0])).toBe(topic("Transfer(address,address,uint256)"));
  });

  it("allows zero-value transfers", async () => {
    expect((await call(carol, "transfer(address,uint256)", addr(bob), word(0n))).ok).toBe(true);
  });

  it("reverts on insufficient balance, zero address and the token contract itself", async () => {
    expect((await call(bob, "transfer(address,uint256)", addr(carol), word(251n))).revert).toBe("TRC20: transfer amount exceeds balance");
    expect((await call(bob, "transfer(address,uint256)", word(0n), word(1n))).revert).toBe("TRC20: transfer to the zero address");
    expect((await call(bob, "transfer(address,uint256)", addr(token), word(1n))).revert).toBe("TRC20: transfer to the token contract");
    expect(await bal(bob)).toBe(250n);
  });

  it("approves, spends allowance via transferFrom and emits Approval", async () => {
    const a = await call(bob, "approve(address,uint256)", addr(carol), word(100n));
    expect(a.ok).toBe(true);
    expect(bytesToHex(a.logs[0][1][0])).toBe(topic("Approval(address,address,uint256)"));
    expect(await allowanceOf(bob, carol)).toBe(100n);

    expect((await call(carol, "transferFrom(address,address,uint256)", addr(bob), addr(carol), word(60n))).ok).toBe(true);
    expect(await allowanceOf(bob, carol)).toBe(40n);
    expect(await bal(carol)).toBe(60n);

    expect((await call(carol, "transferFrom(address,address,uint256)", addr(bob), addr(carol), word(41n))).revert).toBe("TRC20: insufficient allowance");
    expect((await call(bob, "approve(address,uint256)", word(0n), word(1n))).revert).toBe("TRC20: approve to the zero address");
  });

  it("treats max allowance as infinite", async () => {
    await call(alice, "approve(address,uint256)", addr(carol), word(MAX));
    await call(carol, "transferFrom(address,address,uint256)", addr(alice), addr(bob), word(10n));
    expect(await allowanceOf(alice, carol)).toBe(MAX);
  });

  it("increases and decreases allowance safely", async () => {
    await call(bob, "approve(address,uint256)", addr(alice), word(5n));
    await call(bob, "increaseAllowance(address,uint256)", addr(alice), word(7n));
    expect(await allowanceOf(bob, alice)).toBe(12n);
    await call(bob, "decreaseAllowance(address,uint256)", addr(alice), word(2n));
    expect(await allowanceOf(bob, alice)).toBe(10n);
    expect((await call(bob, "decreaseAllowance(address,uint256)", addr(alice), word(11n))).revert).toBe("TRC20: decreased allowance below zero");
    expect((await call(bob, "increaseAllowance(address,uint256)", addr(alice), word(MAX))).ok).toBe(false); // checked overflow
  });

  it("keeps total supply constant and rejects unknown functions / TRX", async () => {
    expect(uint((await call(bob, "totalSupply()")).ret)).toBe(SUPPLY);
    expect((await call(alice, "mint(address,uint256)", addr(alice), word(1n))).ok).toBe(false);
    const r = await evm.runCall({ caller: alice, to: token, value: 1n, data: new Uint8Array(), gasLimit: 100_000n, skipBalance: true } as never);
    expect(r.execResult.exceptionError).toBeDefined();
    const sum = (await bal(alice)) + (await bal(bob)) + (await bal(carol));
    expect(sum).toBe(SUPPLY);
  });
});

describe("custom decimals", () => {
  for (const decimals of ["0", "18"]) {
    it(`deploys with ${decimals} decimals and mints supply x 10^${decimals}`, async () => {
      const c: TokenConfig = { ...cfg, decimals };
      const a = parseCompilerOutput(solc.compile(compilerInput(c)), sourceFileName(c), contractName(c), "x");
      const e = await createEVM();
      const r = await e.runCall({ caller: alice, data: hexToBytes(("0x" + a.bytecode) as `0x${string}`), gasLimit: 10_000_000n });
      const at = r.createdAddress!;
      const q = async (sig: string) =>
        BigInt(bytesToHex((await e.runCall({ caller: bob, to: at, data: hexToBytes(("0x" + selector(sig)) as `0x${string}`), gasLimit: 1_000_000n })).execResult.returnValue));
      expect(await q("decimals()")).toBe(BigInt(decimals));
      expect(await q("totalSupply()")).toBe(1_000_000n * 10n ** BigInt(decimals));
    });
  }
});
