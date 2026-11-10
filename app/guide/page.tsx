import type { Metadata } from "next";
import Link from "next/link";
import { COMPILER, DISCLAIMER } from "@/lib/token/generate";
import { MAX_BATCH } from "@/lib/token/schema";
import { GuideChecklist, type ChecklistStep } from "@/components/GuideChecklist";

export const metadata: Metadata = {
  title: "Guide · TRC-20 Forge",
  description: "Complete, repeatable playbook: create, deploy, verify, list and get a TRC-20 token shown in wallets on TRON.",
};

const toc = [
  { id: "playbook", label: "Launch checklist" },
  { id: "appear", label: "Will it appear everywhere?" },
  { id: "setup", label: "1. One-time wallet setup" },
  { id: "deploy", label: "2. Create & deploy" },
  { id: "cost", label: "3. Deployment cost" },
  { id: "verify", label: "4. Verify on Tronscan" },
  { id: "wallets", label: "5. Show it in wallets" },
  { id: "kit", label: "6. Listing kit" },
  { id: "liquidity", label: "7. Liquidity (SunSwap)" },
  { id: "trackers", label: "8. Trackers, Trust Wallet, CEX" },
  { id: "troubleshooting", label: "Troubleshooting" },
  { id: "security", label: "Security & legal" },
];

const STEPS: ChecklistStep[] = [
  { id: "setup", title: "TronLink installed, seed phrase written offline", detail: "One-time. Turn on Show Test Networks.", href: "#setup" },
  { id: "nile", title: "Test run on Nile first", detail: "Free test TRX from the faucet, deploy, verify, add to TronLink.", href: "#setup" },
  { id: "design", title: "Name, symbol, supply, decimals and optional functions final", detail: "These can never change after mainnet deploy.", href: "#deploy" },
  { id: "fund", title: "Mainnet wallet funded", detail: "About 60 TRX for a basic token (about 85 TRX with all optional functions).", href: "#cost" },
  { id: "deploy", title: "Deployed on TRON Mainnet", detail: "Header badge shows TRON Mainnet. You click Sign in TronLink.", href: "#deploy" },
  { id: "verify", title: "Source verified on tronscan.org", detail: "\"Perfect match\" on the Contract tab.", href: "#verify" },
  { id: "wallet", title: "Token added in your TronLink", detail: "One-click button or ⊕ → paste address.", href: "#wallets" },
  { id: "kit", title: "Listing kit downloaded with real project details", detail: "Website, email, description, logo.", href: "#kit" },
  { id: "record", title: "Token recorded on Tronscan with logo", detail: "Signed with the deployer wallet.", href: "#wallets" },
  { id: "website", title: "Website live with add-to-wallet page and logo", detail: "Upload add-to-wallet.html and the logo from the kit.", href: "#kit" },
  { id: "pool", title: "SunSwap TOKEN/TRX pool created", detail: "Real liquidity is what makes prices appear.", href: "#liquidity" },
  { id: "trackers", title: "CoinGecko and CoinMarketCap applications sent", detail: "Use coingecko-coinmarketcap.md from the kit.", href: "#trackers" },
  { id: "trust", title: "(Optional) Trust Wallet assets PR", detail: "After the CoinMarketCap listing. Paid per PR.", href: "#trackers" },
  { id: "audit", title: "(Optional) Independent audit, then CEX applications", detail: "Official forms only. No guarantees.", href: "#trackers" },
];

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="scroll-mt-24 border-b border-zinc-200 pb-2 pt-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:border-zinc-800 dark:text-white">{children}</h2>;
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="pt-2 text-lg font-semibold text-zinc-900 dark:text-white">{children}</h3>;
}
function Code({ children }: { children: React.ReactNode }) {
  return <code className="break-all rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.85em] dark:bg-zinc-800">{children}</code>;
}
function A({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-rose-600 underline-offset-4 hover:underline dark:text-rose-400">{children}</a>;
}
function Note({ tone = "info", children }: { tone?: "info" | "warn" | "ok"; children: React.ReactNode }) {
  const c = {
    info: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200",
    warn: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200",
  }[tone];
  return <div className={`rounded-xl border px-4 py-3 text-sm ${c}`}>{children}</div>;
}
function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          <tr>{head.map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="px-4 py-2.5 align-top">{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

export default function GuidePage() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">On this page</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm lg:flex-col">
          {toc.map((t) => <li key={t.id}><a href={`#${t.id}`} className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">{t.label}</a></li>)}
        </ul>
      </aside>

      <article className="max-w-3xl space-y-5 leading-7 text-zinc-700 dark:text-zinc-300 [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6">
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">TRC-20 launch playbook</h1>
          <p>
            Everything, in order, to launch any token on TRON with this app: wallet setup, test run, mainnet deploy, verification,
            wallets, logo, liquidity and listings. It&apos;s reusable: tick the checklist, then press <i>Reset</i> for your next token.
          </p>
          <Note tone="warn"><b>{DISCLAIMER}</b></Note>
        </header>

        <section id="playbook" className="scroll-mt-24">
          <GuideChecklist steps={STEPS} />
        </section>

        <H2 id="appear">Will my token appear in every wallet? (honest answer)</H2>
        <p>
          <b>No tool, contract or guide can guarantee 100%.</b> Wallets, trackers and exchanges each decide for themselves. What this
          playbook guarantees is that every step under <i>your</i> control is done correctly, so nothing is rejected because of a mistake on your side.
        </p>
        <Table
          head={["Situation", "Shows up?"]}
          rows={[
            ["Token on Nile / Shasta testnet", "Only in TronLink switched to that testnet. Real wallets never show testnet tokens."],
            ["Mainnet token, holder adds it (address or your one-click button)", <b key="a">Yes, in every TRON wallet</b>],
            ["Mainnet token with Tronscan record + logo", "Logo appears in TronLink and Tronscan-based apps after approval."],
            ["Mainnet token with SunSwap pool + CoinGecko / CoinMarketCap listing", "Price and logo appear in most TRON wallets (TronLink, Binance Wallet, Trust Wallet, OKX, Bitget…). Each wallet still has its own rules."],
            ["Wallets without TRON support (e.g. MetaMask, Phantom)", <b key="n">Never</b>],
            ["Binance / Bybit exchange listing", "Only through their own review. Nobody can guarantee it."],
          ]}
        />

        <H2 id="setup">1. One-time wallet setup</H2>
        <ol>
          <li>Install <A href="https://www.tronlink.org/">TronLink</A> (Chrome, Brave or Edge). Create a wallet and write the seed phrase on paper. <b>Never type it into any website or share it.</b></li>
          <li><b>Show test networks:</b> TronLink → ⚙️ settings → <i>Networks</i> → turn on <b>Show Test Networks</b>.</li>
          <li><b>Switch network:</b> on TronLink&apos;s main screen click the <b>red round TRON logo</b> at the top-right (next to ⚙️) and pick <b>Nile Testnet</b>. Back on the app, the header badge turns green: <i>Nile Testnet</i>.</li>
          <li><b>Free test TRX:</b> open the <A href="https://nileex.io/join/getJoinPage">Nile faucet</A>, paste your address (TronLink → copy icon next to it), click <i>Obtain</i>. You get <b>1,000 test TRX</b>. TronLink may show a dollar value next to them; that&apos;s only display, test TRX is worth nothing.</li>
          <li>For the real launch, switch back to <b>Mainnet</b> the same way and fund the wallet with real TRX (see section 3).</li>
        </ol>

        <H2 id="deploy">2. Create and deploy</H2>
        <H3>In the Forge (recommended)</H3>
        <ol>
          <li><b>Token details</b> in the <Link href="/" className="font-medium text-rose-600 dark:text-rose-400">Forge</Link>:
            <ul>
              <li><b>Name / symbol:</b> letters and digits only. Names copying USDT, Tether, TRX or containing &quot;USD&quot; are blocked.</li>
              <li><b>Supply:</b> whole tokens, minted once to your wallet. Cost doesn&apos;t depend on supply.</li>
              <li><b>Decimals (0–18):</b> 6 is the TRON standard, 18 is Ethereum style, 0 means indivisible.</li>
              <li><b>Optional functions</b> (none give anyone admin power): <i>Burn</i> (holders destroy their own tokens, supply can only go down), <i>Batch transfer</i> (airdrop to up to {MAX_BATCH} wallets in one transaction), <i>Interface detection</i> (ERC-165), <i>Timed sends</i> (send with an expiry; unclaimed tokens come back to you).</li>
            </ul>
          </li>
          <li><b>Contract:</b> review the code. Download the <Code>.sol</Code> if you like.</li>
          <li><b>Compile:</b> uses TRON&apos;s official <Code>solc {COMPILER.longVersion}</Code> in your browser, the same compiler Tronscan verifies with. A safety check confirms the expected functions are present and nothing else (no mint, owner, pause, blacklist or payable).</li>
          <li><b>Cost:</b> pick the network. The deployment is simulated on a live node, so the number is exact.</li>
          <li><b>Deploy:</b> connect TronLink. All four checks must be green (connected, right network, cost, enough TRX). Tick the acknowledgement (and the mainnet box), click <b>Deploy</b>, then click <b>Sign</b> in the TronLink popup.</li>
          <li>About 5 seconds later you get the <b>contract address</b>, the transaction, the TRX burned, and an on-chain check that <Code>totalSupply()</Code> matches.</li>
        </ol>
        <Note><b>Write down the contract address.</b> Everything after this (verify, wallets, listings) uses it. After a mainnet deploy, name, symbol, supply, decimals and functions can never change.</Note>

        <H3>Alternative: manually with TronIDE</H3>
        <ol>
          <li>Download the <Code>.sol</Code> from the Forge (Contract step) and open <A href="https://www.tronide.io/">tronide.io</A>.</li>
          <li>Compile with <Code>{COMPILER.version}</Code>, optimization <b>on</b>, <Code>{COMPILER.optimizer.runs}</Code> runs.</li>
          <li>Deploy &amp; Run → <i>Injected TronWeb</i> → fee limit 150–200 TRX → Deploy → Sign in TronLink.</li>
        </ol>

        <H2 id="cost">3. Deployment cost</H2>
        <p>Measured for contracts from this app (energy price 100 sun, Nov 2026). The Cost step always shows the live, exact number.</p>
        <Table
          head={["Contract", "Energy", "TRX if burned"]}
          rows={[
            ["Basic token", "≈ 440,000", <b key="b">≈ 47–48 TRX</b>],
            ["+ Burn", "+ ≈ 110,000", "+ ≈ 11 TRX"],
            ["+ Batch transfer", "+ ≈ 105,000", "+ ≈ 11 TRX"],
            ["+ Interface detection", "+ ≈ 24,000", "+ ≈ 2.5 TRX"],
            ["+ Timed sends", "+ ≈ 460,000", "+ ≈ 48 TRX"],
          ]}
        />
        <ul>
          <li>You pay to store the contract code once, <b>not per token</b>: 50 tokens and 1 billion cost the same.</li>
          <li>The <b>fee limit</b> (e.g. 100 TRX) is only a safety cap. You&apos;re charged what is used, and a balance a little above the real cost is enough.</li>
          <li><b>Pay less:</b> rent or stake energy before deploying. Then you only burn about 3.4 TRX of bandwidth.</li>
          <li>Testnets cost nothing real. On Nile the deploy burned 47.14 test TRX, exactly as simulated.</li>
        </ul>

        <H2 id="verify">4. Verify the source on Tronscan</H2>
        <ol>
          <li>Open <A href="https://tronscan.org/#/contracts/verify">tronscan.org/#/contracts/verify</A> (testnet: <A href="https://nile.tronscan.org/#/contracts/verify">nile.tronscan.org</A>).</li>
          <li>Fill in <b>exactly</b>:</li>
        </ol>
        <Table
          head={["Field", "Value"]}
          rows={[
            ["Contract Address", "your contract address (T…)"],
            ["Main Contract", <span key="m"><Code>{"<SYMBOL>Token"}</Code>, e.g. <Code>BAMAToken</Code></span>],
            ["Solidity Compiler Version", <span key="c"><Code>tron_v{COMPILER.longVersion}</Code> (scroll the list; default is a newer one)</span>],
            ["License", "MIT License (MIT)"],
            ["Optimization", "Activated"],
            ["Runs", <span key="r"><Code>{COMPILER.optimizer.runs}</Code>. <b>The form starts at 0. Change it!</b></span>],
            ["VM version", "default"],
            ["Contract File", "upload the generated .sol unchanged"],
          ]}
        />
        <ol start={3}>
          <li>Tronscan asks to <b>connect your wallet</b> (TronLink → Connect → approve).</li>
          <li>Tick <b>I&apos;m not a robot</b>, click <b>Verify And Publish</b>. Success shows <i>Contract Source Code Verified (Perfect match)</i>.</li>
        </ol>

        <H2 id="wallets">5. Show the token in wallets</H2>
        <H3>Your own TronLink (instant)</H3>
        <ul>
          <li><b>One click:</b> after deploying, click <i>Add TOKEN to TronLink</i> in the Forge and confirm. Works on mainnet and Nile. Some TronLink versions don&apos;t support this; the app then shows the manual steps.</li>
          <li><b>Manual:</b> TronLink main screen → <b>⊕</b> icon next to <i>Tokens</i> → paste the contract address → Add.</li>
          <li>A <b>yellow placeholder icon</b> is normal until the Tronscan record with logo is approved.</li>
        </ul>
        <H3>Reuse your tokens any time: My tokens</H3>
        <ul>
          <li>Every token you deploy in the Forge is <b>saved automatically</b> on the <Link href="/tokens" className="font-medium text-rose-600 dark:text-rose-400">My tokens</Link> page (per network, in this browser).</li>
          <li>For any other TRC-20, paste its address once in <b>Import a token</b>. Name, symbol and decimals are read from the chain.</li>
          <li>Each token shows your <b>live balance</b> and has <b>Send</b> (recipient + amount → Review → sign in TronLink), <b>Add to TronLink</b>, Tronscan, Copy address and Remove.</li>
          <li>Send checks everything before TronLink opens: valid address, not the token contract, amount within balance and allowed decimals. A transfer costs about 1–3 TRX in fees.</li>
          <li>Tokens saved on another network appear at the bottom. Switch TronLink to that network to use them.</li>
          <li><b>History</b> lists the last 50 transfers of that token for your wallet, with every address labelled (<i>You</i>, <i>Created</i>, or <i>token CONTRACT (not a wallet)</i>). Use it to see exactly where tokens went.</li>
          <li><b>Receive = your wallet address</b> (shown at the top of My tokens). A token&apos;s contract address is not a wallet: anything sent there is stuck forever, so My tokens blocks it.</li>
        </ul>
        <H3>Test again and again: timed sends</H3>
        <p>Only for tokens deployed with <b>Timed sends</b> ticked (the card shows a green <i>Timed sends</i> badge). Older tokens can&apos;t get it: the contract code is permanent.</p>
        <ol>
          <li>My tokens → <b>Send</b> → pick an <b>Expiry</b> (1 minute … 7 days, or custom up to 365 days) → Review → <b>Confirm &amp; lock</b>.</li>
          <li>The tokens leave your balance and wait inside the token contract. The recipient sees them under <b>Timed sends</b> on their My tokens page and clicks <b>Claim</b> before the expiry. Claimed tokens are normal tokens, final and permanent.</li>
          <li>If nobody claims in time, your <b>Reclaim</b> button appears when the countdown ends. Click it and the tokens return to your balance, ready for the next test.</li>
          <li>Testing alone: send with a 1-minute expiry to any address (even one you mistyped), wait, Reclaim. Or send to yourself and Claim. Each lock costs about 5–10 TRX, claim/reclaim about 1–3 TRX (free test TRX on Nile).</li>
          <li>The recipient&apos;s balance does <b>not</b> rise until they claim, and claimed tokens never disappear. Tokens that show up in a wallet and later vanish are how &quot;flash USDT&quot; scams work, so this contract deliberately can&apos;t do that.</li>
        </ol>
        <H3>Top up a second test wallet</H3>
        <p>On a testnet, My tokens shows <b>Top up a test wallet</b>. It sends coins you already hold to another test wallet in one go, so that wallet can receive, claim and pay its own fees.</p>
        <ol>
          <li>Paste the other wallet&apos;s address (copy it in that TronLink with the copy icon). Recent ones are remembered in this browser.</li>
          <li>Enter amounts, or tap a preset: <b>TRX</b> (fees), the <b>official Nile test USDT</b> (<Code>TXYZop…kAeBf</Code>) and any of your own tokens. Leave a row empty to skip it.</li>
          <li>Review, then sign once per coin in TronLink. TRX goes first, because it activates a brand-new wallet and makes the token transfers cheaper. If you reject one, the rest stop; <b>Retry the rest</b> continues.</li>
          <li>It keeps about 2 TRX + 15 TRX per token transfer in your wallet for fees, and it never runs on mainnet.</li>
          <li>It can&apos;t create TRX or USDT. Claim them for your main wallet on the <A href="https://nileex.io/join/getJoinPage">Nile faucet</A>, then share them out. Tokens whose name or symbol copies a real coin (USDT, TETHER, …) are not offered; only the official test USDT is.</li>
        </ol>
        <H3>Logo everywhere on TRON: Tronscan record</H3>
        <ol>
          <li>Wait about 15 minutes after deploying (Tronscan detects the token automatically).</li>
          <li>Open <A href="https://tronscan.org/#/tokens/create/Type">Tronscan → Record Token</A> → <b>TRC20</b>.</li>
          <li>Copy the values from <Code>tronscan-record.txt</Code> (Listing kit). Upload <Code>logo-200.png</Code>. Name and symbol must match the contract exactly.</li>
          <li>Sign with the <b>deployer wallet</b>. Only the issuer can edit the info later. An email on your own website&apos;s domain speeds up review.</li>
        </ol>

        <H2 id="kit">6. Listing kit (one ZIP for every submission)</H2>
        <p>In the Forge&apos;s <b>Verify</b> step, fill in website, email, description and socials, upload a square logo (or use the generated coin), then click <b>Download listing kit</b>. It contains:</p>
        <Table
          head={["File", "Used for"]}
          rows={[
            [<Code key="1">tronscan-record.txt</Code>, "Tronscan Record Token values"],
            [<Code key="2">logo-200.png</Code>, "Tronscan logo upload (200×200)"],
            [<Code key="3">trustwallet/…/info.json + logo.png</Code>, "Trust Wallet assets PR (256×256, under 100 KB, exact format)"],
            [<Code key="4">tokenlist.json</Code>, "Token list for your website / aggregators (TRON chain id 728126428)"],
            [<Code key="5">coingecko-coinmarketcap.md</Code>, "Facts for CoinGecko / CoinMarketCap forms"],
            [<Code key="6">add-to-wallet.html</Code>, "One-click Add to TronLink page for your website"],
            [<Code key="7">*.sol + abi.json</Code>, "Verified source and ABI"],
            [<Code key="8">README.md</Code>, "The submission order"],
          ]}
        />
        <Note tone="warn">Generate the kit <b>after the mainnet deploy</b> with your real details. A kit for a testnet address is marked TESTNET and must not be submitted.</Note>

        <H2 id="liquidity">7. Liquidity on SunSwap (makes it tradable)</H2>
        <ol>
          <li>Open <A href="https://sun.io">sun.io</A> (SunSwap), connect TronLink on <b>mainnet</b>.</li>
          <li>Pool → <b>Add liquidity</b> → choose <b>TRX</b> and paste your token&apos;s contract address.</li>
          <li>The amounts you deposit set the <b>starting price</b> (e.g. 1,000 TRX + 1,000,000 tokens = 0.001 TRX per token). Double-check before confirming.</li>
          <li>Approve the token, then confirm the pool in TronLink. You receive LP tokens.</li>
          <li>Optional but trusted: <b>lock the LP tokens</b> with a reputable locker and publish the lock link.</li>
        </ol>
        <Note tone="warn">This puts real TRX in a public pool, and its value can fall to near zero. Only use money you can afford to lose. This is not financial advice.</Note>

        <H2 id="trackers">8. CoinGecko, CoinMarketCap, Trust Wallet, exchanges</H2>
        <ol>
          <li><b>CoinGecko</b> (<A href="https://www.coingecko.com/request-form">request form</A>) and <b>CoinMarketCap</b> (<A href="https://support.coinmarketcap.com">support → listing request</A>): use <Code>coingecko-coinmarketcap.md</Code>. They expect an active trading pair with real volume, the pool address, and circulating-supply proof. Their price data is what most wallets, Binance Wallet included, display.</li>
          <li><b>Trust Wallet</b> (<A href="https://assets.trustwallet.com">assets.trustwallet.com</A>): PR with the kit&apos;s <Code>trustwallet/</Code> folder. Current rules: a paid fee per PR (500 TWT or 2.5 BNB at the time of writing), a CoinMarketCap listing first, and brand-new or low-activity tokens are rejected.</li>
          <li><b>Audit</b> (CertiK, SlowMist, Hacken…), then <b>centralized exchanges</b> via their official listing pages only. Anyone promising a &quot;guaranteed listing&quot; in DMs is running a scam.</li>
        </ol>

        <H2 id="troubleshooting">Troubleshooting</H2>
        <Table
          head={["Problem", "Fix"]}
          rows={[
            ["Header badge says TRON Mainnet but you want Nile", "TronLink → red TRON logo (top-right) → Nile Testnet. If Nile is missing: ⚙️ → Networks → Show Test Networks."],
            ["\"Switch TronLink to Nile\" says your TronLink can't switch", "Normal for some versions. Switch manually as above."],
            ["Compile fails: could not download the compiler", "Check internet, VPN or ad-blocker, then click Compile again. It downloads about 8 MB once."],
            ["Deploy waits for \"your signature\"", "Click the TronLink icon in the toolbar; the Sign request is there. If you rejected it, click Deploy again."],
            ["\"Not enough TRX\" / account not activated", "Send TRX to the wallet first (faucet on testnet)."],
            ["Steps reset after switching network", "TronLink reloads the page on network change. Your token details are saved; just Compile again."],
            ["New token not visible in TronLink", "Tokens aren't added automatically. Use the one-click button or ⊕ → paste address."],
            ["Tronscan verification fails", "Compiler must be tron_v0.8.20+commit.5f1834b, Runs 200 (not 0), Main Contract <SYMBOL>Token, file unchanged."],
            ["Red \"hydration\" error in dev mode", "A browser extension (e.g. FoxClocks) changed the page. Harmless and already suppressed on <html>."],
          ]}
        />

        <H2 id="security">Security and legal notes</H2>
        <ul>
          <li><b>Supply:</b> minted once in the constructor. No function can ever create tokens. With <i>Burn</i> enabled, supply can only go <b>down</b>.</li>
          <li><b>No privileged roles:</b> no owner, admin, pause, blacklist, freeze, seize, taxes or proxy. Nobody can change the contract after deployment.</li>
          <li><b>Safe math:</b> Solidity 0.8 checked arithmetic plus explicit <Code>require</Code> guards (OpenZeppelin pattern).</li>
          <li><b>Loss prevention:</b> transfers to the zero address or to the token contract revert, and the contract rejects TRX. Batch transfers are all-or-nothing.</li>
          <li><b>Allowances:</b> prefer <Code>increaseAllowance</Code> / <Code>decreaseAllowance</Code> over re-approving. <Code>2^256−1</Code> means unlimited.</li>
          <li><b>Energy:</b> deployed with <Code>userFeePercentage = 100</Code>, so token users pay their own energy and can&apos;t drain the deployer.</li>
          <li><b>Names and logos:</b> don&apos;t use real people&apos;s names, photos or likeness, or other projects&apos; brands. It can break publicity and trademark law and gets tokens rejected by exchanges.</li>
          <li><b>Seed phrase:</b> never type it into a website, chat or form. No legitimate service asks for it.</li>
          <li>This tool is not an audit and not financial advice. Never present a token as a stablecoin or promise returns.</li>
        </ul>
      </article>
    </div>
  );
}
