import { COMPILER, contractName, DISCLAIMER, sourceFileName } from "./generate";
import { featuresOf, groupDigits, type TokenConfig } from "./schema";
import type { CostEstimate } from "../tron/cost";

export function generateReadme(cfg: TokenConfig, cost?: CostEstimate | null, deployed?: { network: string; address: string; txid: string }): string {
  const c = contractName(cfg);
  const f = featuresOf(cfg);
  const extras = [
    f.burn && ", \`burn\`, \`burnFrom\` (holders destroy their own tokens; supply only decreases)",
    f.batch && ", \`batchTransfer\` (up to 200 recipients per call, all-or-nothing)",
    f.erc165 && ", \`supportsInterface\` (ERC-165)",
    f.timed && ", \`sendTimed\` / \`claimTimed\` / \`reclaimTimed\` (send with an expiry: the recipient claims before it, otherwise the sender takes the tokens back)",
  ].filter(Boolean).join("");
  const costBlock = cost
    ? `| Item | Amount |
|---|---|
| Energy (${cost.energySource === "simulated" ? "simulated on-chain" : "approximate"}) | ${groupDigits(cost.energy)} energy |
| Energy price | ${cost.energyFeeSun} sun / energy |
| Energy cost if burned | **${cost.energyTrx} TRX** |
| Bandwidth | ~${groupDigits(cost.bandwidthBytes)} bytes → ${cost.bandwidthTrx} TRX if burned |
| **Total (worst case, no staked resources)** | **≈ ${cost.totalTrx} TRX** |
| Fee limit to set | ${cost.feeLimitSun / 1_000_000} TRX (a cap, not a charge) |`
    : `A typical deployment of this contract uses about **440,000 energy** and **~4,000 bytes of bandwidth**.
At the current 100 sun/energy that is **≈ 44 TRX** for energy plus **≈ 4 TRX** for bandwidth, so **≈ 48 TRX** in total
if you have no staked resources. Keep at least **100 TRX** in the wallet for headroom.`;

  return `# ${cfg.name} (${cfg.symbol}) – TRC-20 token

> **${DISCLAIMER}**

| Property | Value |
|---|---|
| Contract | \`${c}\` in \`${sourceFileName(cfg)}\` |
| Standard | TRC-20 (TRON, ERC-20 compatible) |
| Decimals | ${cfg.decimals}${cfg.decimals === "6" ? " (TRC-20 standard)" : ""} |
| Total supply | ${groupDigits(cfg.supply)} ${cfg.symbol}, fixed forever, all minted to the deployer |
| Admin powers | None: no mint, no owner, no pause, no freeze, no blacklist, no seize |
| Functions | \`name\`, \`symbol\`, \`decimals\`, \`totalSupply\`, \`balanceOf\`, \`allowance\`, \`transfer\`, \`approve\`, \`transferFrom\`, \`increaseAllowance\`, \`decreaseAllowance\`${extras} |
| Events | \`Transfer\`, \`Approval\` |
${deployed ? `| Deployed | \`${deployed.address}\` on ${deployed.network} (tx \`${deployed.txid}\`) |\n` : ""}
---

## 1. Compile and deploy on TRON (TronLink + Tronscan)

### Before you start
1. Install the **TronLink** browser extension (tronlink.org) and create or import a wallet. **Back up the seed phrase offline.**
2. **Test on Nile first.** In TronLink, switch the node to *Nile Testnet* and get free test TRX from the Nile faucet (nileex.io).
3. For mainnet, fund the wallet with **at least 100 TRX** (see section 2).

### Option A – Deploy with TRC-20 Forge (this app)
1. Enter the name, symbol and supply → **Generate**.
2. **Compile**. The app compiles in your browser with TRON's official compiler \`${COMPILER.longVersion}\`
   (optimizer on, ${COMPILER.optimizer.runs} runs), the same build Tronscan uses to verify.
3. **Estimate**. The app simulates the deployment on the selected network and shows the exact energy and TRX cost.
4. **Connect TronLink**, check that the network badge shows the network you want, then **Deploy** and approve the
   transaction in the TronLink popup.
5. Wait for confirmation (~3–6 s). You get the contract address and a Tronscan link.

### Option B – Deploy manually with TronIDE + TronLink
1. Open **tronide.io** and create the file \`${sourceFileName(cfg)}\` with the source code from this package.
2. In the *Solidity Compiler* tab choose compiler **${COMPILER.version}**, enable optimization with **${COMPILER.optimizer.runs}** runs, and click *Compile*.
3. In *Deploy & Run*, set the environment to *Injected TronWeb (TronLink)*, select \`${c}\`,
   set a fee limit of **150–200 TRX**, click *Deploy* and confirm in TronLink.
4. Copy the contract address from the console or open the transaction on Tronscan.

### After deployment
- All ${groupDigits(cfg.supply)} ${cfg.symbol} sit in the deployer wallet. In TronLink, choose *Add Token* → *Custom Token* and paste the contract address.
- Logo and info: Tronscan → Tokens → *Record Token* → TRC20, signed with the deployer wallet. The Forge's **Listing kit** (Verify step) prepares every value and logo file.

---

## 2. Estimated deployment cost in TRX

${costBlock}

**How TRON fees work**
- **Energy** pays for running and storing contract code. If you have no staked energy, TRX is burned at the
  current energy price (\`getEnergyFee\`, now **100 sun = 0.0001 TRX per energy**).
- **Bandwidth** pays for transaction bytes (1,000 sun per byte when burned). The 600 free daily bandwidth points don't
  cover a ~4 KB deploy, so the whole transaction is billed.
- The **fee limit** is the most TRX the transaction may burn on energy. Unused TRX is never charged.
- To pay less, stake TRX for energy (Stake 2.0) or rent energy before deploying.
- Prices are set by the network and can change. The live estimate in the app always reads the current values.

---

## 3. Verify the source code on Tronscan

1. Open **tronscan.org/#/contracts/verify** (use **nile.tronscan.org** for Nile).
2. Fill in the form **exactly**:

| Field | Value |
|---|---|
| Contract Address | your deployed address |
| Main Contract | \`${c}\` |
| Compiler | \`tron_v${COMPILER.longVersion}\` (scroll the list; the default is newer) |
| License | MIT |
| Optimization | **Yes** |
| Runs | **${COMPILER.optimizer.runs}** (the form starts at 0, so change it) |
| Source file | upload \`${sourceFileName(cfg)}\` unchanged (single file, no imports) |
| Constructor arguments | none |

3. Connect your wallet when Tronscan asks, complete the captcha and click **Verify And Publish**. The *Contract* tab then shows a green check and the source,
   and anyone can read and call the functions directly on Tronscan.

**If verification fails**, check that the source file is byte-for-byte identical (no reformatting or extra
whitespace), that the compiler version and optimization/runs match, and that the main contract name is \`${c}\`.

---

## Security notes
- The supply is a compile-time constant. No code path can create new tokens.
- No privileged roles: after deployment nobody, the deployer included, can change the contract or touch other people's balances.
- Transfers to the zero address or to the token contract itself are rejected to prevent accidental loss.
- \`approve\` has the standard ERC-20 race condition. Integrators should use \`increaseAllowance\` / \`decreaseAllowance\`
  or reset to 0 first. An allowance of \`2^256-1\` is treated as unlimited.
- The contract does not accept TRX (no payable functions).
- This generator is a tool, not an audit. Deploy on a testnet first and never make claims about value or returns.
`;
}
