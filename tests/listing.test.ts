import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createZip, crc32 } from "@/lib/zip";
import { kitEntries, projectInfoSchema, tokenList, trustWalletInfo, validateKit, addToWalletHtml, TRON_MAINNET_CHAIN_ID, type ProjectInfo } from "@/lib/listing";
import { addTokenToWallet, tronProviders } from "@/lib/tron/tronlink";
import type { TokenConfig } from "@/lib/token/schema";

const cfg: TokenConfig = { name: "Bama Coin", symbol: "BAMA", supply: "1000000", decimals: "6" };
const ADDR = "TRBtryZAMt3sw4wyxTE7efrUwrPB5g4rki";
const info: ProjectInfo = {
  website: "https://bama.example",
  email: "team@bama.example",
  description: "BAMA is a community meme token on TRON with a fixed supply and no admin keys.",
  x: "https://x.com/bama",
  telegram: "",
  github: "",
  whitepaper: "",
};

describe("zip writer", () => {
  it("computes standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789")).toString(16)).toBe("cbf43926");
  });

  it("produces an archive that the system tar/bsdtar can list and extract byte-exactly", () => {
    const bin = new Uint8Array([0, 1, 2, 250, 255, 137, 80, 78, 71]);
    const zip = createZip([
      { path: "a.txt", data: "hello ünïcode" },
      { path: "dir/sub/b.bin", data: bin },
    ]);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zip-"));
    const file = path.join(dir, "t.zip");
    fs.writeFileSync(file, zip);
    const out = path.join(dir, "out");
    fs.mkdirSync(out);
    // Use a real ZIP reader: Windows' built-in bsdtar, or unzip elsewhere (GNU tar cannot read zip files).
    if (process.platform === "win32") execFileSync(path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe"), ["-xf", file, "-C", out]);
    else execFileSync("unzip", ["-q", file, "-d", out]);
    expect(fs.readFileSync(path.join(out, "a.txt"), "utf8")).toBe("hello ünïcode");
    expect(new Uint8Array(fs.readFileSync(path.join(out, "dir/sub/b.bin")))).toEqual(bin);
  });

  it("rejects path traversal and duplicates", () => {
    expect(() => createZip([{ path: "../x", data: "" }])).toThrow();
    expect(() => createZip([{ path: "a", data: "" }, { path: "a", data: "" }])).toThrow();
  });
});

describe("listing kit", () => {
  it("Trust Wallet info.json matches the live TRON format", () => {
    const tw = trustWalletInfo(cfg, ADDR, info);
    expect(tw).toEqual({
      name: "Bama Coin", website: "https://bama.example", description: info.description,
      explorer: `https://tronscan.org/#/token20/${ADDR}`, type: "TRC20", symbol: "BAMA", decimals: 6,
      status: "active", id: ADDR, links: [{ name: "x", url: "https://x.com/bama" }],
    });
  });

  it("token list uses TRON mainnet chain id and numeric decimals", () => {
    const tl = tokenList(cfg, ADDR, info, new Date("2026-01-01T00:00:00Z"));
    expect(tl.tokens[0]).toMatchObject({ chainId: TRON_MAINNET_CHAIN_ID, address: ADDR, decimals: 6, symbol: "BAMA" });
    expect(TRON_MAINNET_CHAIN_ID).toBe(0x2b6653dc);
  });

  it("validates project info strictly", () => {
    expect(projectInfoSchema.safeParse(info).success).toBe(true);
    for (const bad of [{ website: "http://insecure.example" }, { website: "javascript:alert(1)" }, { email: "nope" }, { description: "short" }, { description: "<script>alert(1)</script> padding padding padding" }, { x: "ftp://x" }]) {
      expect(projectInfoSchema.safeParse({ ...info, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
    expect(validateKit({ address: "bad", info, logo256: new Uint8Array(200 * 1024) })).toHaveLength(2);
  });

  it("builds a complete kit with the right paths", () => {
    const files = kitEntries({ cfg, address: ADDR, network: "mainnet", info, source: "src", abiJson: "[]", logo256: new Uint8Array([1]), logo200: new Uint8Array([2]) });
    const paths = files.map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining([
      "README.md", "tronscan-record.txt", "tokenlist.json", "coingecko-coinmarketcap.md", "add-to-wallet.html", "BAMAToken.sol", "abi.json",
      `trustwallet/blockchains/tron/assets/${ADDR}/info.json`, `trustwallet/blockchains/tron/assets/${ADDR}/logo.png`, "logo-200.png",
    ]));
    expect(() => createZip(files)).not.toThrow();
    const readme = files.find((f) => f.path === "README.md")!.data as string;
    expect(readme).toContain("What no code can do");
  });

  it("warns loudly when the kit is for a testnet contract", () => {
    const files = kitEntries({ cfg, address: ADDR, network: "nile", info, source: "", abiJson: "[]" });
    expect(files.find((f) => f.path === "README.md")!.data).toMatch(/TESTNET/);
  });

  it("the website snippet embeds only the validated address", () => {
    const html = addToWalletHtml(cfg, ADDR);
    expect(html).toContain(`var TOKEN = "${ADDR}"`);
    expect(html).toContain("wallet_watchAsset");
  });
});

describe("add token to wallet", () => {
  it("prefers window.tron and falls back across providers", async () => {
    const unsupported = { request: vi.fn(async () => { throw new Error("Unknown method called"); }) };
    const ok = { request: vi.fn(async () => true) };
    await addTokenToWallet(ADDR, [unsupported, ok]);
    expect(unsupported.request).toHaveBeenCalledOnce();
    expect(ok.request).toHaveBeenCalledWith({ method: "wallet_watchAsset", params: { type: "trc20", options: { address: ADDR } } });
    expect(tronProviders({ tron: ok, tronLink: unsupported, tronWeb: ok }).length).toBe(2);
  });

  it("stops on user rejection and explains unsupported wallets", async () => {
    const reject = { request: vi.fn(async () => { throw { code: 4001, message: "User rejected" }; }) };
    const next = { request: vi.fn(async () => true) };
    await expect(addTokenToWallet(ADDR, [reject, next])).rejects.toThrow(/cancelled/);
    expect(next.request).not.toHaveBeenCalled();
    const un = { request: async () => { throw new Error("Unknown method called"); } };
    await expect(addTokenToWallet(ADDR, [un])).rejects.toThrow(/can't add tokens/);
    await expect(addTokenToWallet(ADDR, [])).rejects.toThrow(/not installed/);
  });
});
