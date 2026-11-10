"use client";

/** Heavier, on-demand parts of a token card. Loaded lazily (next/dynamic) by MyTokens. */
import { useCallback, useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, History, Loader2, Repeat, Sparkles, Timer } from "lucide-react";
import { readTokens as readSaved, type SavedToken } from "@/lib/token-store";
import { formatUnits } from "@/lib/units";
import { explorerTx, ZERO_ADDRESS_BASE58 } from "@/lib/tron/networks";
import { directionOf, fetchHistory, type Transfer } from "@/lib/tron/history";
import { listTimedSends, settleTimedSend, type SendProgress, type TimedSendRecord } from "@/lib/tron/tronlink";
import { humanDuration } from "@/lib/duration";
import { shortAddr } from "./SiteHeader";
import { Badge, Button, Callout, cx } from "./ui";

/** Pending and settled timed sends that involve this wallet, with Claim / Reclaim buttons. */
export function TimedSends({ token, owner, version, onSettled }: { token: SavedToken; owner: string; version: number; onSettled: () => void }) {
  const [rows, setRows] = useState<TimedSendRecord[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [busy, setBusy] = useState<{ id: number; p: SendProgress } | null>(null);
  const [showSettled, setShowSettled] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await listTimedSends(token.address, owner)); } catch (e) { setErr((e as Error).message); }
  }, [token.address, owner]);
  useEffect(() => { void load(); }, [load, version]);
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const settle = async (r: TimedSendRecord, action: "claim" | "reclaim") => {
    await settleTimedSend(token.address, r.id, action, (p) => {
      setBusy({ id: r.id, p });
      if (p.phase === "done") { setBusy(null); onSettled(); }
    });
  };

  const pending = rows?.filter((r) => r.status === "pending") ?? [];
  const settled = rows?.filter((r) => r.status !== "pending") ?? [];
  if (rows && rows.length === 0 && !err) return null;

  return (
    <div className="space-y-3 border-t border-zinc-200 p-5 dark:border-zinc-800">
      <p className="flex items-center gap-2 text-sm font-semibold"><Timer className="h-4 w-4" /> Timed sends {pending.length > 0 && <Badge tone="warning">{pending.length} pending</Badge>}</p>
      {err && <Callout tone="danger">{err}</Callout>}
      {!rows && !err && <p className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
      <ul className="space-y-2">
        {[...pending, ...(showSettled ? settled : [])].map((r) => {
          const left = r.expiresAt - now;
          const mine = r.from === owner;
          const forMe = r.to === owner;
          const canClaim = r.status === "pending" && forMe && left > 0;
          const canReclaim = r.status === "pending" && mine && left <= 0;
          const b = busy?.id === r.id ? busy.p : null;
          return (
            <li key={r.id} className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium tabular-nums">
                  #{r.id} · {formatUnits(r.value, token.decimals)} {token.symbol}{" "}
                  <span className="font-normal text-zinc-500">
                    {mine && forMe ? "to yourself" : mine ? <>to <span className="font-mono">{shortAddr(r.to)}</span></> : <>from <span className="font-mono">{shortAddr(r.from)}</span></>}
                  </span>
                </p>
                <p className="text-xs text-zinc-500">
                  {r.status === "claimed" ? "Claimed by the recipient (final)." : r.status === "reclaimed" ? "Expired and returned to the sender." : left > 0
                    ? <>Expires in <b className="tabular-nums">{humanDuration(left)}</b>{mine && !forMe && " · the recipient can claim until then"}</>
                    : mine ? "Expired unclaimed: you can take it back now." : "Expired: only the sender can take it back."}
                </p>
                {b?.phase === "failed" && <p className="text-xs text-red-600 dark:text-red-400">{b.error}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                {canClaim && <Button size="sm" icon={<ArrowDownLeft className="h-4 w-4" />} loading={b?.phase === "signing" || b?.phase === "confirming"} onClick={() => settle(r, "claim")}>Claim</Button>}
                {canReclaim && <Button size="sm" variant="secondary" icon={<Repeat className="h-4 w-4" />} loading={b?.phase === "signing" || b?.phase === "confirming"} onClick={() => settle(r, "reclaim")}>Reclaim</Button>}
                {r.status === "pending" && mine && !forMe && left > 0 && <Badge tone="neutral">waiting</Badge>}
              </div>
            </li>
          );
        })}
      </ul>
      {settled.length > 0 && (
        <button type="button" className="text-xs font-medium text-rose-600 hover:underline dark:text-rose-400" onClick={() => setShowSettled((v) => !v)}>
          {showSettled ? "Hide" : "Show"} {settled.length} finished timed send{settled.length === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );
}

/** Recent transfers of this token for this wallet, with plain-language labels for every address. */
export function HistoryPanel({ token, owner, version }: { token: SavedToken; owner: string; version: number }) {
  const [rows, setRows] = useState<Transfer[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setErr(null);
    fetchHistory(token.network, token.address, owner).then((r) => live && setRows(r), (e) => live && setErr((e as Error).message));
    return () => { live = false; };
  }, [token.network, token.address, owner, version]);

  const label = (a: string) => {
    if (a === owner) return "You";
    if (a === token.address) return `${token.symbol} contract (timed-send lock)`;
    if (a === ZERO_ADDRESS_BASE58) return "Created";
    const saved = readSaved().find((t) => t.address === a);
    if (saved) return `${saved.symbol} token CONTRACT (not a wallet)`;
    return shortAddr(a);
  };

  return (
    <div className="space-y-3 border-t border-zinc-200 p-5 dark:border-zinc-800">
      <p className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" /> History <span className="font-normal text-zinc-500">(last 50 {token.symbol} transfers of this wallet; new ones can take ~1 minute to appear)</span></p>
      {err && <Callout tone="danger">{err}</Callout>}
      {!rows && !err && <p className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
      {rows?.length === 0 && <p className="text-sm text-zinc-500">No transfers yet.</p>}
      {rows && rows.length > 0 && (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
          {rows.map((t) => {
            const d = directionOf(t, owner);
            const Icon = d === "in" ? ArrowDownLeft : d === "out" ? ArrowUpRight : d === "self" ? Repeat : Sparkles;
            const tone = d === "in" || d === "created" ? "text-emerald-600 dark:text-emerald-400" : d === "out" ? "text-red-600 dark:text-red-400" : "text-zinc-500";
            const stuck = d === "out" && readSaved().some((s) => s.address === t.to);
            return (
              <li key={`${t.txid}:${t.from}:${t.to}:${t.value}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <Icon className={cx("h-4 w-4 shrink-0", tone)} aria-hidden />
                <span className={cx("font-semibold tabular-nums", tone)}>
                  {d === "out" ? "−" : d === "self" ? "±" : "+"}{formatUnits(BigInt(t.value), token.decimals)} {token.symbol}
                </span>
                <span className="min-w-0 flex-1 text-zinc-600 dark:text-zinc-400">
                  {d === "created" ? "Created (initial supply)" : d === "self" ? "To yourself" : d === "in" ? <>From {label(t.from)}</> : <>To {label(t.to)}</>}
                  {stuck && <span className="ml-2 text-xs font-medium text-red-600 dark:text-red-400">stuck: sent to a token contract</span>}
                </span>
                <span className="text-xs text-zinc-500">{new Date(t.at).toLocaleString()}</span>
                <a className="text-xs font-medium text-rose-600 hover:underline dark:text-rose-400" href={explorerTx(token.network, t.txid)} target="_blank" rel="noopener noreferrer">tx</a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
