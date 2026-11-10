"use client";

import { useEffect, useState } from "react";
import { Power } from "lucide-react";
import { Button } from "./ui";

const HEARTBEAT_MS = 20_000;
const isLocalHost = () => typeof window !== "undefined" && ["127.0.0.1", "localhost", "[::1]"].includes(window.location.hostname);

/**
 * Only in the installed desktop app (whose window is hidden): keeps it alive while this tab is open and
 * shows a Quit button. On the website it renders nothing and makes no requests.
 */
export function DesktopControls() {
  const [desktop, setDesktop] = useState(false);
  const [state, setState] = useState<"idle" | "quitting" | "stopped">("idle");

  useEffect(() => {
    if (!isLocalHost()) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const ping = () => fetch("/api/health", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    ping().then((h: { desktop?: boolean } | null) => {
      if (!h?.desktop) return;
      setDesktop(true);
      timer = setInterval(ping, HEARTBEAT_MS);
    });
    const onVisible = () => document.visibilityState === "visible" && ping();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!desktop) return null;

  const quit = async () => {
    setState("quitting");
    await fetch("/api/desktop/quit", { method: "POST" }).catch(() => null);
    setState("stopped");
  };

  return (
    <>
      <Button size="sm" variant="ghost" onClick={quit} loading={state === "quitting"} icon={<Power className="h-4 w-4" aria-hidden />} title="Stop TRC-20 Forge">
        <span className="hidden md:inline">Quit</span>
      </Button>
      {state === "stopped" && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="stopped-title" className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/60 p-4 backdrop-blur-sm">
          <div className="max-w-sm space-y-2 rounded-2xl bg-white p-6 text-center shadow-xl dark:bg-zinc-900">
            <Power className="mx-auto h-8 w-8 text-rose-500" aria-hidden />
            <p id="stopped-title" className="font-semibold">TRC-20 Forge is stopped</p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">You can close this tab. Start it again from the desktop or Start Menu shortcut.</p>
          </div>
        </div>
      )}
    </>
  );
}
