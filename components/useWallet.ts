"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { connectWallet, readWallet, type WalletState } from "@/lib/tron/tronlink";

const same = (a: WalletState, b: WalletState) =>
  a.status === b.status && (a.status !== "connected" || (b.status === "connected" && a.address === b.address && a.host === b.host));

/**
 * TronLink injects itself a moment AFTER the page loads and only then reports the account.
 * Until it does (or this grace period passes) the state is "not known yet", and UIs should show a
 * placeholder instead of a "Connect" button that flips to the account a second later.
 */
const DETECT_MS = 1500;

/** Tracks TronLink account and network. Uses TronLink's postMessage events plus a light poll as a fallback. */
export function useWallet() {
  const [state, setState] = useState<WalletState>({ status: "unavailable" });
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const ref = useRef(state);

  const refresh = useCallback(() => {
    const next = readWallet();
    if (!same(ref.current, next)) {
      ref.current = next;
      setState(next);
    }
  }, []);

  // Detection: settle as soon as an account appears, or after DETECT_MS when there is none.
  useEffect(() => {
    if (ready) return;
    const start = Date.now();
    const check = () => {
      refresh();
      if (ref.current.status === "connected" || Date.now() - start >= DETECT_MS) setReady(true);
    };
    check();
    const t = setInterval(check, 100);
    window.addEventListener("tronLink#initialized", check);
    return () => {
      clearInterval(t);
      window.removeEventListener("tronLink#initialized", check);
    };
  }, [ready, refresh]);

  useEffect(() => {
    refresh();
    const onMsg = (e: MessageEvent) => {
      const action = (e.data as { message?: { action?: string } })?.message?.action;
      if (action && /account|node|connect|disconnect|tabReply/i.test(action)) setTimeout(refresh, 50);
    };
    window.addEventListener("message", onMsg);
    const t = setInterval(refresh, 1500);
    return () => {
      window.removeEventListener("message", onMsg);
      clearInterval(t);
    };
  }, [refresh]);

  const connect = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      const s = await connectWallet();
      ref.current = s;
      setState(s);
      if (s.status !== "connected") setError("TronLink is locked. Unlock it and approve the connection.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConnecting(false);
    }
  }, []);

  return { wallet: state, connect, connecting, error, ready };
}
