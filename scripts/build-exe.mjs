#!/usr/bin/env node
/**
 * Builds release/TRC20-Forge/ : TRC20-Forge.exe + app/ (Next.js standalone production build).
 *
 *   npm run build:exe
 *
 * It packages the last COMMIT (git HEAD), not uncommitted edits, so a release always matches the code
 * on GitHub / Vercel. Commit first, then build. Needs git, npm and internet (for npm ci).
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import rcedit from "rcedit"; // v4: CommonJS default export, works on Node 18

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = path.join(os.tmpdir(), "trc20forge-exe-build");
const out = path.join(repo, "release", "TRC20-Forge");
const isWin = process.platform === "win32";

const run = (cmd, args, cwd, env = {}) => {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd, stdio: "inherit", shell: isWin, env: { ...process.env, ...env } });
};
const rm = (p) => fs.rmSync(p, { recursive: true, force: true });
const copy = (from, to) => fs.cpSync(from, to, { recursive: true });

if (!isWin) throw new Error("build:exe makes a Windows .exe; run it on Windows.");

const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: repo }).toString().trim();
if (dirty) {
  console.log("\nNote: you have uncommitted changes. They are NOT included; the release is built from the last commit:");
  console.log(dirty.split("\n").map((l) => "  " + l).join("\n"));
}
const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repo }).toString().trim();

// 1. Clean copy of the committed source.
rm(work);
fs.mkdirSync(work, { recursive: true });
const tarball = path.join(os.tmpdir(), "trc20forge-src.tar");
run("git", ["archive", "--format=tar", "-o", tarball, "HEAD"], repo);
// Windows' own bsdtar: the GNU tar that ships with Git Bash reads "C:\..." as a remote host.
const winTar = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
run(fs.existsSync(winTar) ? `"${winTar}"` : "tar", ["-xf", `"${tarball}"`, "-C", `"${work}"`], repo);
rm(tarball);

// 2. Install and build the standalone server.
run("npm", ["ci", "--no-audit", "--no-fund", "--prefer-offline"], work);
run("npx", ["next", "build"], work, { TRC20_STANDALONE: "1", NEXT_TELEMETRY_DISABLED: "1" });

// 3. Assemble the release folder.
rm(out);
fs.mkdirSync(out, { recursive: true });
const app = path.join(out, "app");
copy(path.join(work, ".next", "standalone"), app);
copy(path.join(work, ".next", "static"), path.join(app, ".next", "static"));
if (fs.existsSync(path.join(work, "public"))) copy(path.join(work, "public"), path.join(app, "public"));

// 4. Single-executable launcher: an official node.exe (Node 22 LTS, which supports single-executable apps)
//    with desktop/launcher.cjs injected. The download is cached and checked against nodejs.org's SHA-256 list.
const NODE_VERSION = "v22.23.4";
async function officialNodeExe() {
  const dir = path.join(os.tmpdir(), "trc20forge-node");
  const file = path.join(dir, `node-${NODE_VERSION}-win-x64.exe`);
  const base = `https://nodejs.org/dist/${NODE_VERSION}`;
  const sums = await (await fetch(`${base}/SHASUMS256.txt`)).text();
  const want = sums.split(/\r?\n/).map((l) => l.trim().split(/\s+/)).find(([, name]) => name === "win-x64/node.exe")?.[0];
  if (!want) throw new Error("Couldn't find node.exe in Node's checksum list.");
  const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
  if (fs.existsSync(file) && sha(fs.readFileSync(file)) === want) return file;
  console.log(`
> downloading ${base}/win-x64/node.exe`);
  const res = await fetch(`${base}/win-x64/node.exe`);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha(buf) !== want) throw new Error("node.exe checksum mismatch: refusing to use it.");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, buf);
  return file;
}
const nodeExe = await officialNodeExe();
const blob = path.join(work, "sea-prep.blob");
const seaConfig = path.join(work, "sea-config.json");
fs.writeFileSync(seaConfig, JSON.stringify({ main: path.join(work, "desktop", "launcher.cjs"), output: blob, disableExperimentalSEAWarning: true }));
run(`"${nodeExe}"`, ["--experimental-sea-config", `"${seaConfig}"`], work);
const exe = path.join(out, "TRC20-Forge.exe");
fs.copyFileSync(nodeExe, exe);
// App icon + file details (shown in Explorer / Task Manager). Must happen before the blob is injected.
const version = JSON.parse(fs.readFileSync(path.join(work, "package.json"), "utf8")).version;
await rcedit(exe, {
  icon: path.join(work, "desktop", "icon.ico"),
  "file-version": version,
  "product-version": version,
  "version-string": { ProductName: "TRC-20 Forge", FileDescription: "TRC-20 Forge", CompanyName: "TRC-20 Forge", OriginalFilename: "TRC20-Forge.exe", InternalName: "TRC20-Forge", LegalCopyright: "" },
});
run("npx", ["--yes", "postject@1.0.0-alpha.6", `"${exe}"`, "NODE_SEA_BLOB", `"${blob}"`, "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"], work);

// Mark the exe as a Windows GUI app (PE subsystem 2) instead of a console app (3): Windows then starts it
// without a console window. The launcher logs to a file and shows errors as message boxes instead.
{
  const buf = fs.readFileSync(exe);
  const pe = buf.readUInt32LE(0x3c);
  if (buf.toString("latin1", pe, pe + 4) !== "PE\0\0") throw new Error("Not a PE file: " + exe);
  const subsystemOffset = pe + 24 + 68; // optional header + Subsystem (same offset for PE32 and PE32+)
  if (buf.readUInt16LE(subsystemOffset) !== 3) throw new Error("Unexpected PE subsystem; refusing to patch.");
  buf.writeUInt16LE(2, subsystemOffset);
  fs.writeFileSync(exe, buf);
}

fs.writeFileSync(path.join(out, "README.txt"), [
  "TRC-20 Forge (desktop)",
  "======================",
  "",
  "1. Double-click TRC20-Forge.exe.",
  "2. Chrome opens at http://127.0.0.1:3210 . Use the Chrome profile where TronLink is installed.",
  "3. It runs quietly in the background (no window). Stop it with Quit in the app header;",
  "   it also stops by itself a few minutes after you close the app's tab.",
  "   Log file: %LOCALAPPDATA%\\TRC-20 Forge\\launcher.log",
  "",
  "Keep TRC20-Forge.exe next to the \"app\" folder. Internet is needed (TronLink and the compiler download).",
  "Windows SmartScreen may warn the first time because the exe isn't code-signed: More info -> Run anyway.",
  "",
  `Built from commit ${commit}.`,
  "",
].join("\r\n"));

rm(work);
const size = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((t, d) => t + (d.isDirectory() ? size(path.join(dir, d.name)) : fs.statSync(path.join(dir, d.name)).size), 0);
console.log(`\nDone: ${out}  (${(size(out) / 1e6).toFixed(0)} MB, commit ${commit})`);
