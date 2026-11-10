"use client";

/**
 * "Top up a test wallet": sends test TRX, the official Nile test USDT and your own test tokens from the
 * connected wallet to another test wallet in one guided flow. Testnets only; every transfer is signed in
 * TronLink. It MOVES coins you already hold; it cannot create TRX or USDT.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, Ban, CheckCircle2, ChevronDown, CircleDashed, HandCoins, Loader2, RefreshCw, RotateCcw, XCircle } from "lucide-react";
import type { SavedToken } from "@/lib/token-store";
import { readTokens } from "@/lib/token-store";
import { AmountError, formatUnits, parseUnits } from "@/lib/units";
import { explorerTx, NETWORKS, TRON_ADDRESS, type NetworkId } from "@/lib/tron/networks";
import { feeReserveSun, hiddenLookalikes, readRecent, rememberRecent, topUpAssets, type TopUpAsset } from "@/lib/tron/topup";
import { assertTestnet, getTronWeb, isContractAddress, readBalance, readTrxBalance, sendToken, sendTrx, type SendProgress } from "@/lib/tron/tronlink";
import { shortAddr } from "./SiteHeader";
import { Badge, Button, Callout, Card, cx, Field, inputClass, Skeleton } from "./ui";

type Bal = bigint | null | undefined; // undefined = loading, null = couldn't read
type StepStatus = "waiting" | "signing" | "confirming" | "done" | "failed" | "skipped";
type Step = { key: string; status: StepStatus; txid?: string; error?: string; feeSun?: number };

const fmt = (v: Bal, a: TopUpAsset) => (v === undefined ? "…" : v === null ? "?" : formatUnits(v, a.decimals));

/** Reads one balance per asset; failures become null so one bad token never blocks the others. */
async function readAll(assets: TopUpAsset[], owner: string): Promise<Record<string, Bal>> {
  const entries = await Promise.all(
    assets.map(async (a) => [a.key, await (a.kind === "trx" ? readTrxBalance(owner) : readBalance(a.address, owner)).catch(() => null)] as const),
  );
  return Object.fromEntries(entries);
}

export function TopUp({ network, owner }: { network: NetworkId; owner: string }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<SavedToken[]>([]);
  const assets = useMemo(() => topUpAssets(network, saved), [network, saved]);
  const lookalikes = useMemo(() => hiddenLookalikes(network, saved), [network, saved]);

  const [to, setTo] = useState("");
  const [touched, setTouched] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [mine, setMine] = useState<Record<string, Bal>>({});
  const [theirs, setTheirs] = useState<Record<string, Bal>>({});
  const [stage, setStage] = useState<"edit" | "review" | "run">("edit");
  const [steps, setSteps] = useState<Step[]>([]);
  const [checking, setChecking] = useState(false);
  const [contractErr, setContractErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSaved(readTokens());
    setRecent(readRecent());
  }, [open]);

  const loadMine = useCallback(() => {
    setMine({});
    readAll(assets, owner).then(setMine);
  }, [assets, owner]);
  useEffect(() => { if (open) loadMine(); }, [open, loadMine]);

  // ---- recipient ----------------------------------------------------------------------------
  const assetAddrs = new Set(assets.flatMap((a) => (a.kind === "trc20" ? [a.address] : [])));
  const savedContract = TRON_ADDRESS.test(to) ? saved.find((t) => t.address === to) : undefined;
  const toErr = !to ? "Paste the test wallet's address."
    : !TRON_ADDRESS.test(to) ? "Not a valid TRON address (starts with T, 34 characters)."
    : getTronWeb()?.isAddress?.(to) === false ? "This address has a typo (wrong checksum). Copy it from the other TronLink with the copy icon."
    : to === owner ? "That's this wallet (the sender). Paste the address of the OTHER test wallet."
    : assetAddrs.has(to) || savedContract ? "That's a token CONTRACT address, not a wallet. Coins sent there are stuck forever."
    : contractErr ?? undefined;
  const validTo = !toErr ? to : null;

  const loadTheirs = useCallback(() => {
    if (!validTo) return setTheirs({});
    setTheirs({});
    readAll(assets, validTo).then(setTheirs);
  }, [assets, validTo]);
  useEffect(() => { if (open) loadTheirs(); }, [open, loadTheirs]);

  // ---- amounts ------------------------------------------------------------------------------
  const picked = assets.filter((a) => (amounts[a.key] ?? "").trim() !== "");
  const tokenCount = picked.filter((a) => a.kind === "trc20").length;
  const reserve = feeReserveSun(tokenCount);
  const myTrx = mine.TRX;

  const errors: Record<string, string | undefined> = {};
  const raws: Record<string, bigint> = {};
  for (const a of picked) {
    try {
      const raw = parseUnits(amounts[a.key], a.decimals);
      const have = mine[a.key];
      if (have === null) errors[a.key] = "Couldn't read your balance of this coin. Click Refresh.";
      else if (have !== undefined && raw > have) errors[a.key] = `More than you have (${formatUnits(have, a.decimals)} ${a.symbol}).`;
      else if (a.kind === "trx" && typeof myTrx === "bigint" && raw + reserve > myTrx) {
        const max = myTrx > reserve ? myTrx - reserve : 0n;
        errors[a.key] = `Keep about ${formatUnits(reserve, 6)} TRX for the fees of this top-up. You can send up to ${formatUnits(max, 6)} TRX.`;
      } else raws[a.key] = raw;
    } catch (e) {
      errors[a.key] = e instanceof AmountError ? e.message : "Invalid amount.";
    }
  }
  const feeErr = tokenCount > 0 && !picked.some((a) => a.kind === "trx") && typeof myTrx === "bigint" && myTrx < reserve
    ? `You have ${formatUnits(myTrx, 6)} TRX. Token transfers need fees: keep at least ${formatUnits(reserve, 6)} TRX in this wallet (get more from the faucet).`
    : undefined;
  const loading = assets.some((a) => mine[a.key] === undefined);
  const valid = !toErr && picked.length > 0 && picked.every((a) => raws[a.key] !== undefined) && !feeErr && !loading;
  // TRX goes first: it activates a brand-new wallet, which makes the token transfers after it cheaper.
  const plan = [...picked].sort((a, b) => Number(b.kind === "trx") - Number(a.kind === "trx"));

  const setAmount = (key: string, v: string) => setAmounts((m) => ({ ...m, [key]: v.replace(/[^0-9.]/g, "") }));
  const maxFor = (a: TopUpAsset): string | null => {
    const have = mine[a.key];
    if (typeof have !== "bigint") return null;
    if (a.kind !== "trx") return formatUnits(have, a.decimals, false);
    const others = picked.filter((x) => x.kind === "trc20").length;
    const r = feeReserveSun(others);
    return have > r ? formatUnits(have - r, 6, false) : "0";
  };

  // ---- run ----------------------------------------------------------------------------------
  const run = async (keys: string[]) => {
    try {
      assertTestnet();
    } catch (e) {
      setSteps((s) => s.map((x) => (keys.includes(x.key) ? { ...x, status: "failed", error: (e as Error).message } : x)));
      return;
    }
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const a = assets.find((x) => x.key === key)!;
      const update = (p: SendProgress) =>
        setSteps((s) => s.map((x) => (x.key !== key ? x : p.phase === "failed" ? { ...x, status: "failed", error: p.error, txid: p.txid } : p.phase === "done" ? { ...x, status: "done", txid: p.txid, feeSun: p.feeSun } : { ...x, status: p.phase, txid: p.phase === "confirming" ? p.txid : x.txid })));
      let last: SendProgress | undefined;
      const onProgress = (p: SendProgress) => { last = p; update(p); };
      if (a.kind === "trx") await sendTrx({ to, sun: raws[key] }, onProgress);
      else await sendToken({ token: a.address, to, raw: raws[key] }, onProgress);
      if (last?.phase !== "done") {
        // Stop at the first failure or rejection: never keep popping up TronLink after a "no".
        const rest = keys.slice(i + 1);
        setSteps((s) => s.map((x) => (rest.includes(x.key) ? { ...x, status: "skipped" } : x)));
        break;
      }
    }
    setRecent(rememberRecent(to));
    loadMine();
    loadTheirs();
  };

  const start = async () => {
    setTouched(true);
    if (!valid) return;
    if (stage === "edit") {
      setChecking(true);
      const contract = await isContractAddress(to);
      setChecking(false);
      if (contract) return setContractErr("That address is a smart contract, not a wallet. Coins sent there are usually lost forever.");
      return setStage("review");
    }
    const fresh = plan.map((a) => ({ key: a.key, status: "waiting" as const }));
    setSteps(fresh);
    setStage("run");
    await run(fresh.map((s) => s.key));
  };

  const retry = async () => {
    const keys = steps.filter((s) => s.status === "failed" || s.status === "skipped").map((s) => s.key);
    setSteps((s) => s.map((x) => (keys.includes(x.key) ? { key: x.key, status: "waiting" } : x)));
    await run(keys);
  };

  const reset = () => { setStage("edit"); setSteps([]); setAmounts({}); setTouched(false); };
  const busy = steps.some((s) => s.status === "signing" || s.status === "confirming");
  const finished = stage === "run" && !busy && steps.length > 0 && steps.every((s) => s.status !== "waiting");
  const allDone = finished && steps.every((s) => s.status === "done");
  const totalFee = steps.reduce((t, s) => t + (s.feeSun ?? 0), 0);
  const label = NETWORKS[network].label;

  return (
    <Card>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-center gap-3 p-5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20">
          <HandCoins className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 font-medium">Top up a test wallet <Badge tone="success">{label} only</Badge></span>
          <span className="block text-sm text-zinc-500 dark:text-zinc-400">Send test TRX, test USDT and your test tokens to another test wallet, so it can receive, claim and pay fees.</span>
        </span>
        <ChevronDown className={cx("h-5 w-5 shrink-0 text-zinc-400 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div className="space-y-5 border-t border-zinc-200 p-5 dark:border-zinc-800">
          {stage === "edit" && (
            <>
              <Field id="topup-to" label="Test wallet to top up" error={touched ? toErr : undefined}
                hint={<>The WALLET address shown at the top of the other TronLink (starts with T). The coins come from this wallet ({shortAddr(owner)}).</>}>
                <input id="topup-to" className={cx(inputClass(!!(touched && toErr)), "font-mono")} placeholder="T…" value={to} autoComplete="off"
                  onChange={(e) => { setTo(e.target.value.trim()); setContractErr(null); }} />
              </Field>
              {recent.filter((r) => r !== to && r !== owner).length > 0 && (
                <div className="-mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-zinc-500">Recent:</span>
                  {recent.filter((r) => r !== to && r !== owner).map((r) => (
                    <button key={r} type="button" onClick={() => { setTo(r); setContractErr(null); }}
                      className="rounded-full bg-zinc-100 px-2.5 py-1 font-mono text-zinc-700 transition-colors hover:bg-rose-100 hover:text-rose-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-rose-500/20 dark:hover:text-rose-300">
                      {shortAddr(r)}
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">What to send <span className="font-normal text-zinc-500">(leave empty to skip)</span></p>
                  <Button type="button" size="sm" variant="ghost" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => { loadMine(); loadTheirs(); }}>Refresh</Button>
                </div>
                <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                  {assets.map((a) => {
                    const have = mine[a.key];
                    const empty = have === 0n;
                    const err = touched || amounts[a.key] ? errors[a.key] : undefined;
                    return (
                      <li key={a.key} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_19rem] sm:items-start">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                            a.kind === "trx" ? "bg-red-600 text-white" : a.kind === "trc20" && a.official ? "bg-emerald-600 text-white" : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300")}>
                            {a.symbol.slice(0, 4)}
                          </span>
                          <div className="min-w-0 space-y-0.5">
                            <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                              {a.symbol} <span className="font-normal text-zinc-500">{a.name}</span>
                              {a.kind === "trc20" && (a.official ? <Badge tone="success">official test coin</Badge> : <Badge>your token</Badge>)}
                            </p>
                            {a.kind === "trc20" && <p className="truncate font-mono text-xs text-zinc-500" title={a.address}>{a.address}</p>}
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                              You have <b className="tabular-nums text-zinc-700 dark:text-zinc-300">{fmt(have, a)}</b>
                              {validTo && <> · they have <b className="tabular-nums text-zinc-700 dark:text-zinc-300">{fmt(theirs[a.key], a)}</b></>}
                            </p>
                            {empty && a.kind === "trc20" && a.official && a.faucet && (
                              <p className="text-xs text-amber-700 dark:text-amber-300">
                                You have none yet. Claim test {a.symbol} for {shortAddr(owner)} on the{" "}
                                <a className="font-medium underline" href={a.faucet} target="_blank" rel="noopener noreferrer">Nile faucet</a>, then click Refresh.
                              </p>
                            )}
                            {empty && a.kind === "trx" && NETWORKS[network].faucet && (
                              <p className="text-xs text-amber-700 dark:text-amber-300">
                                Get free test TRX on the <a className="font-medium underline" href={NETWORKS[network].faucet} target="_blank" rel="noopener noreferrer">faucet</a>.
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <div className="relative">
                            <input aria-label={`Amount of ${a.symbol} to send`} inputMode="decimal" disabled={empty || have === undefined}
                              className={cx(inputClass(!!err), "pr-24 font-mono tabular-nums")} placeholder={empty ? "none to send" : "0"}
                              value={amounts[a.key] ?? ""} onChange={(e) => setAmount(a.key, e.target.value)} autoComplete="off" />
                            <div className="absolute inset-y-0 right-1.5 flex items-center gap-1.5">
                              <span className="max-w-[3.5rem] truncate font-mono text-xs text-zinc-500">{a.symbol}</span>
                              {!empty && maxFor(a) !== null && (
                                <button type="button" onClick={() => setAmount(a.key, maxFor(a)!)}
                                  className="h-8 rounded-lg bg-zinc-100 px-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-rose-100 hover:text-rose-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-rose-500/20 dark:hover:text-rose-300">MAX</button>
                              )}
                            </div>
                          </div>
                          {!empty && have !== undefined && (
                            <div className="flex flex-wrap gap-1.5">
                              {a.presets.filter((p) => typeof have !== "bigint" || parseUnits(p, a.decimals) <= have).map((p) => (
                                <button key={p} type="button" onClick={() => setAmount(a.key, p)}
                                  className={cx("rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset transition-colors",
                                    amounts[a.key] === p ? "bg-rose-600 text-white ring-rose-600" : "text-zinc-600 ring-zinc-200 hover:bg-zinc-100 dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-800")}>
                                  {Number(p).toLocaleString("en-US")}
                                </button>
                              ))}
                              {amounts[a.key] && <button type="button" onClick={() => setAmount(a.key, "")} className="px-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">clear</button>}
                            </div>
                          )}
                          {err && <p role="alert" className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400"><XCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />{err}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {loading && <Skeleton className="h-1 w-full" />}
              </div>

              {lookalikes.length > 0 && (
                <p className="flex items-start gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>
                    Not offered: {lookalikes.map((t) => <b key={t.address}>{t.symbol} ({shortAddr(t.address)})</b>).reduce<ReactNode[]>((acc, el, i) => (i ? [...acc, ", ", el] : [el]), [])}.
                    Its name or symbol copies a real coin (like USDT), so it isn&apos;t the real test coin. Only the official Nile test USDT is used here.
                  </span>
                </p>
              )}
              {touched && feeErr && <Callout tone="warning">{feeErr}</Callout>}
              {touched && picked.length === 0 && !toErr && <Callout tone="info">Enter an amount for at least one coin.</Callout>}

              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={start} loading={checking} icon={<HandCoins className="h-4 w-4" />}>
                  {checking ? "Checking the wallet…" : "Review top-up"}
                </Button>
              </div>
            </>
          )}

          {stage === "review" && (
            <div className="space-y-4">
              <div className="space-y-3 rounded-xl bg-zinc-50 p-4 text-sm dark:bg-zinc-950/60">
                <p className="font-medium">Check before sending. Transfers can&apos;t be reversed.</p>
                <dl className="grid grid-cols-[6.5rem_1fr] gap-y-1.5">
                  <dt className="text-zinc-500">To</dt><dd className="break-all font-mono text-xs">{to}</dd>
                  <dt className="text-zinc-500">From</dt><dd className="break-all font-mono text-xs">{owner} (this wallet)</dd>
                  <dt className="text-zinc-500">Network</dt><dd>{label} (test coins, no real value)</dd>
                  <dt className="text-zinc-500">Send</dt>
                  <dd>
                    <ol className="space-y-0.5">
                      {plan.map((a, i) => <li key={a.key}><span className="text-zinc-500">{i + 1}.</span> <b className="tabular-nums">{amounts[a.key]} {a.symbol}</b>{a.kind === "trc20" && <span className="text-zinc-500"> · {shortAddr(a.address)}</span>}</li>)}
                    </ol>
                  </dd>
                  <dt className="text-zinc-500">Signatures</dt><dd>TronLink asks you to sign <b>{plan.length}</b> time{plan.length > 1 && "s"}, one per coin, in this order.</dd>
                  <dt className="text-zinc-500">Network fee</dt>
                  <dd>{picked.some((a) => a.kind === "trx") && "TRX: free or ≈0.3 TRX (+1 TRX if the wallet is brand new). "}{tokenCount > 0 && <>Each token: about 3–15 TRX (more the first time the wallet holds it).</>}</dd>
                </dl>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => setStage("edit")}>Edit</Button>
                <Button type="button" onClick={start} icon={<HandCoins className="h-4 w-4" />}>Start top-up ({plan.length} signature{plan.length > 1 && "s"})</Button>
              </div>
            </div>
          )}

          {stage === "run" && (
            <div className="space-y-4">
              <ol className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800" aria-live="polite">
                {steps.map((s, i) => {
                  const a = assets.find((x) => x.key === s.key)!;
                  return (
                    <li key={s.key} className="flex items-start gap-3 px-4 py-3 text-sm">
                      <StepIcon status={s.status} />
                      <div className="min-w-0 flex-1">
                        <p><span className="text-zinc-500">{i + 1}.</span> <b className="tabular-nums">{amounts[s.key]} {a.symbol}</b> → <span className="font-mono text-xs">{shortAddr(to)}</span></p>
                        <p className={cx("text-xs", s.status === "failed" ? "text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400")}>
                          {s.status === "waiting" && "Waiting for the previous step"}
                          {s.status === "signing" && "Sign it in the TronLink popup…"}
                          {s.status === "confirming" && "Sent. Waiting for the network to confirm…"}
                          {s.status === "done" && <>Done{s.feeSun !== undefined && <> · fee {(s.feeSun / 1e6).toLocaleString("en-US", { maximumFractionDigits: 3 })} TRX</>}</>}
                          {s.status === "failed" && s.error}
                          {s.status === "skipped" && "Not sent (stopped after the step above)"}
                          {s.txid && <> · <a className="underline" href={explorerTx(network, s.txid)} target="_blank" rel="noopener noreferrer">view transaction</a></>}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
              {allDone && (
                <Callout tone="success" title={`Topped up ${shortAddr(to)}`}>
                  {steps.length} transfer{steps.length > 1 && "s"} confirmed · total fee {(totalFee / 1e6).toLocaleString("en-US", { maximumFractionDigits: 3 })} TRX.
                  {steps.some((s) => assets.find((a) => a.key === s.key)?.kind === "trc20") && <> In the other TronLink, tap <b>⊕</b> and paste each token&apos;s contract address to see it.</>}
                </Callout>
              )}
              {finished && (
                <div className="flex flex-wrap gap-2">
                  {!allDone && <Button type="button" onClick={retry} icon={<RotateCcw className="h-4 w-4" />}>Retry the rest</Button>}
                  <Button type="button" variant={allDone ? "primary" : "ghost"} onClick={reset} icon={<HandCoins className="h-4 w-4" />}>Top up again</Button>
                  <Button type="button" variant="ghost" onClick={() => { reset(); setOpen(false); }}>Close</Button>
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            This only moves test coins you already hold; it can&apos;t create TRX or USDT. Get more for this wallet from the{" "}
            {NETWORKS[network].faucet ? <a className="underline" href={NETWORKS[network].faucet} target="_blank" rel="noopener noreferrer">faucet</a> : "faucet"}.
          </p>
        </div>
      )}
    </Card>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  const c = "mt-0.5 h-4 w-4 shrink-0";
  if (status === "done") return <CheckCircle2 className={cx(c, "text-emerald-500")} aria-label="done" />;
  if (status === "failed") return <XCircle className={cx(c, "text-red-500")} aria-label="failed" />;
  if (status === "skipped") return <Ban className={cx(c, "text-zinc-400")} aria-label="skipped" />;
  if (status === "waiting") return <CircleDashed className={cx(c, "text-zinc-400")} aria-label="waiting" />;
  return <Loader2 className={cx(c, "animate-spin text-rose-500")} aria-label="in progress" />;
}
