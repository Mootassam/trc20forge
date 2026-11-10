/* TRC-20 Forge desktop launcher.
 *
 * Bundled into TRC20-Forge.exe (a Node single-executable built as a Windows GUI app, so no console
 * window appears). It starts the production build in ./app on http://127.0.0.1:3210, opens it in
 * Chrome (where TronLink lives) and then runs silently in the background.
 *
 * It stops when:
 *   - the user clicks "Quit" in the app header, or
 *   - no app tab has sent a heartbeat for IDLE_MINUTES (all tabs / Chrome closed).
 * Problems are shown as a Windows message box; details go to %LOCALAPPDATA%\TRC-20 Forge\launcher.log.
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
const IDLE_MINUTES = 4; // > Chrome's 1-minute timer throttling for background tabs
const baseDir = path.dirname(process.execPath);
const appDir = path.join(baseDir, "app");

process.title = "TRC-20 Forge";

// ---- logging: there is no console, so everything (including Next.js output) goes to a log file ----
const logDir = path.join(process.env.LOCALAPPDATA || baseDir, "TRC-20 Forge");
const logFile = path.join(logDir, "launcher.log");
try {
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(logFile, `TRC-20 Forge started ${new Date().toISOString()}\r\n`);
} catch { /* logging is best effort */ }
const log = (chunk) => { try { fs.appendFileSync(logFile, String(chunk).replace(/\x1b\[[0-9;]*m/g, "")); } catch { /* ignore */ } };
for (const stream of [process.stdout, process.stderr]) {
  stream.write = (chunk, enc, cb) => { log(chunk); (typeof enc === "function" ? enc : cb)?.(); return true; };
}
const line = (s = "") => log(s + "\r\n");

/** Native Windows message box (no console to print to). Returns once the user clicks OK. */
function messageBox(text, icon = "Error") {
  return new Promise((resolve) => {
    const esc = (s) => s.replace(/'/g, "''");
    const ps = `Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('${esc(text)}', 'TRC-20 Forge', 'OK', '${icon}') | Out-Null`;
    try {
      const p = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", ps], { windowsHide: true, stdio: "ignore" });
      p.on("exit", resolve);
      p.on("error", resolve);
    } catch {
      resolve();
    }
  });
}

async function fail(msg) {
  line("ERROR: " + msg);
  await messageBox(`${msg}\n\nDetails: ${logFile}`);
  process.exit(1);
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
    else spawn("cmd", ["/c", "start", '""', URL], { detached: true, stdio: "ignore", windowsHide: true, windowsVerbatimArguments: true }).unref();
    line("Opened " + URL + (exe ? " in " + exe : " in the default browser"));
  } catch (e) {
    line("Could not open a browser: " + e.message);
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

function stop(reason) {
  line(`Stopping: ${reason}`);
  setTimeout(() => process.exit(0), 300); // let the Quit response reach the browser first
}

async function main() {
  // Double-click while it's already running: just bring the app back up in the browser.
  if (await isOurApp()) {
    line("Already running; opening the browser.");
    openBrowser();
    return setTimeout(() => process.exit(0), 1500);
  }
  if (!(await portFree())) return fail(`Port ${PORT} is used by another program.\nClose that program, or set the TRC20_PORT environment variable to another port.`);

  const serverJs = path.join(appDir, "server.js");
  if (!fs.existsSync(serverJs)) return fail(`Missing ${serverJs}.\nReinstall TRC-20 Forge.`);

  process.env.NODE_ENV = "production";
  process.env.PORT = String(PORT);
  process.env.HOSTNAME = HOST;
  process.env.NEXT_TELEMETRY_DISABLED = "1";
  process.env.TRC20_DESKTOP = "1";
  globalThis.__trc20Quit = () => stop("Quit clicked in the app");

  // The standalone Next.js server runs inside this same process.
  try {
    createRequire(serverJs)(serverJs);
  } catch (e) {
    return fail("The app could not start: " + (e && e.message ? e.message : String(e)));
  }
  if (!(await waitUntilReady(60_000))) return fail("The app did not start within 60 seconds.");

  line("Running at " + URL);
  globalThis.__trc20LastSeen = Date.now();
  openBrowser();

  // Background watchdog: stop once no app tab has checked in for a while.
  setInterval(() => {
    const idle = Date.now() - (globalThis.__trc20LastSeen || 0);
    if (idle > IDLE_MINUTES * 60_000) stop(`no open app tab for ${IDLE_MINUTES} minutes`);
  }, 30_000).unref?.();
  setInterval(() => {}, 1 << 30); // keep the process alive even if the server's handles are unref'd
}

process.on("uncaughtException", (e) => line("Uncaught: " + (e && e.stack ? e.stack : e)));
main().catch((e) => fail(e && e.message ? e.message : String(e)));
