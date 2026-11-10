/* TRC-20 Forge desktop launcher.
 *
 * Bundled into TRC20-Forge.exe (Node single-executable). It starts the production build that sits
 * next to it in ./app on http://127.0.0.1:3210 and opens it in Chrome, where TronLink lives.
 * Close this window (or press Ctrl+C) to stop the app.
 *
 * The port is fixed on purpose: My tokens is saved per web address, so a stable address keeps the
 * saved list between runs. Override with the TRC20_PORT environment variable if 3210 is taken.
 */
const http = require("node:http");
const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createRequire } = require("node:module");

const PORT = Number(process.env.TRC20_PORT) || 3210;
const HOST = "127.0.0.1";
const URL = `http://${HOST}:${PORT}`;
const baseDir = path.dirname(process.execPath);
const appDir = path.join(baseDir, "app");

process.title = "TRC-20 Forge";

const line = (s = "") => process.stdout.write(s + "\n");
function banner() {
  line("");
  line("  TRC-20 Forge");
  line("  ------------");
}

/** Holds the window open long enough to read a message, then exits. */
function fail(msg) {
  line("");
  line("  ERROR: " + msg);
  line("");
  line("  This window closes in 30 seconds.");
  setTimeout(() => process.exit(1), 30_000);
}

/** True when our own app (not some other program) answers on the port. */
function isOurApp() {
  return new Promise((resolve) => {
    const req = http.get(URL + "/api/health", { timeout: 1500 }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(res.statusCode === 200 && body.includes("trc20-forge")));
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

function portFree() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(PORT, HOST);
  });
}

/** Chrome first (TronLink is a Chrome extension), then Edge, then the default browser. */
function openBrowser() {
  const env = process.env;
  const candidates = [
    path.join(env["PROGRAMFILES"] || "C:\\Program Files", "Google\\Chrome\\Application\\chrome.exe"),
    path.join(env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Google\\Chrome\\Application\\chrome.exe"),
    env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "Google\\Chrome\\Application\\chrome.exe") : "",
    path.join(env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Microsoft\\Edge\\Application\\msedge.exe"),
  ].filter(Boolean);
  const exe = candidates.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
  try {
    if (exe) spawn(exe, [URL], { detached: true, stdio: "ignore" }).unref();
    else spawn("cmd", ["/c", "start", '""', URL], { detached: true, stdio: "ignore", windowsVerbatimArguments: true }).unref();
  } catch {
    line("  Open this address in Chrome: " + URL);
  }
}

async function waitUntilReady(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await isOurApp()) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function main() {
  banner();

  if (await isOurApp()) {
    line("  Already running at " + URL + ". Opening it in your browser.");
    openBrowser();
    setTimeout(() => process.exit(0), 2500);
    return;
  }
  if (!(await portFree())) return fail(`Port ${PORT} is used by another program. Close it, or set TRC20_PORT to another port.`);

  const serverJs = path.join(appDir, "server.js");
  if (!fs.existsSync(serverJs)) return fail(`Missing ${serverJs}. Keep TRC20-Forge.exe next to its "app" folder (unzip the whole folder).`);

  line("  Starting…");
  process.env.NODE_ENV = "production";
  process.env.PORT = String(PORT);
  process.env.HOSTNAME = HOST;
  process.env.NEXT_TELEMETRY_DISABLED = "1";

  // The standalone Next.js server runs inside this same process.
  try {
    createRequire(serverJs)(serverJs);
  } catch (e) {
    return fail("The app could not start: " + (e && e.message ? e.message : String(e)));
  }

  if (!(await waitUntilReady(60_000))) return fail("The app did not start within 60 seconds.");

  line("  Running at " + URL);
  line("");
  line("  Opening Chrome… Use the Chrome profile where TronLink is installed.");
  line("  Keep this window open while you use the app. Close it to stop TRC-20 Forge.");
  line("");
  openBrowser();
}

main().catch((e) => fail(e && e.message ? e.message : String(e)));
