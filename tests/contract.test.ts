import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { compilerInput, contractName, DISCLAIMER, generateContract, sourceFileName } from "@/lib/token/generate";
import { auditAbi, parseCompilerOutput, CompileError } from "@/lib/token/compile";
import { validateConfig, type TokenConfig } from "@/lib/token/schema";

const require = createRequire(import.meta.url);
const cfg: TokenConfig = { name: "Forge Demo Coin", symbol: "FDC", supply: "1000000", decimals: "6" };

/** Runs public/compiler-worker.js in a sandbox, backed by the official solc soljson build. */
function loadWorker() {
  const replies: unknown[] = [];
  const sandbox: Record<string, unknown> = {};
  sandbox.self = sandbox;
  sandbox.postMessage = (m: unknown) => replies.push(m);
  sandbox.importScripts = () => {
    sandbox.Module = require("solc/soljson.js");
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../public/compiler-worker.js"), "utf8"), sandbox);
  const send = async (msg: unknown) => {
    const before = replies.length;
    (sandbox.onmessage as (e: { data: unknown }) => void)({ data: msg });
    for (let i = 0; i < 600 && replies.length === before; i++) await new Promise((r) => setTimeout(r, 50));
    return replies[replies.length - 1] as { ok: boolean; output?: string; version?: string; error?: string };
  };
  return { send };
}

describe("generated TRC-20 contract", () => {
  const src = generateContract(cfg);

  it("contains the mandatory disclaimer and spec values", () => {
    expect(src).toContain(DISCLAIMER);
    expect(src).toContain('_NAME = "Forge Demo Coin"');
    expect(src).toContain('_SYMBOL = "FDC"');
    expect(src).toContain("_DECIMALS = 6");
    expect(src).toContain("_TOTAL_SUPPLY = 1000000 * 10 ** 6");
    expect(src).not.toMatch(/\bimport\b/);
    expect(src).not.toMatch(/function\s+(mint|burn|pause|freeze|owner|blacklist)/i);
    expect(src).not.toMatch(/onlyOwner|selfdestruct|delegatecall|payable/);
  });

  it("compiles cleanly through the worker and passes the ABI audit", async () => {
    const worker = loadWorker();
    const reply = await worker.send({ id: 1, url: "soljson.js", input: compilerInput(cfg) });
    expect(reply.ok, reply.error).toBe(true);
    const art = parseCompilerOutput(reply.output!, sourceFileName(cfg), contractName(cfg), reply.version!);
    expect(art.warnings).toEqual([]);
    expect(art.bytecode.length).toBeGreaterThan(1000);
    const audit = auditAbi(art.abi);
    expect(audit).toMatchObject({ ok: true, missing: [], forbidden: [] });
    expect(audit.events.sort()).toEqual(["Approval", "Transfer"]);
    // no constructor arguments -> nothing to ABI-encode during Tronscan verification
    expect(art.abi.find((i) => i.type === "constructor")?.inputs ?? []).toEqual([]);

    const again = await worker.send({ id: 2, url: "soljson.js", input: compilerInput({ ...cfg, symbol: "ABC" }) });
    expect(again.ok).toBe(true);
    const other = await worker.send({ id: 3, url: "other.js", input: "{}" });
    expect(other.ok).toBe(false);
  }, 60_000);

  it("compiles at the supply and decimals limits", async () => {
    const worker = loadWorker();
    for (const [supply, decimals] of [["1", "0"], ["1000000000000000", "18"], ["1000000", "8"]]) {
      const c = { ...cfg, supply, decimals };
      expect(generateContract(c)).toContain(`_TOTAL_SUPPLY = ${supply} * 10 ** ${decimals}`);
      const r = await worker.send({ id: 1, url: "soljson.js", input: compilerInput(c) });
      expect(() => parseCompilerOutput(r.output!, sourceFileName(c), contractName(c), "x")).not.toThrow();
    }
  }, 60_000);

  it("surfaces compiler errors", () => {
    const bad = JSON.stringify({ errors: [{ severity: "error", message: "boom", formattedMessage: "boom at 1:1" }] });
    expect(() => parseCompilerOutput(bad, "a.sol", "A", "x")).toThrow(CompileError);
    expect(() => parseCompilerOutput("not json", "a.sol", "A", "x")).toThrow(CompileError);
  });
});

describe("config validation", () => {
  const ok = (c: Partial<TokenConfig>) => validateConfig({ ...cfg, ...c }).ok;

  it("accepts sensible tokens", () => {
    expect(ok({})).toBe(true);
    expect(ok({ name: "Bama Coin", symbol: "BAMA", supply: "1000000000" })).toBe(true);
    expect(ok({ name: "Moon 2.0", symbol: "MOON2" })).toBe(true);
  });

  it("rejects anything that could break out of the Solidity source", () => {
    for (const name of ['Evil"; }', "a\\b", "x/*y", "Line\nBreak", "emoji 🚀", "  ", "a"]) expect(ok({ name })).toBe(false);
    for (const symbol of ["fdc", "1AB", "A", "TOOLONGSYMBOL", "AB-C", "AB C"]) expect(ok({ symbol })).toBe(false);
  });

  it("accepts decimals 0-18 only", () => {
    for (const decimals of ["0", "6", "8", "9", "10", "18"]) expect(ok({ decimals })).toBe(true);
    for (const decimals of ["", "19", "99", "-1", "06", "1.5", "a"]) expect(ok({ decimals })).toBe(false);
  });

  it("rejects bad supplies", () => {
    for (const supply of ["0", "-5", "1.5", "1,000", "01", "1e6", "1000000000000001", ""]) expect(ok({ supply })).toBe(false);
  });

  it("blocks stablecoin / major-asset impersonation, including look-alikes", () => {
    for (const symbol of ["USDT", "USDC", "TRX", "BTT", "USDX", "U5DT", "BTC"]) expect(ok({ symbol })).toBe(false);
    for (const name of ["Tether USD", "Tether", "TRON", "USDT Token", "U S D T", "Binance Coin", "Te7her Gold".replace("7", "t")]) {
      expect(ok({ name })).toBe(false);
    }
    const r = validateConfig({ ...cfg, name: "Tether Gold" });
    expect(!r.ok && r.errors.name).toMatch(/TETHER/);
    // non-ASCII look-alikes (Cyrillic "е") are rejected by the strict charset
    expect(ok({ name: "Tеther" })).toBe(false);
  });
});
