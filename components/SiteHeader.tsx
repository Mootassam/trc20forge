"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Hexagon, Wallet } from "lucide-react";
import { NETWORKS } from "@/lib/tron/networks";
import { useWalletCtx } from "./WalletProvider";
import { Badge, Button, cx, Skeleton } from "./ui";

export const shortAddr = (a: string) => `${a.slice(0, 5)}…${a.slice(-5)}`;

export function SiteHeader() {
  const path = usePathname();
  const { wallet, connect, connecting, ready } = useWalletCtx();

  const nav = [
    { href: "/", label: "Forge" },
    { href: "/tokens", label: "My tokens" },
    { href: "/guide", label: "Guide" },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-zinc-50/80 backdrop-blur-lg dark:border-zinc-800/80 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-rose-500 to-red-700 text-white shadow-sm">
              <Hexagon className="h-4 w-4" aria-hidden />
            </span>
            <span className="hidden sm:inline">TRC-20 Forge</span>
          </Link>
          <nav aria-label="Main" className="flex gap-1">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={path === n.href ? "page" : undefined}
                className={cx(
                  "relative whitespace-nowrap rounded-lg px-2 py-1.5 text-sm font-medium transition-colors sm:px-3",
                  path === n.href ? "bg-zinc-200/70 text-zinc-900 dark:bg-zinc-800 dark:text-white" : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white",
                )}
              >
                {n.label}
                <NavPending />
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {!ready ? (
            <Skeleton className="h-9 w-28 rounded-xl sm:w-40" />
          ) : wallet.status === "connected" ? (
            <>
              <Badge tone={wallet.network === "mainnet" ? "danger" : wallet.network ? "success" : "warning"} className="hidden sm:inline-flex">
                <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                {wallet.network ? NETWORKS[wallet.network].label : "Custom node"}
              </Badge>
              <span className="inline-flex h-9 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 font-mono text-xs dark:border-zinc-800 dark:bg-zinc-900" title={wallet.address}>
                <Wallet className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
                {shortAddr(wallet.address)}
              </span>
            </>
          ) : (
            <Button size="sm" variant="secondary" onClick={connect} loading={connecting} icon={<Wallet className="h-4 w-4" aria-hidden />}>
              <span className="sm:hidden">{wallet.status === "unavailable" ? "Connect" : "Unlock"}</span>
              <span className="hidden sm:inline">{wallet.status === "unavailable" ? "Connect TronLink" : "Unlock TronLink"}</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * Thin animated bar under a nav link while its page is loading (Next.js useLinkStatus).
 * Delayed by CSS so instant (prefetched) navigations don't flash it.
 */
function NavPending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={cx(
        "pointer-events-none absolute inset-x-2 -bottom-[16px] h-0.5 origin-left rounded-full bg-rose-500 transition-opacity",
        pending ? "animate-nav-progress opacity-100 [transition-delay:120ms]" : "opacity-0",
      )}
    />
  );
}
