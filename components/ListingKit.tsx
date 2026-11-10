"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, ImageUp, Package, RefreshCw } from "lucide-react";
import type { TokenConfig } from "@/lib/token/schema";
import type { AbiItem } from "@/lib/token/compile";
import { EMPTY_PROJECT, kitEntries, kitFileName, projectInfoSchema, validateKit, type ProjectInfo } from "@/lib/listing";
import { coinLogoSvg, renderPng, svgDataUrl } from "@/lib/logo";
import { createZip } from "@/lib/zip";
import { NETWORKS, TRON_ADDRESS, type NetworkId } from "@/lib/tron/networks";
import { Button, Callout, Card, CardHeader, cx, Field, inputClass } from "./ui";

const STORE = "trc20-forge:project:v1";

const FIELDS: { key: keyof ProjectInfo; label: string; placeholder: string; required?: boolean }[] = [
  { key: "website", label: "Website", placeholder: "https://yourtoken.com", required: true },
  { key: "email", label: "Contact email", placeholder: "team@yourtoken.com", required: true },
  { key: "x", label: "X (Twitter)", placeholder: "https://x.com/yourtoken" },
  { key: "telegram", label: "Telegram", placeholder: "https://t.me/yourtoken" },
  { key: "github", label: "GitHub", placeholder: "https://github.com/yourtoken" },
  { key: "whitepaper", label: "Whitepaper", placeholder: "https://yourtoken.com/whitepaper.pdf" },
];

export function ListingKit({ cfg, source, abi, network, address: deployedAddress }: { cfg: TokenConfig; source: string; abi?: AbiItem[]; network: NetworkId; address?: string }) {
  const [info, setInfo] = useState<ProjectInfo>(EMPTY_PROJECT);
  const [address, setAddress] = useState(deployedAddress ?? "");
  const [touched, setTouched] = useState(false);
  const [logo, setLogo] = useState<{ src: string; custom: boolean }>({ src: svgDataUrl(coinLogoSvg(cfg.symbol)), custom: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string[]>([]);
  const [ok, setOk] = useState(false);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? "null");
      if (saved && typeof saved === "object") setInfo({ ...EMPTY_PROJECT, ...saved });
    } catch { /* storage unavailable */ }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORE, JSON.stringify(info)); } catch { /* ignore */ }
  }, [info, hydrated]);
  useEffect(() => { if (deployedAddress) setAddress(deployedAddress); }, [deployedAddress]);
  useEffect(() => {
    if (!logo.custom) setLogo({ src: svgDataUrl(coinLogoSvg(cfg.symbol)), custom: false });
  }, [cfg.symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  const fieldErrors = useMemo(() => {
    const r = projectInfoSchema.safeParse(info);
    const e: Partial<Record<keyof ProjectInfo, string>> = {};
    if (!r.success) for (const i of r.error.issues) e[i.path[0] as keyof ProjectInfo] ??= i.message;
    return e;
  }, [info]);
  const addrErr = address && !TRON_ADDRESS.test(address.trim()) ? "Not a valid TRON address (starts with T, 34 characters)." : !address ? "Paste your deployed contract address." : undefined;

  async function build() {
    setTouched(true);
    setOk(false);
    setErr([]);
    setBusy(true);
    try {
      const [logo256, logo200] = await Promise.all([renderPng(logo.src, 256), renderPng(logo.src, 200)]);
      const addr = address.trim();
      const problems = validateKit({ address: addr, info, logo256 });
      if (problems.length) {
        setErr(problems);
        return;
      }
      const zip = createZip(kitEntries({ cfg, address: addr, network, info, source, abiJson: JSON.stringify(abi ?? [], null, 2), logo256, logo200 }));
      const url = URL.createObjectURL(new Blob([zip as Uint8Array<ArrayBuffer>], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = kitFileName(cfg);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setOk(true);
    } catch (e) {
      setErr([(e as Error).message]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="animate-fade-in">
      <CardHeader
        icon={<Package className="h-4 w-4" />}
        title="Listing kit: wallets, trackers and exchanges"
        subtitle="One ZIP with every file Tronscan, Trust Wallet, CoinGecko / CoinMarketCap and your website need, correctly formatted."
      />
      <div className="space-y-5 p-5">
        <Callout tone="warning" title="Honest expectations">
          No code can make a token appear automatically in Binance Wallet or other wallets. Wallets show tokens users add, or tokens with
          liquidity and tracker data (CoinGecko / CoinMarketCap). This kit makes every submission quick and correct. Liquidity and reviews are up to you and the platforms.
          {network !== "mainnet" && <> <b>You&apos;re on {NETWORKS[network].label}:</b> listings only accept mainnet tokens, so use this kit for practice.</>}
        </Callout>

        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo.src} alt={`${cfg.symbol} logo preview`} className="h-32 w-32 rounded-2xl border border-zinc-200 bg-white object-cover dark:border-zinc-800" />
            <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900">
              <ImageUp className="h-3.5 w-3.5" aria-hidden /> Upload logo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 5 * 1024 * 1024) { setErr(["Logo file is over 5 MB. Use a smaller image."]); return; }
                  setLogo({ src: URL.createObjectURL(file), custom: true });
                }}
              />
            </label>
            {logo.custom && (
              <button type="button" className="flex w-full items-center justify-center gap-1 text-xs text-zinc-500 underline" onClick={() => setLogo({ src: svgDataUrl(coinLogoSvg(cfg.symbol)), custom: false })}>
                <RefreshCw className="h-3 w-3" aria-hidden /> Use generated logo
              </button>
            )}
            <p className="text-[11px] leading-4 text-zinc-500">Square image. Exported as 256×256 (Trust Wallet) and 200×200 (Tronscan) PNG. Don&apos;t use a real person&apos;s photo or someone else&apos;s logo.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field id="kit-address" label="Contract address" error={touched ? addrErr : undefined} hint={deployedAddress ? "From your deployment." : "Paste the deployed contract address."}>
                <input id="kit-address" className={cx(inputClass(!!(touched && addrErr)), "font-mono")} value={address} onChange={(e) => setAddress(e.target.value.trim())} placeholder="T…" autoComplete="off" />
              </Field>
            </div>
            {FIELDS.map((f) => (
              <Field key={f.key} id={`kit-${f.key}`} label={f.required ? f.label : `${f.label} (optional)`} error={touched ? fieldErrors[f.key] : undefined}>
                <input
                  id={`kit-${f.key}`}
                  className={inputClass(!!(touched && fieldErrors[f.key]))}
                  value={info[f.key]}
                  placeholder={f.placeholder}
                  type={f.key === "email" ? "email" : "url"}
                  autoComplete="off"
                  onChange={(e) => setInfo((s) => ({ ...s, [f.key]: e.target.value }))}
                />
              </Field>
            ))}
            <div className="sm:col-span-2">
              <Field id="kit-description" label="Description" aside={`${info.description.length}/600`} error={touched ? fieldErrors.description : undefined} hint="What the token is, honestly. No price promises.">
                <textarea
                  id="kit-description"
                  rows={3}
                  maxLength={600}
                  className={cx(inputClass(!!(touched && fieldErrors.description)), "h-auto py-2.5")}
                  value={info.description}
                  onChange={(e) => setInfo((s) => ({ ...s, description: e.target.value }))}
                />
              </Field>
            </div>
          </div>
        </div>

        {err.length > 0 && <Callout tone="danger" title="Fix these first"><ul className="list-disc pl-4">{err.map((e) => <li key={e}>{e}</li>)}</ul></Callout>}
        {ok && <Callout tone="success" title="Kit downloaded">Open the ZIP and follow README.md. It lists every submission in the right order.</Callout>}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-5 dark:border-zinc-800">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Includes: Tronscan record sheet · Trust Wallet info.json + logo.png · tokenlist.json · CoinGecko/CMC facts · add-to-wallet.html · source + ABI
          </p>
          <Button onClick={build} loading={busy} icon={<Download className="h-4 w-4" />}>Download listing kit (.zip)</Button>
        </div>
      </div>
    </Card>
  );
}
