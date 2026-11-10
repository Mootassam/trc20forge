# TRC-20 Forge

Create, compile, price, deploy and verify a **fixed-supply TRC-20 token** on TRON, all from the browser.

> This is an independent token tool. Tokens it creates are NOT USDT, NOT affiliated with Tether, and have no guaranteed value.

## Features

| Step | What happens |
|---|---|
| 1. Token details | Name, symbol and supply with strict validation. Blocks USDT/Tether/TRX/"USD" look-alikes, including digit and Cyrillic tricks. Decimals editable from 0 to 18 (default 6, the TRC-20 standard). |
| 2. Contract | Single-file Solidity contract (no imports) with the mandatory disclaimer comment, a fixed supply minted to the deployer, **no mint, no owner, no freeze/seize**, `transfer`, `approve`, `transferFrom`, `balanceOf`, `allowance`, `increaseAllowance`, `decreaseAllowance`, and the `Transfer` / `Approval` events. |
| 3. Compile | Runs in a Web Worker in the browser with **TRON's official solc 0.8.20** (the compiler Tronscan uses to verify), optimizer on, 200 runs. The ABI is then audited automatically. |
| 4. Cost | `/api/estimate` simulates the deployment on a live TRON node (`triggerconstantcontract`) and reads live energy and bandwidth prices. Your wallet's staked energy, bandwidth and balance are read through TronLink. |
| 5. Deploy | TronLink signs. Checks the network, balance and account activation, and requires extra confirmation for mainnet. Tracks the receipt, then reads `totalSupply()` back from the chain. |
| 6. Verify | Exact Tronscan verification values with copy buttons, the `.sol` download, and a per-token `README.md`. |

The `/guide` page explains the whole process: TronLink + Tronscan, costs, verification and security notes.

**Measured cost (Nov 2026):** about 442,000 energy (about 44.2 TRX at 100 sun/energy) plus about 3.4 KB of bandwidth (about 3.4 TRX), so **about 48 TRX** with no staked resources.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 27 tests: contract compile + EVM behaviour + cost model + UI flow
npm run build && npm start
```

Optional: copy `.env.example` to `.env.local` and set `TRONGRID_API_KEY` (free at trongrid.io) for higher rate limits on mainnet estimates.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS · Zod · Vitest + jsdom + Testing Library · @ethereumjs/evm for behaviour tests.

## Project layout

```
app/                page.tsx (Forge), guide/, api/estimate/route.ts
components/         Forge.tsx (6-step flow), ui.tsx, CodeBlock.tsx, wallet context, header
lib/token/          schema.ts (validation + anti-impersonation), generate.ts (Solidity), compile.ts (parse + ABI audit),
                    compiler-client.ts (worker bridge), readme.ts
lib/tron/           networks.ts, cost.ts (fee model), tronlink.ts (connect, resources, deploy)
lib/highlight.ts    linear-time Solidity highlighter
public/compiler-worker.js   solc Web Worker
tests/              contract, behaviour (EVM), cost, highlight, ui/forge
```

## Safety

- Always deploy to **Nile** first (free faucet TRX).
- This tool is not a security audit and not financial advice. Never market a token as a stablecoin or promise returns.
