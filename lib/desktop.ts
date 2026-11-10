/**
 * Shared state between the desktop launcher (desktop/launcher.cjs) and the Next.js routes. Both run in
 * the same Node process in the desktop app, so they talk through globalThis. On Vercel / `next dev`
 * TRC20_DESKTOP is unset and all of this is inert.
 */
type DesktopGlobals = { __trc20LastSeen?: number; __trc20Quit?: () => void };
const g = globalThis as typeof globalThis & DesktopGlobals;

export const isDesktop = () => process.env.TRC20_DESKTOP === "1";

/** Called on every heartbeat from an open app tab; the launcher stops the app when they stop coming. */
export function markSeen() {
  if (isDesktop()) g.__trc20LastSeen = Date.now();
}

/** Asks the launcher to shut the app down. Returns false when not running as the desktop app. */
export function requestQuit(): boolean {
  if (!isDesktop() || typeof g.__trc20Quit !== "function") return false;
  g.__trc20Quit();
  return true;
}
