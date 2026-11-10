"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, CheckCircle2, Coins, Download, ExternalLink as ExtIcon, History, Loader2, PlusCircle, RefreshCw, Send, Timer, Trash2, Wallet } from "lucide-react";
import { readTokens, removeToken, saveToken, TOKENS_EVENT, TOKENS_KEY, type SavedToken } from "@/lib/token-store";
import { AmountError, formatUnits, parseUnits } from "@/lib/units";
import { explorerContract, explorerTx, NETWORKS, TRON_ADDRESS } from "@/lib/tron/networks";
import { humanDuration } from "@/lib/duration";
import { MAX_TIMED_SECONDS, MIN_TIMED_SECONDS } from "@/lib/token/schema";
import {
  addTokenToWallet, getTronWeb, isContractAddress, readBalance, readTokenInfo, sendToken, supportsTimedSends, type SendProgress,
} from "@/lib/tron/tronlink";
import { readTokens as readSaved } from "@/lib/token-store";
import { useWalletCtx } from "./WalletProvider";
import { shortAddr } from "./SiteHeader";
import { Badge, Button, Callout, Card, CardHeader, CopyButton, cx, Field, inputClass, Skeleton } from "./ui";

// Panels below the card are only needed after a click (History) or for timed-send tokens,
// so they are split into their own chunk and fetched on demand.
const PanelFallback = () => <div className="space-y-2 border-t border-zinc-200 p-5 dark:border-zinc-800"><Skeleton className="h-4 w-40" /><Skeleton className="h-12 w-full" /></div>;
const TimedSends = dynamic(() => import("./TokenPanels").then((m) => m.TimedSends), { ssr: false, loading: PanelFallback });
const HistoryPanel = dynamic(() => import("./TokenPanels").then((m) => m.HistoryPanel), { ssr: false, loading: PanelFallback });
// Testnet-only tool, collapsed by default: its code loads in its own chunk.
const TopUp = dynamic(() => import("./TopUp").then((m) => m.TopUp), { ssr: false, loading: () => <Card><div className="flex items-center gap-3 p-5"><Skeleton className="h-10 w-10 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-44" /><Skeleton className="h-3 w-80 max-w-full" /></div></div></Card> });

/** Placeholder with the same shape as the loaded page, so nothing jumps when data arrives. */
export function MyTokensSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading your tokens">
      <Card><div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="w-full max-w-md space-y-2"><Skeleton className="h-4 w-64 max-w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-3 w-72 max-w-full" /></div><Skeleton className="h-9 w-44" /></div></Card>
      <Card><div className="space-y-3 p-5"><Skeleton className="h-4 w-36" /><div className="flex gap-3"><Skeleton className="h-11 flex-1" /><Skeleton className="h-11 w-28" /></div></div></Card>
      {Array.from({ length: cards }, (_, i) => (
        <Card key={i}>
          <div className="flex items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-3"><Skeleton className="h-11 w-11 rounded-xl" /><div className="space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-64 max-w-[50vw]" /></div></div>
            <div className="space-y-2 text-right"><Skeleton className="ml-auto h-3 w-20" /><Skeleton className="h-6 w-36" /></div>
          </div>
          <div className="flex gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">{["w-20", "w-24", "w-24", "w-32"].map((w, i) => <Skeleton key={i} className={cx("h-8", w)} />)}</div>
        </Card>
      ))}
    </div>
  );
}

export function MyTokens() {
  const { wallet, connect, connecting, ready } = useWalletCtx();
  const [tokens, setTokens] = useState<SavedToken[] | null>(null);

  useEffect(() => {
    const load = () => setTokens(readTokens());
    load();
    const onStorage = (e: StorageEvent) => e.key === TOKENS_KEY && load();
    window.addEventListener(TOKENS_EVENT, load);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(TOKENS_EVENT, load);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const net = wallet.status === "connected" ? wallet.network : null;
  const list = tokens ?? [];
  const here = net ? list.filter((t) => t.network === net) : [];
  const elsewhere = list.filter((t) => t.network !== net);
  // Render nothing data-dependent until BOTH the saved list and TronLink are known: otherwise the
  // page first paints "Connect" / "No tokens" and then swaps to the real list (layout shift).
  const settling = tokens === null || !ready;

  return (
    <div className="space-y-8">
      <div className="max-w-3xl space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">My tokens</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Tokens you deploy are saved here automatically. Import any other TRC-20 once by its address. Then check balances and send without repeating any setup.
          The list is stored in this browser only.
        </p>
      </div>

      {settling ? (
        <MyTokensSkeleton cards={Math.max(1, Math.min(3, list.length))} />
      ) : wallet.status !== "connected" ? (
        <Card>
          <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
            <Wallet className="h-8 w-8 text-zinc-400" aria-hidden />
            <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">Connect TronLink to see balances and send tokens.</p>
            <Button onClick={connect} loading={connecting} icon={<Wallet className="h-4 w-4" />}>
              {wallet.status === "unavailable" ? "Connect TronLink" : "Unlock TronLink"}
            </Button>
          </div>
        </Card>
      ) : !net ? (
        <Callout tone="warning" title="Unknown network">TronLink is on a custom node ({wallet.host}). Switch to TRON Mainnet, Nile or Shasta.</Callout>
      ) : (
        <>
          <Card>
            <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium">Your wallet address <span className="font-normal text-zinc-500">(use this to RECEIVE tokens)</span></p>
                <p className="break-all font-mono text-sm">{wallet.address}</p>
                <p className="text-xs text-zinc-500">Balances below are what this wallet holds. Token contract addresses are not wallets.</p>
              </div>
              <CopyButton value={wallet.address} label="Copy wallet address" />
            </div>
          </Card>
          {NETWORKS[net].testnet && <TopUp network={net} owner={wallet.address} />}
          <ImportToken network={net} existing={list} />
          {here.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                <Coins className="h-8 w-8 text-zinc-400" aria-hidden />
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  No tokens saved for <b>{NETWORKS[net].label}</b> yet. Deploy one in the <Link href="/" className="font-medium text-rose-600 dark:text-rose-400">Forge</Link> or import one above.
                </p>
              </div>
            </Card>
          ) : (
            <div className="grid gap-4">
              {here.map((t) => <TokenCard key={`${t.network}:${t.address}`} token={t} owner={wallet.address} />)}
            </div>
          )}
        </>
      )}

      {!settling && elsewhere.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-500">Saved on other networks</h2>
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {elsewhere.map((t) => (
              <li key={`${t.network}:${t.address}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <b>{t.symbol}</b> <span className="text-zinc-500">{t.name}</span>{" "}
                  <Badge tone={t.network === "mainnet" ? "danger" : "neutral"}>{NETWORKS[t.network].label}</Badge>
                  <span className="block font-mono text-xs text-zinc-500">{t.address}</span>
                </span>
                <span className="text-xs text-zinc-500">Switch TronLink to {NETWORKS[t.network].label} to use it</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ImportToken({ network, existing }: { network: SavedToken["network"]; existing: SavedToken[] }) {
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "danger" | "success"; text: string } | null>(null);

  const run = async () => {
    setMsg(null);
    const a = address.trim();
    if (!TRON_ADDRESS.test(a)) return setMsg({ tone: "danger", text: "That isn't a valid TRON contract address (starts with T, 34 characters)." });
    if (existing.some((t) => t.address === a && t.network === network)) return setMsg({ tone: "success", text: "Already in your list." });
    setBusy(true);
    try {
      const info = await readTokenInfo(a);
      saveToken({ address: a, network, name: info.name, symbol: info.symbol, decimals: info.decimals, addedAt: Date.now(), source: "imported" });
      setAddress("");
      setMsg({ tone: "success", text: `Imported ${info.symbol} (${info.name}).` });
    } catch (e) {
      setMsg({ tone: "danger", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader icon={<Download className="h-4 w-4" />} title="Import a token" subtitle={`Paste a TRC-20 contract address on ${NETWORKS[network].label}. Name, symbol and decimals are read from the chain.`} />
      <form className="flex flex-col gap-3 p-5 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <label htmlFor="import-address" className="sr-only">Token contract address</label>
        <input id="import-address" className={cx(inputClass(), "font-mono")} placeholder="T…" value={address} onChange={(e) => setAddress(e.target.value.trim())} autoComplete="off" />
        <Button type="submit" loading={busy} icon={<PlusCircle className="h-4 w-4" />} className="shrink-0">Import</Button>
      </form>
      {msg && <div className="px-5 pb-5"><Callout tone={msg.tone}>{msg.text}</Callout></div>}
    </Card>
  );
}

function TokenCard({ token, owner }: { token: SavedToken; owner: string }) {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [balErr, setBalErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [addMsg, setAddMsg] = useState<string | null>(null);
  const [panel, setPanel] = useState<"history" | null>(null);
  const [timed, setTimed] = useState<boolean | null>(token.features?.timed ? true : null);
  // bumps after every send/claim/reclaim so the panels reload
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    void supportsTimedSends(token.address).then((ok) => live && setTimed(ok));
    return () => { live = false; };
  }, [token.address]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setBalErr(null);
    try {
      setBalance(await readBalance(token.address, owner));
    } catch (e) {
      setBalErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token.address, owner]);
  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <Card>
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-rose-500 to-red-700 font-mono text-xs font-bold text-white">{token.symbol.slice(0, 4)}</div>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              {token.name} <span className="font-mono text-xs text-zinc-500">${token.symbol}</span>
              <Badge tone={token.network === "mainnet" ? "danger" : "neutral"}>{NETWORKS[token.network].label}</Badge>
              {token.source === "deployed" && <Badge tone="brand">Deployed here</Badge>}
              {timed && <Badge tone="success">Timed sends</Badge>}
            </p>
            <p className="truncate text-xs text-zinc-500" title="This identifies the token. It is NOT a wallet: never send tokens to it.">
              Token contract: <span className="font-mono">{token.address}</span>
            </p>
          </div>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs text-zinc-500">Your balance</p>
          <p className="text-xl font-semibold tabular-nums">
            {loading && balance === null ? <Loader2 className="inline h-4 w-4 animate-spin" /> : balance !== null ? `${formatUnits(balance, token.decimals)} ${token.symbol}` : "–"}
          </p>
          {balErr && <p className="text-xs text-red-600 dark:text-red-400">{balErr}</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
        <Button size="sm" onClick={() => setOpen((o) => !o)} icon={<Send className="h-4 w-4" />} disabled={balance === 0n}>Send</Button>
        <Button size="sm" variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={() => { void refresh(); setVersion((v) => v + 1); }} loading={loading}>Refresh</Button>
        <Button size="sm" variant={panel === "history" ? "primary" : "secondary"} icon={<History className="h-4 w-4" />} onClick={() => setPanel((p) => (p === "history" ? null : "history"))}>History</Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<PlusCircle className="h-4 w-4" />}
          onClick={async () => {
            try { await addTokenToWallet(token.address); setAddMsg("Added to TronLink."); } catch (e) { setAddMsg(`${(e as Error).message} Use TronLink → ⊕ → paste the address.`); }
          }}
        >
          Add to TronLink
        </Button>
        <CopyButton value={token.address} label="Copy contract" />
        <a href={explorerContract(token.network, token.address)} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="ghost" icon={<ExtIcon className="h-4 w-4" />}>Tronscan</Button></a>
        <Button size="sm" variant="ghost" className="sm:ml-auto" icon={<Trash2 className="h-4 w-4" />} onClick={() => { if (window.confirm(`Remove ${token.symbol} from this list? (The token itself is not affected.)`)) removeToken(token); }}>
          Remove
        </Button>
      </div>
      {addMsg && <div className="px-5 pb-3 text-xs text-zinc-500">{addMsg}</div>}
      {balance === 0n && <div className="px-5 pb-4 text-xs text-zinc-500">This wallet holds no {token.symbol}, so there&apos;s nothing to send.</div>}

      {open && balance !== null && balance > 0n && (
        <SendForm token={token} owner={owner} balance={balance} timed={!!timed} onClose={() => setOpen(false)} onSent={() => { void refresh(); setVersion((v) => v + 1); }} />
      )}
      {timed && <TimedSends token={token} owner={owner} version={version} onSettled={() => { void refresh(); setVersion((v) => v + 1); }} />}
      {panel === "history" && <HistoryPanel token={token} owner={owner} version={version} />}
    </Card>
  );
}

const EXPIRY_PRESETS = [
  { label: "No expiry (normal send)", seconds: 0 },
  { label: "1 minute", seconds: 60 },
  { label: "10 minutes", seconds: 600 },
  { label: "1 hour", seconds: 3600 },
  { label: "1 day", seconds: 86_400 },
  { label: "7 days", seconds: 604_800 },
  { label: "Custom…", seconds: -1 },
] as const;


function SendForm({ token, owner, balance, timed, onClose, onSent }: { token: SavedToken; owner: string; balance: bigint; timed: boolean; onClose: () => void; onSent: () => void }) {
  const [to, setTo] = useState("");
  const [expiry, setExpiry] = useState(0);
  const [customMin, setCustomMin] = useState("30");
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);
  const [review, setReview] = useState(false);
  const [allowSelf, setAllowSelf] = useState(false);
  const [isContract, setIsContract] = useState<boolean | null>(null);
  const [allowContract, setAllowContract] = useState(false);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<SendProgress | null>(null);

  let raw: bigint | null = null;
  let amountErr: string | undefined;
  try {
    raw = parseUnits(amount, token.decimals);
    if (raw > balance) amountErr = `More than your balance (${formatUnits(balance, token.decimals)}).`;
  } catch (e) {
    amountErr = amount ? (e instanceof AmountError ? e.message : "Invalid amount.") : "Enter an amount.";
  }
  const savedContract = TRON_ADDRESS.test(to) ? readSaved().find((t) => t.address === to) : undefined;
  const toErr = !to ? "Enter the recipient's address." : !TRON_ADDRESS.test(to) ? "Not a valid TRON address (starts with T, 34 characters)."
    : getTronWeb()?.isAddress?.(to) === false ? "This address has a typo: its checksum is wrong, so it doesn't exist. Copy-paste the address instead of typing it."
    : to === token.address ? "That's the token contract itself; tokens sent there are rejected."
    : savedContract ? `That's the CONTRACT address of your ${savedContract.symbol} token (${shortAddr(savedContract.address)}), not a wallet. Sending there doesn't add to that card's balance; the tokens would be stuck forever. To receive, use a WALLET address (yours is at the top of this page).`
    : undefined;
  const isSelf = !toErr && to === owner;
  const durationSec = expiry === -1 ? Math.round(Number(customMin) * 60) : expiry;
  const expiryErr = expiry === -1 && (!/^\d+(\.\d+)?$/.test(customMin) || durationSec < MIN_TIMED_SECONDS || durationSec > MAX_TIMED_SECONDS)
    ? "Enter 1 to 525,600 minutes (365 days)." : undefined;
  const isTimed = timed && expiry !== 0 && !expiryErr;
  const knownToken = undefined as SavedToken | undefined; // saved token contracts are hard-blocked above
  const valid = !amountErr && !toErr && !expiryErr && raw !== null && (!isSelf || allowSelf) && (!isContract || allowContract);
  const busy = progress && (progress.phase === "signing" || progress.phase === "confirming");

  if (progress?.phase === "done") {
    return (
      <div className="space-y-3 border-t border-zinc-200 p-5 dark:border-zinc-800">
        <Callout tone="success" title={isTimed ? `Locked ${amount} ${token.symbol} for ${humanDuration(durationSec)}` : `Sent ${amount} ${token.symbol}`}>
          {isTimed && <>The recipient must <b>Claim</b> it before it expires; if they don&apos;t, you can <b>Reclaim</b> it below. </>}
          To <span className="font-mono">{shortAddr(to)}</span>
          {progress.feeSun !== undefined && <> · fee {(progress.feeSun / 1e6).toLocaleString("en-US", { maximumFractionDigits: 3 })} TRX</>} ·{" "}
          <a className="underline" href={explorerTx(token.network, progress.txid)} target="_blank" rel="noopener noreferrer">view transaction</a>
        </Callout>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => { setProgress(null); setReview(false); setAmount(""); setTo(""); setTouched(false); }} icon={<Send className="h-4 w-4" />}>Send again</Button>
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-4 border-t border-zinc-200 p-5 dark:border-zinc-800"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setTouched(true);
        if (!valid || !raw) return;
        if (!review) {
          // Look the recipient up on-chain once before the review screen.
          setChecking(true);
          const contract = !!knownToken || (await isContractAddress(to));
          setChecking(false);
          setIsContract(contract);
          if (contract && !allowContract) return;
          return setReview(true);
        }
        await sendToken({ token: token.address, to, raw, allowSelf: isSelf && allowSelf, allowContract: !!isContract && allowContract, durationSec: isTimed ? durationSec : undefined }, (p) => {
          setProgress(p);
          if (p.phase === "done") onSent();
        });
      }}
    >
      {!review ? (
        <>
        <div className="grid items-start gap-x-4 gap-y-4 sm:grid-cols-[minmax(0,1fr)_17rem]">
          <Field id={`to-${token.address}`} label="Recipient address" error={touched ? toErr : undefined}>
            <input id={`to-${token.address}`} className={cx(inputClass(!!(touched && toErr)), "font-mono")} placeholder="T…" value={to} onChange={(e) => { setTo(e.target.value.trim()); setIsContract(null); setAllowContract(false); }} autoComplete="off" />
          </Field>
          <Field id={`amt-${token.address}`} label="Amount" error={touched ? amountErr : undefined}
            hint={<span className="block truncate" title={`${formatUnits(balance, token.decimals)} ${token.symbol}`}>Available: <span className="tabular-nums">{formatUnits(balance, token.decimals)}</span> {token.symbol}</span>}>
            <div className="relative">
              <input id={`amt-${token.address}`} inputMode="decimal" className={cx(inputClass(!!(touched && amountErr)), "pr-28 font-mono tabular-nums")} placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} autoComplete="off" />
              <div className="absolute inset-y-0 right-1.5 flex items-center gap-1.5">
                <span className="max-w-[4.5rem] truncate font-mono text-xs text-zinc-500">{token.symbol}</span>
                <button type="button" className="h-8 rounded-lg bg-zinc-100 px-2.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-rose-100 hover:text-rose-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-rose-500/20 dark:hover:text-rose-300" onClick={() => setAmount(formatUnits(balance, token.decimals, false))}>MAX</button>
              </div>
            </div>
          </Field>
        </div>
        {timed ? (
          <div className="grid items-start gap-x-4 gap-y-4 sm:grid-cols-[minmax(0,1fr)_17rem]">
            <Field id={`exp-${token.address}`} label="Expiry"
              hint={expiry === 0 ? "A normal transfer: the tokens belong to the recipient immediately and forever." : "The tokens wait in the token contract. The recipient must click Claim before the expiry; after it, only you can take them back with Reclaim."}>
              <select id={`exp-${token.address}`} className={cx(inputClass(), "cursor-pointer")} value={expiry} onChange={(e) => setExpiry(Number(e.target.value))}>
                {EXPIRY_PRESETS.map((p) => <option key={p.seconds} value={p.seconds}>{p.label}</option>)}
              </select>
            </Field>
            {expiry === -1 && (
              <Field id={`expmin-${token.address}`} label="Custom duration" error={touched ? expiryErr : undefined}
                hint={!expiryErr ? <>= {humanDuration(durationSec)}</> : undefined}>
                <div className="relative">
                  <input id={`expmin-${token.address}`} inputMode="numeric" className={cx(inputClass(!!(touched && expiryErr)), "pr-16 font-mono tabular-nums")} value={customMin} onChange={(e) => setCustomMin(e.target.value.replace(/[^0-9.]/g, ""))} />
                  <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-xs text-zinc-500">minutes</span>
                </div>
              </Field>
            )}
          </div>
        ) : (
          <p className="flex items-start gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <Timer className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              <b>Expiry (after X minutes / days) isn&apos;t available for this {token.symbol}</b>: it was deployed without <b>Timed sends</b>, and contract code can&apos;t be changed later.
              Every transfer of it is final. To get the Expiry option, deploy a new test token in the <Link href="/" className="font-medium text-rose-600 dark:text-rose-400">Forge</Link> with <b>Timed sends</b> ticked.
            </span>
          </p>
        )}
        {isContract && (
          <label className="flex cursor-pointer gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-red-600" checked={allowContract} onChange={(e) => setAllowContract(e.target.checked)} />
            <span>
              <b>This address is a smart contract{knownToken ? ` (your ${knownToken.symbol} token contract)` : ""}, not a wallet.</b> Tokens sent to a contract
              usually can&apos;t be moved out again and are <b>lost forever</b>. Only tick this if you are sure the contract is built to receive {token.symbol}.
            </span>
          </label>
        )}
        {isSelf && (
          <label className="flex cursor-pointer gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-amber-600" checked={allowSelf} onChange={(e) => setAllowSelf(e.target.checked)} />
            <span>
              <b>This is your own wallet.</b> Your balance won&apos;t change; you only pay the network fee. Tick to send to yourself anyway (fine for testing).
            </span>
          </label>
        )}
        </>
      ) : (
        <div className="space-y-2 rounded-xl bg-zinc-50 p-4 text-sm dark:bg-zinc-950/60">
          <p className="font-medium">{isTimed ? "Check before sending. Once claimed, the transfer can't be reversed." : "Check before sending. Transfers can't be reversed."}</p>
          <dl className="grid grid-cols-[7rem_1fr] gap-y-1">
            <dt className="text-zinc-500">Send</dt><dd className="font-semibold">{amount} {token.symbol}</dd>
            <dt className="text-zinc-500">To</dt><dd className="break-all font-mono text-xs">{to}{isSelf && <span className="ml-2 font-sans text-amber-600">(your own wallet: test send)</span>}{isContract && <span className="ml-2 font-sans font-semibold text-red-600">(SMART CONTRACT: tokens may be lost)</span>}</dd>
            <dt className="text-zinc-500">Expiry</dt>
            <dd>{isTimed ? <>Claim within <b>{humanDuration(durationSec)}</b> (until {new Date(Date.now() + durationSec * 1000).toLocaleString()}). If unclaimed, you can reclaim it.</> : "None: a normal, final transfer"}</dd>
            <dt className="text-zinc-500">Network</dt><dd>{NETWORKS[token.network].label}{token.network !== "mainnet" && " (test tokens, no real value)"}</dd>
            <dt className="text-zinc-500">Network fee</dt><dd>{isTimed ? "about 5–10 TRX (stores the timed send on-chain); claiming or reclaiming later costs about 1–3 TRX" : <>about 1–3 TRX (a bit more if the recipient has never held {token.symbol})</>}</dd>
            {raw !== null && <><dt className="text-zinc-500">Raw units</dt><dd className="font-mono text-xs">{raw.toString()} ({token.decimals} decimals)</dd></>}
          </dl>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            If TronLink shows <i>&quot;undefined&quot;</i> or a <i>precision warning</i>, it just doesn&apos;t know this token yet. Click <b>Add to TronLink</b> above first,
            or check that TronLink&apos;s number equals {token.decimals === 0 ? "the amount above" : <>the raw units above (TronLink then assumes 0 decimals)</>}.
          </p>
        </div>
      )}

      {progress?.phase === "failed" && (
        <Callout tone="danger" title="Not sent">
          {progress.error}
          {progress.txid && <> · <a className="underline" href={explorerTx(token.network, progress.txid)} target="_blank" rel="noopener noreferrer">view transaction</a></>}
        </Callout>
      )}
      {busy && (
        <p className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" />
          {progress?.phase === "signing" ? "Waiting for your signature in TronLink…" : "Waiting for confirmation…"}
          {progress?.phase === "confirming" && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {review && <Button type="button" variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => { setReview(false); setProgress(null); }} disabled={!!busy}>Edit</Button>}
        <Button type="submit" loading={!!busy} icon={<Send className="h-4 w-4" />} variant={review && token.network === "mainnet" ? "danger" : "primary"}>
          {review ? (isTimed ? "Confirm & lock in TronLink" : "Confirm & sign in TronLink") : checking ? "Checking recipient…" : "Review"}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose} disabled={!!busy}>Cancel</Button>
      </div>
    </form>
  );
}
