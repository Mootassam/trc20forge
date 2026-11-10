"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, BadgeCheck, Ban, Calculator, CheckCircle2, Circle, Coins, Cpu, Download,
  ExternalLink as ExtIcon, FileCode2, Flame, Loader2, PlusCircle, RefreshCw, Rocket, ScanSearch, Send, ShieldCheck, Sparkles, Wallet, Zap, Timer } from "lucide-react";
import {
  DEFAULT_DECIMALS, featuresOf, groupDigits, NO_FEATURES, rawSupply, validateConfig, type Features, type TokenConfig,
} from "@/lib/token/schema";
import { COMPILER, contractName, DISCLAIMER, generateContract, sourceFileName } from "@/lib/token/generate";
import { auditAbi, CompileError, type CompileArtifact } from "@/lib/token/compile";
import { compileToken } from "@/lib/token/compiler-client";
import { generateReadme } from "@/lib/token/readme";
import { SUN_PER_TRX, withAccount, type AccountResources, type CostEstimate } from "@/lib/tron/cost";
import { explorerContract, explorerTx, explorerVerify, NETWORKS, type NetworkId } from "@/lib/tron/networks";
import { addTokenToWallet, deployToken, readAccountResources, switchNetwork, type DeployProgress } from "@/lib/tron/tronlink";
import { useWalletCtx } from "./WalletProvider";
import dynamic from "next/dynamic";
import { saveToken } from "@/lib/token-store";
import { shortAddr } from "./SiteHeader";
import { Badge, Button, Callout, Card, CardHeader, CopyButton, cx, downloadFile, ExternalLink, Field, inputClass, KV, Skeleton } from "./ui";

// Only needed from step 2 (source viewer) and step 6 (listing kit: zip, logo canvas), so they are
// code-split and fetched on demand instead of weighing down the first paint of step 1.
const CodeBlock = dynamic(() => import("./CodeBlock").then((m) => m.CodeBlock), {
  loading: () => <Skeleton className="h-96 w-full rounded-xl" />,
});
const ListingKit = dynamic(() => import("./ListingKit").then((m) => m.ListingKit), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full rounded-2xl" />,
});

type Form = { name: string; symbol: string; supply: string; decimals: string; features: Features };
const DEFAULT_FORM: Form = { name: "", symbol: "", supply: "1000000", decimals: DEFAULT_DECIMALS, features: NO_FEATURES };

const FEATURE_INFO: { key: keyof Features; title: string; desc: string; cost: string; icon: typeof Flame }[] = [
  { key: "burn", title: "Burn", desc: "burn + burnFrom: holders can destroy their own tokens. Supply can only go down.", cost: "+ ~11 TRX", icon: Flame },
  { key: "batch", title: "Batch transfer", desc: "Airdrop to up to 200 wallets in one transaction, all-or-nothing.", cost: "+ ~11 TRX", icon: Send },
  { key: "erc165", title: "Interface detection", desc: "supportsInterface (ERC-165), so apps can detect the token's features.", cost: "+ ~2.5 TRX", icon: ScanSearch },
  { key: "timed", title: "Timed sends", desc: "Send with an expiry (1 min to 365 days): the recipient claims before it, otherwise you take the tokens back. Great for re-testing.", cost: "+ ~48 TRX", icon: Timer },
];
const STORAGE_KEY = "trc20-forge:form:v1";

const STEPS = [
  { id: "token", label: "Token details", icon: Coins },
  { id: "contract", label: "Contract", icon: FileCode2 },
  { id: "compile", label: "Compile", icon: Cpu },
  { id: "cost", label: "Cost", icon: Calculator },
  { id: "deploy", label: "Deploy", icon: Rocket },
  { id: "verify", label: "Verify", icon: BadgeCheck },
] as const;

type Estimate = { key: string; data: CostEstimate; notes: string[] };
type Deployment = { network: NetworkId; key: string; progress: DeployProgress };

const trx = (v: number) => `${v.toLocaleString("en-US", { maximumFractionDigits: 2 })} TRX`;

export function Forge() {
  const { wallet, connect, connecting, ready: walletReady, error: walletError } = useWalletCtx();

  // ---------------------------------------------------------------- form
  const [form, setForm] = useState<Form>(DEFAULT_FORM);
  const [touched, setTouched] = useState<Partial<Record<keyof Form, boolean>>>({});
  // `hydrated` is state (not a ref) so the first save happens only in a render that already
  // contains the loaded data. A ref let React StrictMode's double-run save defaults over it.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved && typeof saved === "object") setForm({ ...DEFAULT_FORM, ...saved, features: { ...NO_FEATURES, ...saved.features } });
    } catch { /* storage unavailable */ }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(form)); } catch { /* ignore */ }
  }, [form, hydrated]);

  const validation = useMemo(() => validateConfig(form), [form]);
  const cfg: TokenConfig | null = validation.ok ? validation.config : null;
  const cfgKey = cfg ? JSON.stringify(cfg) : null;
  const errors = validation.ok ? {} : validation.errors;
  const source = useMemo(() => (cfg ? generateContract(cfg) : ""), [cfg]);

  // ---------------------------------------------------------------- compile
  const [compiled, setCompiled] = useState<{ key: string; art: CompileArtifact } | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [compileErr, setCompileErr] = useState<string[] | null>(null);
  const art = compiled && compiled.key === cfgKey ? compiled.art : null;
  const audit = useMemo(() => (art && cfg ? auditAbi(art.abi, featuresOf(cfg)) : null), [art, cfg]);

  const runCompile = useCallback(async () => {
    if (!cfg || !cfgKey) return;
    setCompiling(true);
    setCompileErr(null);
    try {
      const a = await compileToken(cfg);
      setCompiled({ key: cfgKey, art: a });
    } catch (e) {
      setCompileErr(e instanceof CompileError ? e.messages : [(e as Error).message]);
    } finally {
      setCompiling(false);
    }
  }, [cfg, cfgKey]);

  // ---------------------------------------------------------------- network + estimate
  const [network, setNetwork] = useState<NetworkId>("nile");
  const walletNet = wallet.status === "connected" ? wallet.network : null;
  useEffect(() => {
    if (walletNet) setNetwork(walletNet);
  }, [walletNet]);

  const owner = wallet.status === "connected" ? wallet.address : undefined;
  const estKey = art && cfgKey ? `${cfgKey}|${network}` : null;
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estErr, setEstErr] = useState<string | null>(null);
  const est = estimate && estimate.key === estKey ? estimate : null;

  const runEstimate = useCallback(async () => {
    if (!art || !cfg || !estKey) return;
    setEstimating(true);
    setEstErr(null);
    try {
      const res = await fetch("/api/estimate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          network, owner, bytecode: art.bytecode, runtimeBytes: art.deployedBytecode.length / 2,
          abi: art.abi, contractName: contractName(cfg),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Estimate failed (HTTP ${res.status}).`);
      setEstimate({ key: estKey, data: json.estimate, notes: json.notes ?? [] });
    } catch (e) {
      setEstErr((e as Error).message);
    } finally {
      setEstimating(false);
    }
  }, [art, cfg, estKey, network, owner]);

  // ---------------------------------------------------------------- wallet resources (via TronLink's node)
  const accKey = wallet.status === "connected" && wallet.network === network ? `${wallet.address}|${network}` : null;
  const [account, setAccount] = useState<{ key: string; data: AccountResources } | null>(null);
  const acct = account && account.key === accKey ? account.data : null;
  const loadAccount = useCallback(async () => {
    if (!accKey) return;
    try {
      const data = await readAccountResources(accKey.split("|")[0]);
      setAccount({ key: accKey, data });
    } catch { /* keep worst-case estimate */ }
  }, [accKey]);
  const estData: CostEstimate | null = est ? (acct ? withAccount(est.data, acct) : est.data) : null;

  // ---------------------------------------------------------------- deploy
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [ackDisclaimer, setAckDisclaimer] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchErr, setSwitchErr] = useState<string | null>(null);
  const runSwitch = useCallback(async () => {
    setSwitching(true);
    setSwitchErr(null);
    try {
      await switchNetwork(network);
    } catch (e) {
      setSwitchErr((e as Error).message);
    } finally {
      setSwitching(false);
    }
  }, [network]);
  const [ackMainnet, setAckMainnet] = useState(false);
  const dep = deployment && deployment.key === cfgKey ? deployment : null;
  const deploying = dep && !["done", "failed"].includes(dep.progress.phase);
  const deployed = dep?.progress.phase === "done" ? dep.progress : null;

  const runDeploy = useCallback(async () => {
    if (!art || !cfg || !cfgKey || !est) return;
    const net = network;
    await deployToken(
      { abi: art.abi, bytecode: art.bytecode, name: contractName(cfg), feeLimitSun: est.data.feeLimitSun, expectedSupplyRaw: rawSupply(cfg.supply, cfg.decimals) },
      (progress) => {
        setDeployment({ network: net, key: cfgKey, progress });
        if (progress.phase === "done") {
          // Remember it so it can be used later from "My tokens" without repeating any step.
          try {
            saveToken({
              address: progress.address, network: net, name: cfg.name, symbol: cfg.symbol, decimals: Number(cfg.decimals),
              features: featuresOf(cfg), txid: progress.txid, addedAt: Date.now(), source: "deployed",
            });
          } catch { /* storage unavailable: deployment itself is unaffected */ }
        }
      },
    );
    void loadAccount();
  }, [art, cfg, cfgKey, est, network, loadAccount]);

  // ---------------------------------------------------------------- steps
  const [step, setStep] = useState(0);
  const unlocked = [true, !!cfg, !!cfg, !!art, !!art, !!art];
  const done = [!!cfg, !!cfg && step > 1, !!art && !!audit?.ok, !!est, !!deployed, false];
  useEffect(() => {
    // editing the token invalidates later steps
    if (!unlocked[step]) setStep(unlocked.lastIndexOf(true, step));
  }, [step, unlocked]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (step === 3 && art && !est && !estimating && !estErr) void runEstimate();
  }, [step, art, est, estimating, estErr, runEstimate]);
  useEffect(() => setEstErr(null), [estKey]);
  useEffect(() => {
    if (!accKey || (step !== 3 && step !== 4)) return;
    void loadAccount();
    const t = setInterval(loadAccount, 15_000);
    return () => clearInterval(t);
  }, [accKey, step, loadAccount]);

  const go = (i: number) => {
    if (unlocked[i]) {
      setStep(i);
      requestAnimationFrame(() => document.getElementById("step-panel")?.focus({ preventScroll: true }));
      if (window.innerWidth < 1024) document.getElementById("step-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const balanceTrx = estData?.account ? estData.account.balanceSun / SUN_PER_TRX : null;
  const needTrx = estData ? estData.walletTrx ?? estData.totalTrx : null;
  const insufficient = balanceTrx !== null && needTrx !== null && balanceTrx < needTrx;
  const networkMismatch = wallet.status === "connected" && wallet.network !== network;
  const canDeploy =
    !!art && !!audit?.ok && !!est && wallet.status === "connected" && !networkMismatch && !insufficient &&
    !!estData?.account && estData.account.activated && ackDisclaimer && (network !== "mainnet" || ackMainnet) && !deploying && !deployed;

  const readme = cfg ? generateReadme(cfg, estData, deployed && dep ? { network: NETWORKS[dep.network].label, address: deployed.address, txid: deployed.txid } : undefined) : "";

  // ================================================================ render
  return (
    <div className="space-y-10">
      <Hero />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
        {/* Stepper */}
        <nav aria-label="Steps" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <ol className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const active = i === step;
              return (
                <li key={s.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => go(i)}
                    disabled={!unlocked[i]}
                    aria-current={active ? "step" : undefined}
                    className={cx(
                      "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                      active ? "bg-white font-medium shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800" : "hover:bg-zinc-100 dark:hover:bg-zinc-900/60",
                    )}
                  >
                    <span className={cx(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs",
                      done[i] ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                        : active ? "bg-rose-600 text-white" : "bg-zinc-200/70 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
                    )}>
                      {done[i] && !active ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
                    </span>
                    <span className="whitespace-nowrap">
                      <span className="mr-1 text-zinc-400">{i + 1}.</span>{s.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          {cfg && (
            <div className="mt-6 hidden lg:block">
              <TokenPreview cfg={cfg} network={network} />
            </div>
          )}
        </nav>

        {/* Panel */}
        <div id="step-panel" tabIndex={-1} className="scroll-mt-24 space-y-6 outline-none">
          {step === 0 && (
            <Card className="animate-fade-in">
              <CardHeader icon={<Coins className="h-4 w-4" />} title="Token details" subtitle="Choose a name, symbol, supply and decimals. Everything else is fixed by the TRC-20 standard." />
              <form
                className="grid gap-5 p-5 sm:grid-cols-2"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  setTouched({ name: true, symbol: true, supply: true, decimals: true });
                  if (cfg) go(1);
                }}
              >
                <Field id="name" label="Token name" aside={`${form.name.length}/40`} error={touched.name ? errors.name : undefined} hint="Example: Bama Coin">
                  <input
                    id="name" className={inputClass(!!(touched.name && errors.name))} value={form.name} maxLength={40} autoComplete="off" placeholder="Bama Coin"
                    aria-invalid={!!(touched.name && errors.name)} aria-describedby={touched.name && errors.name ? "name-error" : "name-hint"}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                  />
                </Field>
                <Field id="symbol" label="Symbol" aside={`${form.symbol.length}/10`} error={touched.symbol ? errors.symbol : undefined} hint="2–10 uppercase letters or digits, e.g. BAMA">
                  <input
                    id="symbol" className={cx(inputClass(!!(touched.symbol && errors.symbol)), "font-mono uppercase")} value={form.symbol} maxLength={10} autoComplete="off" placeholder="BAMA"
                    aria-invalid={!!(touched.symbol && errors.symbol)} aria-describedby={touched.symbol && errors.symbol ? "symbol-error" : "symbol-hint"}
                    onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") }))}
                    onBlur={() => setTouched((t) => ({ ...t, symbol: true }))}
                  />
                </Field>
                <Field
                  id="supply" label="Total supply" error={touched.supply ? errors.supply : undefined}
                  hint={!errors.supply && form.supply ? <>= {groupDigits(form.supply)} tokens{!errors.decimals && <> · {groupDigits(rawSupply(form.supply, form.decimals))} raw units</>}</> : "Whole tokens, minted once to your wallet"}
                >
                  <input
                    id="supply" inputMode="numeric" className={cx(inputClass(!!(touched.supply && errors.supply)), "font-mono")} value={form.supply} maxLength={16} autoComplete="off"
                    aria-invalid={!!(touched.supply && errors.supply)} aria-describedby={touched.supply && errors.supply ? "supply-error" : "supply-hint"}
                    onChange={(e) => setForm((f) => ({ ...f, supply: e.target.value.replace(/[^0-9]/g, "") }))}
                    onBlur={() => setTouched((t) => ({ ...t, supply: true }))}
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[["1M", "1000000"], ["100M", "100000000"], ["1B", "1000000000"], ["1T", "1000000000000"]].map(([l, v]) => (
                      <button key={l} type="button" onClick={() => { setForm((f) => ({ ...f, supply: v })); setTouched((t) => ({ ...t, supply: true })); }}
                        className={cx("rounded-lg px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
                          form.supply === v ? "bg-rose-600 text-white ring-rose-600" : "ring-zinc-200 hover:bg-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-800")}>
                        {l}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field
                  id="decimals" label="Decimals" error={touched.decimals ? errors.decimals : undefined}
                  hint={form.decimals === "6" ? "6 is the TRC-20 standard on TRON (same as USDT-TRC20)." : form.decimals === "18" ? "18 matches most Ethereum-style tokens." : form.decimals === "0" ? "0 = indivisible: only whole tokens can be sent." : "How many decimal places one token can be split into (0–18)."}
                >
                  <input
                    id="decimals" inputMode="numeric" className={cx(inputClass(!!(touched.decimals && errors.decimals)), "font-mono")} value={form.decimals} maxLength={2} autoComplete="off"
                    aria-invalid={!!(touched.decimals && errors.decimals)} aria-describedby={touched.decimals && errors.decimals ? "decimals-error" : "decimals-hint"}
                    onChange={(e) => setForm((f) => ({ ...f, decimals: e.target.value.replace(/[^0-9]/g, "") }))}
                    onBlur={() => setTouched((t) => ({ ...t, decimals: true }))}
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {["0", "6", "8", "18"].map((v) => (
                      <button key={v} type="button" onClick={() => { setForm((f) => ({ ...f, decimals: v })); setTouched((t) => ({ ...t, decimals: true })); }}
                        className={cx("rounded-lg px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
                          form.decimals === v ? "bg-rose-600 text-white ring-rose-600" : "ring-zinc-200 hover:bg-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-800")}>
                        {v === "6" ? "6 · standard" : v}
                      </button>
                    ))}
                  </div>
                </Field>

                <fieldset className="space-y-2 sm:col-span-2">
                  <legend className="mb-2 text-sm font-medium">
                    Optional functions <span className="font-normal text-zinc-500 dark:text-zinc-400">(owner-free, none can create tokens)</span>
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {FEATURE_INFO.map(({ key, title, desc, cost, icon: Icon }) => {
                      const on = form.features[key];
                      return (
                        <label
                          key={key}
                          className={cx(
                            "flex cursor-pointer gap-3 rounded-xl border p-3 text-sm transition-colors",
                            on ? "border-rose-300 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-500/10" : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 shrink-0 accent-rose-600"
                            checked={on}
                            onChange={(e) => setForm((f) => ({ ...f, features: { ...f.features, [key]: e.target.checked } }))}
                          />
                          <span className="min-w-0 space-y-1">
                            <span className="flex items-center gap-1.5 font-medium">
                              <Icon className="h-3.5 w-3.5" aria-hidden /> {title}
                              <span className="ml-auto text-xs font-normal text-zinc-500">{cost}</span>
                            </span>
                            <span className="block text-xs text-zinc-500 dark:text-zinc-400">{desc}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="sm:col-span-2">
                  <Callout tone="info" title="Built-in protections">
                    Names and symbols that copy USDT, Tether, TRX or other major assets, or that contain “USD”, are blocked.
                    Fake-stablecoin tokens are the most common TRON scam.
                  </Callout>
                </div>
                <div className="flex justify-end sm:col-span-2">
                  <Button type="submit" size="lg" icon={<Sparkles className="h-4 w-4" />}>Generate contract</Button>
                </div>
              </form>
            </Card>
          )}

          {step === 1 && cfg && (
            <Card className="animate-fade-in">
              <CardHeader
                icon={<FileCode2 className="h-4 w-4" />}
                title={sourceFileName(cfg)}
                subtitle={`Single file, no imports, Solidity ${COMPILER.version}. Upload it to Tronscan unchanged.`}
                action={<>
                  <CopyButton value={source} label="Copy" />
                  <Button size="sm" variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => downloadFile(sourceFileName(cfg), source)}>.sol</Button>
                </>}
              />
              <div className="space-y-5 p-5">
                <ul className="grid gap-2 sm:grid-cols-2">
                  {[
                    [ShieldCheck, "Fixed supply, no mint function"],
                    [Ban, "No owner: can't freeze, blacklist or seize"],
                    [CheckCircle2, "transfer · approve · transferFrom · balanceOf · allowance"],
                    [CheckCircle2, "Transfer & Approval events, overflow-checked math"],
                  ].map(([Icon, t], i) => {
                    const I = Icon as typeof ShieldCheck;
                    return (
                      <li key={i} className="flex items-start gap-2 rounded-xl bg-zinc-50 px-3 py-2.5 text-sm dark:bg-zinc-950/60">
                        <I className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden /> {t as string}
                      </li>
                    );
                  })}
                </ul>
                <CodeBlock code={source} />
                <StepNav onBack={() => go(0)} onNext={() => go(2)} nextLabel="Compile" />
              </div>
            </Card>
          )}

          {step === 2 && cfg && (
            <Card className="animate-fade-in">
              <CardHeader icon={<Cpu className="h-4 w-4" />} title="Compile" subtitle={`TRON solc ${COMPILER.longVersion} · optimizer on · ${COMPILER.optimizer.runs} runs · runs in your browser`} />
              <div className="space-y-5 p-5">
                {!art && (
                  <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700">
                    <Cpu className="h-8 w-8 text-zinc-400" aria-hidden />
                    <div>
                      <p className="font-medium">Compile with the official TRON compiler</p>
                      <p className="mt-1 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
                        This is the same compiler Tronscan uses to verify, so your deployed bytecode will match. The first run downloads it (~8 MB).
                      </p>
                    </div>
                    <Button size="lg" onClick={runCompile} loading={compiling} icon={<Zap className="h-4 w-4" />}>
                      {compiling ? "Compiling…" : "Compile contract"}
                    </Button>
                  </div>
                )}
                {compileErr && (
                  <Callout tone="danger" title="Compilation failed">
                    <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-xs">{compileErr.join("\n\n")}</pre>
                  </Callout>
                )}
                {art && audit && (
                  <div className="space-y-5 animate-fade-in">
                    {audit.ok ? (
                      <Callout tone="success" title="Compiled and audited">
                        All required TRC-20 functions and events are present. No mint, owner, pause, blacklist or payable functions were found.
                      </Callout>
                    ) : (
                      <Callout tone="danger" title="ABI audit failed">
                        Missing: {audit.missing.join(", ") || "none"} · Forbidden: {audit.forbidden.join(", ") || "none"}
                      </Callout>
                    )}
                    <KV rows={[
                      { k: "Compiler", v: art.compilerVersion, mono: true },
                      { k: "Creation bytecode", v: `${groupDigits(art.bytecode.length / 2)} bytes`, copy: art.bytecode },
                      { k: "Runtime bytecode", v: `${groupDigits(art.deployedBytecode.length / 2)} bytes` },
                      { k: "Warnings", v: art.warnings.length ? art.warnings.length : "None" },
                    ]} />
                    <div>
                      <p className="mb-2 text-sm font-medium">ABI</p>
                      <div className="flex flex-wrap gap-1.5">
                        {art.abi.filter((i) => i.type === "function" || i.type === "event").map((i) => (
                          <Badge key={i.type + i.name} tone={i.type === "event" ? "brand" : i.stateMutability === "view" || i.stateMutability === "pure" ? "neutral" : "success"}>
                            <span className="font-mono">{i.name}</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => downloadFile(`${contractName(cfg)}.abi.json`, JSON.stringify(art.abi, null, 2), "application/json")}>ABI</Button>
                      <Button size="sm" variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => downloadFile(`${contractName(cfg)}.bytecode.txt`, art.bytecode)}>Bytecode</Button>
                      <Button size="sm" variant="ghost" icon={<RefreshCw className="h-4 w-4" />} onClick={runCompile} loading={compiling}>Recompile</Button>
                    </div>
                    {art.warnings.length > 0 && <pre className="max-h-40 overflow-auto rounded-xl bg-amber-50 p-3 font-mono text-xs dark:bg-amber-500/10">{art.warnings.join("\n")}</pre>}
                  </div>
                )}
                <StepNav onBack={() => go(1)} onNext={art && audit?.ok ? () => go(3) : undefined} nextLabel="Estimate cost" />
              </div>
            </Card>
          )}

          {step === 3 && cfg && art && (
            <Card className="animate-fade-in">
              <CardHeader
                icon={<Calculator className="h-4 w-4" />}
                title="Deployment cost"
                subtitle="Deployment is simulated on a live TRON node with current fee prices."
                action={<Button size="sm" variant="ghost" icon={<RefreshCw className="h-4 w-4" />} onClick={runEstimate} loading={estimating}>Refresh</Button>}
              />
              <div className="space-y-5 p-5">
                <NetworkPicker value={network} onChange={setNetwork} walletNetwork={walletNet} />
                {estErr && <Callout tone="danger" title="Couldn't estimate">{estErr} <button className="underline" onClick={runEstimate}>Try again</button></Callout>}
                {estimating && !est && <div className="flex items-center gap-2 py-10 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Simulating deployment on {NETWORKS[network].label}…</div>}
                {est && estData && <CostView data={estData} notes={est.notes} network={network} />}
                <StepNav onBack={() => go(2)} onNext={est ? () => go(4) : undefined} nextLabel="Deploy" />
              </div>
            </Card>
          )}

          {step === 4 && cfg && art && (
            <Card className="animate-fade-in">
              <CardHeader icon={<Rocket className="h-4 w-4" />} title="Deploy with TronLink" subtitle="You sign in TronLink. Your keys never leave the extension." />
              <div className="space-y-5 p-5">
                {deployed && dep ? (
                  <DeployedView cfg={cfg} network={dep.network} d={deployed} onVerify={() => go(5)} />
                ) : (
                  <>
                    <NetworkPicker value={network} onChange={setNetwork} walletNetwork={walletNet} />

                    <ol className="space-y-3">
                      <CheckRow ok={wallet.status === "connected"} label="TronLink connected">
                        {!walletReady ? (
                          <span className="flex items-center gap-2 text-xs text-zinc-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking for TronLink…</span>
                        ) : wallet.status === "connected" ? (
                          <span className="font-mono text-xs">{wallet.address}</span>
                        ) : (
                          <div className="space-y-2">
                            <Button size="sm" onClick={connect} loading={connecting} icon={<Wallet className="h-4 w-4" />}>
                              {wallet.status === "unavailable" ? "Connect TronLink" : "Unlock TronLink"}
                            </Button>
                            {wallet.status === "unavailable" && <p className="text-xs text-zinc-500">No wallet detected. <ExternalLink href="https://www.tronlink.org/">Install TronLink</ExternalLink> and reload.</p>}
                            {walletError && <p className="text-xs text-red-600 dark:text-red-400">{walletError}</p>}
                          </div>
                        )}
                      </CheckRow>
                      <CheckRow ok={wallet.status === "connected" && !networkMismatch} label={`Wallet on ${NETWORKS[network].label}`}>
                        {wallet.status === "connected" && networkMismatch && (
                          <div className="space-y-2">
                            <p className="text-xs">TronLink is on <b>{wallet.network ? NETWORKS[wallet.network].label : wallet.host}</b>.</p>
                            <Button size="sm" onClick={runSwitch} loading={switching} icon={<RefreshCw className="h-4 w-4" />}>
                              Switch TronLink to {NETWORKS[network].label}
                            </Button>
                            <p className="text-xs text-zinc-500">TronLink opens a popup. Approve it there. Or switch manually: TronLink → network name at the top.</p>
                            {switchErr && <p className="text-xs text-red-600 dark:text-red-400">{switchErr}</p>}
                          </div>
                        )}
                      </CheckRow>
                      <CheckRow ok={!!est} label="Cost estimated">
                        {estData ? <span className="text-xs">≈ {trx(needTrx!)}{estData.account ? " for this wallet" : " (worst case)"} · fee limit {trx(estData.feeLimitSun / SUN_PER_TRX)}</span>
                          : <Button size="sm" variant="secondary" onClick={runEstimate} loading={estimating}>Estimate</Button>}
                      </CheckRow>
                      <CheckRow ok={!!estData?.account && !insufficient && estData.account.activated} label="Enough TRX">
                        {estData?.account ? (
                          <span className={cx("text-xs", insufficient && "text-red-600 dark:text-red-400")}>
                            {!estData.account.activated ? "This account isn't activated on this network yet. Send it some TRX first."
                              : `Balance ${trx(balanceTrx!)}${insufficient ? `, need ≈ ${trx(needTrx!)}` : ""}`}
                            {NETWORKS[network].faucet && (insufficient || !estData.account.activated) && <> · <ExternalLink href={NETWORKS[network].faucet!}>Get test TRX</ExternalLink></>}
                          </span>
                        ) : accKey ? (
                          <button type="button" className="text-xs underline" onClick={loadAccount}>Check balance</button>
                        ) : null}
                      </CheckRow>
                    </ol>

                    <div className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                      <Checkbox checked={ackDisclaimer} onChange={setAckDisclaimer}>
                        I understand: <i>{DISCLAIMER}</i> I won&apos;t market it as a stablecoin or promise returns.
                      </Checkbox>
                      {network === "mainnet" && (
                        <Checkbox checked={ackMainnet} onChange={setAckMainnet}>
                          I&apos;m deploying to <b>TRON Mainnet</b>. This spends real TRX and can&apos;t be undone. I&apos;ve tested on Nile.
                        </Checkbox>
                      )}
                    </div>

                    {dep?.progress.phase === "failed" && (
                      <Callout tone="danger" title="Deployment failed">
                        {dep.progress.error}
                        {dep.progress.txid && <> · <ExternalLink href={explorerTx(dep.network, dep.progress.txid)}>View transaction</ExternalLink></>}
                      </Callout>
                    )}
                    {deploying && dep && <DeployTimeline p={dep.progress} network={dep.network} />}

                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => go(3)}>Back</Button>
                      <Button size="lg" onClick={runDeploy} disabled={!canDeploy} loading={!!deploying} icon={<Rocket className="h-4 w-4" />}
                        variant={network === "mainnet" ? "danger" : "primary"}>
                        {deploying ? "Deploying…" : `Deploy to ${NETWORKS[network].label}`}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </Card>
          )}

          {step === 5 && cfg && (
            <>
              <VerifyView cfg={cfg} source={source} readme={readme} network={dep?.network ?? network} address={deployed?.address} onBack={() => go(4)} />
              <ListingKit cfg={cfg} source={source} abi={art?.abi} network={dep?.network ?? network} address={deployed?.address} />
            </>
          )}

          {cfg && <div className="lg:hidden"><TokenPreview cfg={cfg} network={network} /></div>}
        </div>
      </div>
    </div>
  );
}

// ==================================================================== pieces

function Hero() {
  return (
    <div className="max-w-3xl space-y-4">
      <Badge tone="brand"><Sparkles className="h-3 w-3" aria-hidden /> TRC-20 · TRON</Badge>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Launch a fixed-supply token on TRON, <span className="bg-gradient-to-r from-rose-500 to-red-600 bg-clip-text text-transparent">with no hidden powers.</span>
      </h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        Generate an audited TRC-20 contract, compile it with TRON&apos;s official compiler, see the exact cost, deploy with TronLink, and verify on Tronscan.
        No mint, no owner, no freeze.
      </p>
    </div>
  );
}

function TokenPreview({ cfg, network }: { cfg: TokenConfig; network: NetworkId }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="h-14 bg-gradient-to-br from-rose-500 via-red-600 to-zinc-900" />
      <div className="-mt-7 space-y-3 px-4 pb-4">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white font-mono text-sm font-bold text-rose-600 shadow ring-4 ring-white dark:bg-zinc-950 dark:ring-zinc-900">
          {cfg.symbol.slice(0, 4)}
        </div>
        <div>
          <p className="truncate font-semibold">{cfg.name}</p>
          <p className="font-mono text-xs text-zinc-500">${cfg.symbol}</p>
        </div>
        <dl className="space-y-1 text-xs">
          <div className="flex justify-between gap-2"><dt className="text-zinc-500">Supply</dt><dd className="truncate font-mono">{groupDigits(cfg.supply)}</dd></div>
          <div className="flex justify-between"><dt className="text-zinc-500">Decimals</dt><dd className="font-mono">{cfg.decimals}</dd></div>
          <div className="flex justify-between"><dt className="text-zinc-500">Network</dt><dd>{NETWORKS[network].label}</dd></div>
        </dl>
      </div>
    </div>
  );
}

function StepNav({ onBack, onNext, nextLabel }: { onBack?: () => void; onNext?: () => void; nextLabel: string }) {
  return (
    <div className="flex items-center justify-between border-t border-zinc-200 pt-5 dark:border-zinc-800">
      {onBack ? <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={onBack}>Back</Button> : <span />}
      <Button onClick={onNext} disabled={!onNext}>
        {nextLabel} <ArrowRight className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}

function NetworkPicker({ value, onChange, walletNetwork }: { value: NetworkId; onChange: (n: NetworkId) => void; walletNetwork: NetworkId | null }) {
  return (
    <div role="radiogroup" aria-label="Target network" className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-950">
      {(["nile", "shasta", "mainnet"] as NetworkId[]).map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          onClick={() => onChange(n)}
          className={cx(
            "relative rounded-lg px-2 py-2 text-xs font-medium transition-colors sm:text-sm",
            value === n ? "bg-white shadow-sm dark:bg-zinc-800" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200",
          )}
        >
          {NETWORKS[n].label}
          {walletNetwork === n && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" title="TronLink is on this network" />}
          {n === "mainnet" && <span className="ml-1 hidden text-[10px] uppercase text-red-500 sm:inline">real TRX</span>}
        </button>
      ))}
    </div>
  );
}

function CostView({ data: d, notes, network }: { data: CostEstimate; notes: string[]; network: NetworkId }) {
  return (
    <div className="space-y-5 animate-fade-in">
      {NETWORKS[network].testnet ? (
        <Callout tone="success" title={`${NETWORKS[network].label}: free test TRX`}>
          Testnet TRX has no value. Get it free from the faucet{NETWORKS[network].faucet && <> (<ExternalLink href={NETWORKS[network].faucet!}>open faucet</ExternalLink>)</>}. Real TRX is only spent on TRON Mainnet.
        </Callout>
      ) : (
        <Callout tone="warning" title="Mainnet: real TRX">
          You pay what the deployment uses (≈ {trx(d.walletTrx ?? d.totalTrx)}), not the fee limit.
        </Callout>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={<Zap className="h-4 w-4" />} label="Energy" value={groupDigits(d.energy)} sub={`${d.energyFeeSun} sun each → ${trx(d.energyTrx)}`} />
        <Stat icon={<Flame className="h-4 w-4" />} label="Bandwidth" value={`~${groupDigits(d.bandwidthBytes)} B`} sub={`${d.bandwidthFeeSun} sun/B → ${trx(d.bandwidthTrx)}`} />
        <Stat highlight label={d.walletTrx !== null ? "Your cost" : "Total (worst case)"} value={trx(d.walletTrx ?? d.totalTrx)}
          sub={d.walletTrx !== null ? `Worst case ${trx(d.totalTrx)} without staked resources` : "Burned if you have no staked energy"} />
      </div>
      <KV rows={[
        { k: "Network", v: NETWORKS[network].label },
        { k: "Energy source", v: d.energySource === "simulated" ? <Badge tone="success">Simulated on-chain (exact)</Badge> : <Badge tone="warning">Approximate</Badge> },
        {
          k: "Fee limit (safety cap)",
          v: <span>{trx(d.feeLimitSun / SUN_PER_TRX)} <span className="block text-xs font-normal text-zinc-500 dark:text-zinc-400">The most TRON may burn. You're charged only what's used (≈ {trx(d.walletTrx ?? d.totalTrx)}). A balance a bit above that is enough.</span></span>,
        },
        ...(d.account ? [
          { k: "Wallet balance", v: trx(d.account.balanceSun / SUN_PER_TRX) },
          { k: "Your available energy", v: groupDigits(d.account.energyAvailable) },
          { k: "Your available bandwidth", v: groupDigits(d.account.bandwidthAvailable) },
        ] : []),
      ]} />
      {notes.map((n) => <Callout key={n} tone="warning">{n}</Callout>)}
      <Callout tone="info" title="Why this costs what it does">
        You pay once to store the contract code on TRON (~2 KB), not per token, so 50 tokens and 1 billion tokens cost the same.
        To pay less, rent or stake {groupDigits(d.energy)} energy before deploying. Then only the bandwidth (≈ {trx(d.bandwidthTrx)}) is burned.
      </Callout>
    </div>
  );
}

function Stat({ icon, label, value, sub, highlight }: { icon?: React.ReactNode; label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={cx("rounded-xl border p-4", highlight ? "border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10" : "border-zinc-200 dark:border-zinc-800")}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">{icon}{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{sub}</p>}
    </div>
  );
}

function CheckRow({ ok, label, children }: { ok: boolean; label: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" aria-label="Done" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-zinc-300 dark:text-zinc-600" aria-label="Pending" />}
      <div className="min-w-0 space-y-1 break-all">
        <p className="text-sm font-medium">{label}</p>
        {children}
      </div>
    </li>
  );
}

function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer gap-3 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-rose-600" />
      <span className="text-zinc-700 dark:text-zinc-300">{children}</span>
    </label>
  );
}

function DeployTimeline({ p, network }: { p: DeployProgress; network: NetworkId }) {
  const phases = ["building", "signing", "broadcasting", "confirming"] as const;
  const labels = { building: "Building transaction", signing: "Waiting for your signature in TronLink", broadcasting: "Broadcasting", confirming: "Waiting for block confirmation" };
  const idx = phases.indexOf(p.phase as (typeof phases)[number]);
  return (
    <ol className="space-y-2 rounded-xl bg-zinc-50 p-4 text-sm dark:bg-zinc-950/60" aria-live="polite">
      {phases.map((ph, i) => (
        <li key={ph} className={cx("flex items-center gap-2", i > idx && "opacity-40")}>
          {i < idx ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : i === idx ? <Loader2 className="h-4 w-4 animate-spin text-rose-500" /> : <Circle className="h-4 w-4" />}
          {labels[ph]}
          {ph === "confirming" && p.phase === "confirming" && <ExternalLink className="ml-auto text-xs" href={explorerTx(network, p.txid)}>Tronscan</ExternalLink>}
        </li>
      ))}
    </ol>
  );
}

function DeployedView({ cfg, network, d, onVerify }: { cfg: TokenConfig; network: NetworkId; d: Extract<DeployProgress, { phase: "done" }>; onVerify: () => void }) {
  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-gradient-to-b from-emerald-50 to-transparent px-6 py-8 text-center dark:from-emerald-500/10">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"><CheckCircle2 className="h-7 w-7" /></div>
        <div>
          <p className="text-lg font-semibold">{cfg.symbol} is live on {NETWORKS[network].label}</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{groupDigits(cfg.supply)} {cfg.symbol} are now in your wallet.</p>
        </div>
      </div>
      <KV rows={[
        { k: "Contract address", v: d.address, mono: true, copy: d.address },
        { k: "Transaction", v: shortAddr(d.txid), mono: true, copy: d.txid },
        ...(d.energyUsed ? [{ k: "Energy used", v: groupDigits(d.energyUsed) }] : []),
        ...(d.feeSun !== undefined ? [{ k: "TRX burned", v: trx(d.feeSun / SUN_PER_TRX) }] : []),
        { k: "On-chain check", v: d.checked ? <Badge tone="success">totalSupply() matches</Badge> : <Badge tone="warning">Pending, recheck on Tronscan</Badge> },
      ]} />
      <AddToWallet address={d.address} cfg={cfg} />
      <div className="flex flex-wrap justify-end gap-2">
        <a href={explorerContract(network, d.address)} target="_blank" rel="noopener noreferrer"><Button variant="secondary" icon={<ExtIcon className="h-4 w-4" />}>Open on Tronscan</Button></a>
        <Button onClick={onVerify} icon={<BadgeCheck className="h-4 w-4" />}>Verify source code</Button>
      </div>
    </div>
  );
}

function AddToWallet({ address, cfg }: { address: string; cfg: TokenConfig }) {
  const [state, setState] = useState<{ status: "idle" | "busy" | "done" | "error"; msg?: string }>({ status: "idle" });
  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Show {cfg.symbol} in TronLink</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">One click: TronLink asks you to confirm adding the token.</p>
        </div>
        <Button
          size="sm"
          loading={state.status === "busy"}
          icon={<PlusCircle className="h-4 w-4" />}
          onClick={async () => {
            setState({ status: "busy" });
            try {
              await addTokenToWallet(address);
              setState({ status: "done" });
            } catch (e) {
              setState({ status: "error", msg: (e as Error).message });
            }
          }}
        >
          Add {cfg.symbol} to TronLink
        </Button>
      </div>
      {state.status === "done" && <Callout tone="success">Added. {cfg.symbol} now appears in your TronLink token list.</Callout>}
      {state.status === "error" && (
        <Callout tone="warning" title="Add it manually">
          {state.msg} In TronLink, click <b>⊕</b> next to Tokens, paste <code className="break-all font-mono">{address}</code>, then click Add.
        </Callout>
      )}
    </div>
  );
}

function VerifyView({ cfg, source, readme, network, address, onBack }: { cfg: TokenConfig; source: string; readme: string; network: NetworkId; address?: string; onBack: () => void }) {
  const c = contractName(cfg);
  return (
    <Card className="animate-fade-in">
      <CardHeader icon={<BadgeCheck className="h-4 w-4" />} title="Verify on Tronscan" subtitle="Publishing the source gives your contract a green check and lets anyone confirm it has no hidden functions." />
      <div className="space-y-5 p-5">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
          <li>Download the source file below. <b>Don&apos;t edit or reformat it.</b></li>
          <li>Open the <ExternalLink href={explorerVerify(network)}>{NETWORKS[network].label} verification page</ExternalLink>.</li>
          <li>Fill in the form with exactly these values, upload the file, solve the captcha and click <b>Verify and Publish</b>.</li>
        </ol>
        <KV rows={[
          { k: "Contract address", v: address ?? <span className="text-zinc-400">your deployed address</span>, mono: true, copy: address },
          { k: "Main contract", v: c, mono: true, copy: c },
          { k: "Compiler", v: `${COMPILER.version} (TRON)`, mono: true, copy: COMPILER.version },
          { k: "License", v: "MIT" },
          { k: "Optimization", v: "Yes" },
          { k: "Runs", v: String(COMPILER.optimizer.runs), copy: String(COMPILER.optimizer.runs) },
          { k: "Constructor arguments", v: "None" },
        ]} />
        <div className="flex flex-wrap gap-2">
          <Button icon={<Download className="h-4 w-4" />} onClick={() => downloadFile(sourceFileName(cfg), source)}>{sourceFileName(cfg)}</Button>
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => downloadFile("README.md", readme, "text/markdown")}>README.md</Button>
          <a href={explorerVerify(network)} target="_blank" rel="noopener noreferrer"><Button variant="secondary" icon={<ExtIcon className="h-4 w-4" />}>Open Tronscan verify</Button></a>
        </div>
        <Callout tone="warning" title="If verification fails">
          Make sure the file is unchanged and that compiler, optimization and runs match exactly. The main contract must be <code className="font-mono">{c}</code>.
        </Callout>
        <div className="flex border-t border-zinc-200 pt-5 dark:border-zinc-800">
          <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={onBack}>Back</Button>
        </div>
      </div>
    </Card>
  );
}
