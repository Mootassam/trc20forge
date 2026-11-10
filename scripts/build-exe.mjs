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
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
run("tar", ["-xf", tarball, "-C", work], repo);
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

// 4. Single-executable launcher: a copy of node.exe with desktop/launcher.cjs injected.
const blob = path.join(work, "sea-prep.blob");
const seaConfig = path.join(work, "sea-config.json");
fs.writeFileSync(seaConfig, JSON.stringify({ main: path.join(work, "desktop", "launcher.cjs"), output: blob, disableExperimentalSEAWarning: true }));
run(process.execPath, ["--experimental-sea-config", seaConfig], work);
const exe = path.join(out, "TRC20-Forge.exe");
fs.copyFileSync(process.execPath, exe);
run("npx", ["--yes", "postject@1.0.0-alpha.6", exe, "NODE_SEA_BLOB", blob, "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"], work);

fs.writeFileSync(path.join(out, "README.txt"), [
  "TRC-20 Forge (desktop)",
  "======================",
  "",
  "1. Double-click TRC20-Forge.exe.",
  "2. Chrome opens at http://127.0.0.1:3210 . Use the Chrome profile where TronLink is installed.",
  "3. Keep the small black window open while you use the app. Close it to stop.",
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
