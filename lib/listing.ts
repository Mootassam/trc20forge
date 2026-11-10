import { z } from "zod";
import { contractName, DISCLAIMER, sourceFileName, COMPILER } from "./token/generate";
import { featuresOf, groupDigits, type TokenConfig } from "./token/schema";
import { NETWORKS, TRON_ADDRESS, type NetworkId } from "./tron/networks";

/** TRON mainnet chain id (0x2b6653dc) as used by Token Lists / TIP-1193 providers. */
export const TRON_MAINNET_CHAIN_ID = 728126428;

const httpsUrl = z
  .string()
  .trim()
  .url("Enter a full URL starting with https://")
  .refine((v) => v.startsWith("https://"), "Must start with https://")
  .refine((v) => !/[\s"'<>`]/.test(v), "URL contains invalid characters.");
const optionalUrl = z.union([z.literal(""), httpsUrl]);

/** Project details the listing services ask for. Everything is plain data: no secrets, no keys. */
export const projectInfoSchema = z.object({
  website: httpsUrl,
  email: z.string().trim().email("Enter a valid email address."),
  description: z
    .string()
    .trim()
    .min(30, "Write at least 30 characters. Listing reviewers reject empty descriptions.")
    .max(600, "Keep it under 600 characters (Trust Wallet limit).")
    .refine((v) => !/[<>`]/.test(v), "Remove < > and ` characters."),
  x: optionalUrl,
  telegram: optionalUrl,
  github: optionalUrl,
  whitepaper: optionalUrl,
});
export type ProjectInfo = z.infer<typeof projectInfoSchema>;

export const EMPTY_PROJECT: ProjectInfo = { website: "", email: "", description: "", x: "", telegram: "", github: "", whitepaper: "" };

export type KitInput = {
  cfg: TokenConfig;
  address: string;
  network: NetworkId;
  info: ProjectInfo;
  /** 256x256 PNG (Trust Wallet), <= 100 KB. */
  logo256?: Uint8Array;
  /** 200x200 PNG (Tronscan record upload). */
  logo200?: Uint8Array;
  source: string;
  abiJson: string;
};

const json = (v: unknown) => JSON.stringify(v, null, 4) + "\n";

function links(info: ProjectInfo) {
  const l: { name: string; url: string }[] = [];
  if (info.x) l.push({ name: "x", url: info.x });
  if (info.telegram) l.push({ name: "telegram", url: info.telegram });
  if (info.github) l.push({ name: "github", url: info.github });
  if (info.whitepaper) l.push({ name: "whitepaper", url: info.whitepaper });
  return l;
}

/** Trust Wallet assets repo: blockchains/tron/assets/<address>/info.json (format mirrors live TRON entries). */
export function trustWalletInfo(cfg: TokenConfig, address: string, info: ProjectInfo) {
  const l = links(info);
  return {
    name: cfg.name,
    website: info.website,
    description: info.description,
    explorer: `https://tronscan.org/#/token20/${address}`,
    type: "TRC20",
    symbol: cfg.symbol,
    decimals: Number(cfg.decimals),
    status: "active",
    id: address,
    ...(l.length ? { links: l } : {}),
  };
}

/** Uniswap-style Token List (tokenlists.org schema) for TRON mainnet. */
export function tokenList(cfg: TokenConfig, address: string, info: ProjectInfo, now = new Date()) {
  const base = info.website.replace(/\/+$/, "");
  return {
    name: `${cfg.name} Token List`,
    timestamp: now.toISOString(),
    version: { major: 1, minor: 0, patch: 0 },
    keywords: [cfg.symbol.toLowerCase(), "tron", "trc20"],
    logoURI: `${base}/${cfg.symbol.toLowerCase()}-logo.png`,
    tokens: [
      {
        chainId: TRON_MAINNET_CHAIN_ID,
        address,
        name: cfg.name,
        symbol: cfg.symbol,
        decimals: Number(cfg.decimals),
        logoURI: `${base}/${cfg.symbol.toLowerCase()}-logo.png`,
      },
    ],
  };
}

/** Field-by-field sheet for Tronscan's "Record Token" (TRC20) form. */
export function tronscanSheet(cfg: TokenConfig, address: string, network: NetworkId, info: ProjectInfo): string {
  const ex = NETWORKS[network].explorer;
  return `TRONSCAN "RECORD TOKEN" (TRC20). Copy each value into the form
Form: ${ex}/#/tokens/create/Type  → choose TRC20
Sign with the DEPLOYER wallet (the wallet that created the contract).

Contract address : ${address}
Token name       : ${cfg.name}        (must match the contract exactly)
Token symbol     : ${cfg.symbol}        (must match the contract exactly)
Decimals         : ${cfg.decimals}
Total supply     : ${groupDigits(cfg.supply)}
Logo             : upload logo-200.png from this kit
Description      : ${info.description}
Official website : ${info.website}
Official email   : ${info.email}   (an email on your own domain speeds up review)
${info.whitepaper ? `Whitepaper       : ${info.whitepaper}\n` : ""}${info.x ? `X (Twitter)      : ${info.x}\n` : ""}${info.telegram ? `Telegram         : ${info.telegram}\n` : ""}${info.github ? `GitHub           : ${info.github}\n` : ""}
Notes
- Tronscan usually detects new TRC20 tokens automatically within ~15 minutes; recording adds logo and info.
- Only the issuer can edit token info later (logo, description, website, email, socials).
`;
}

/** Fact sheet for CoinGecko / CoinMarketCap applications (they ask for these facts). */
export function trackerSheet(cfg: TokenConfig, address: string, info: ProjectInfo): string {
  const f = featuresOf(cfg);
  return `# ${cfg.name} (${cfg.symbol}): CoinGecko / CoinMarketCap application facts

| Field | Value |
|---|---|
| Blockchain | TRON (TRC-20) |
| Contract address | ${address} |
| Explorer | https://tronscan.org/#/token20/${address} |
| Source code | Verified on Tronscan (TRON solc ${COMPILER.longVersion}, optimizer 200 runs) |
| Decimals | ${cfg.decimals} |
| Max / total supply | ${groupDigits(cfg.supply)} ${cfg.symbol}${f.burn ? " (can only decrease via holder burns)" : " (fixed)"} |
| Mint function | None |
| Owner / admin keys | None (no pause, blacklist, freeze, tax or proxy) |
| Website | ${info.website} |
| Email | ${info.email} |
${info.x ? `| X | ${info.x} |\n` : ""}${info.telegram ? `| Telegram | ${info.telegram} |\n` : ""}${info.github ? `| GitHub | ${info.github} |\n` : ""}${info.whitepaper ? `| Whitepaper | ${info.whitepaper} |\n` : ""}
**Description:** ${info.description}

**Before applying you need:** an active trading pair with real liquidity (e.g. ${cfg.symbol}/TRX on SunSwap),
the pool address, and circulating-supply proof (list of team / locked wallets). Applications without
trading activity are rejected.

Apply: https://www.coingecko.com/request-form · https://support.coinmarketcap.com (Listing request)
`;
}

/** Standalone page with a one-click "Add to TronLink" button for the project website. */
export function addToWalletHtml(cfg: TokenConfig, address: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Add ${cfg.symbol} to your wallet</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#fafafa;color:#18181b}
  .card{max-width:420px;padding:28px;border:1px solid #e4e4e7;border-radius:16px;background:#fff;text-align:center}
  button{font:inherit;font-weight:600;padding:12px 20px;border:0;border-radius:12px;background:#e11d48;color:#fff;cursor:pointer}
  code{word-break:break-all;font-size:13px}
  #msg{min-height:1.5em;margin-top:12px;font-size:14px}
</style>
</head>
<body>
<div class="card">
  <h1>${cfg.name} (${cfg.symbol})</h1>
  <p>TRC-20 token on TRON</p>
  <p><code id="addr">${address}</code></p>
  <button id="add">Add ${cfg.symbol} to TronLink</button>
  <p id="msg"></p>
  <p style="font-size:12px;color:#71717a">${DISCLAIMER}</p>
</div>
<script>
(function () {
  var TOKEN = "${address}";
  var msg = document.getElementById("msg");
  function providers() {
    var list = [];
    if (window.tron && window.tron.request) list.push(window.tron);
    if (window.tronLink && window.tronLink.request) list.push(window.tronLink);
    if (window.tronWeb && window.tronWeb.request) list.push(window.tronWeb);
    return list;
  }
  document.getElementById("add").onclick = async function () {
    var ps = providers();
    if (!ps.length) { msg.textContent = "Install TronLink, then reload this page. Or add the address above manually."; return; }
    for (var i = 0; i < ps.length; i++) {
      try {
        await ps[i].request({ method: "wallet_watchAsset", params: { type: "trc20", options: { address: TOKEN } } });
        msg.textContent = "Done. Check your token list."; return;
      } catch (e) {
        var m = String((e && e.message) || e);
        if (/reject|cancel|denied|4001/i.test(m)) { msg.textContent = "Cancelled."; return; }
      }
    }
    msg.textContent = "Your wallet can't add tokens automatically. Copy the address above and add it as a custom token.";
  };
})();
</script>
</body>
</html>
`;
}

export function listingReadme(cfg: TokenConfig, address: string, network: NetworkId): string {
  const main = network === "mainnet";
  return `# ${cfg.symbol} listing kit

Contract: ${address} (${NETWORKS[network].label})
${main ? "" : "\n> ⚠️ This kit was made for a TESTNET contract. Wallets, trackers and exchanges only list MAINNET tokens.\n> Deploy on mainnet and generate the kit again before submitting anything.\n"}
## What is in this kit
| File | Use it for |
|---|---|
| tronscan-record.txt + logo-200.png | Tronscan "Record Token". Adds logo and info on Tronscan and TronLink. |
| trustwallet/blockchains/tron/assets/${address}/ | Trust Wallet assets repo (many wallets reuse this list) |
| tokenlist.json | Token List file for your website / DEX aggregators |
| coingecko-coinmarketcap.md | Facts for CoinGecko / CoinMarketCap applications |
| add-to-wallet.html | One-click "Add ${cfg.symbol} to TronLink" page for your website |
| ${sourceFileName(cfg)} + abi.json | Verified source and ABI |

## Order that works
1. **Verify source on Tronscan.** Done in the Forge (Verify step).
2. **Record the token on Tronscan** with tronscan-record.txt and logo-200.png. Sign with the deployer wallet.
3. **Create liquidity**: add a ${cfg.symbol}/TRX pool on SunSwap (sun.io). Without a trading pair, trackers and wallets show no price.
4. **Apply to CoinGecko and CoinMarketCap** with coingecko-coinmarketcap.md. Price data from these feeds is what TronLink,
   Binance Wallet, Trust Wallet and others display.
5. **Trust Wallet assets**: open a PR at assets.trustwallet.com with the trustwallet/ folder. Their current rules: a fee per PR
   (500 TWT or 2.5 BNB at the time of writing), CoinMarketCap listing first, and brand-new or low-activity tokens are rejected.
6. **Exchanges (Binance, Bybit, …)**: apply only through their official listing pages. Nobody can guarantee a listing;
   offers of "guaranteed listing" are scams.

## What no code can do
No contract code makes a token appear automatically in Binance Wallet or other wallets. They show tokens that
(a) a user adds, or (b) have liquidity, trading activity and tracker data. This kit makes every submission
quick and correctly formatted, but the submissions, liquidity and reviews are up to you and the platforms.
`;
}

/** Validates inputs that end up inside generated files. */
export function validateKit(input: Pick<KitInput, "address" | "info" | "logo256">): string[] {
  const errs: string[] = [];
  if (!TRON_ADDRESS.test(input.address)) errs.push("Invalid contract address.");
  const r = projectInfoSchema.safeParse(input.info);
  if (!r.success) for (const i of r.error.issues) errs.push(`${String(i.path[0])}: ${i.message}`);
  if (input.logo256 && input.logo256.length > 100 * 1024) errs.push("logo.png is larger than 100 KB (Trust Wallet limit).");
  return errs;
}

export function kitEntries(input: KitInput): { path: string; data: Uint8Array | string }[] {
  const { cfg, address, network, info } = input;
  const tw = `trustwallet/blockchains/tron/assets/${address}`;
  const files: { path: string; data: Uint8Array | string }[] = [
    { path: "README.md", data: listingReadme(cfg, address, network) },
    { path: "tronscan-record.txt", data: tronscanSheet(cfg, address, network, info) },
    { path: `${tw}/info.json`, data: json(trustWalletInfo(cfg, address, info)) },
    { path: "tokenlist.json", data: json(tokenList(cfg, address, info)) },
    { path: "coingecko-coinmarketcap.md", data: trackerSheet(cfg, address, info) },
    { path: "add-to-wallet.html", data: addToWalletHtml(cfg, address) },
    { path: sourceFileName(cfg), data: input.source },
    { path: "abi.json", data: input.abiJson },
  ];
  if (input.logo256) files.push({ path: `${tw}/logo.png`, data: input.logo256 }, { path: `${cfg.symbol.toLowerCase()}-logo.png`, data: input.logo256 });
  if (input.logo200) files.push({ path: "logo-200.png", data: input.logo200 });
  return files;
}

export const kitFileName = (cfg: Pick<TokenConfig, "symbol">) => `${contractName(cfg)}-listing-kit.zip`;
