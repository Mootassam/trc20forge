#!/usr/bin/env node
/**
 * Wraps release/TRC20-Forge/ into release/TRC20-Forge-Setup-<version>.exe with Inno Setup 6.
 *   npm run build:installer      (builds the exe first, then the installer)
 * Needs Inno Setup 6 (free): winget install --id JRSoftware.InnoSetup -e --scope user
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(repo, "release", "TRC20-Forge");
if (!fs.existsSync(path.join(src, "TRC20-Forge.exe"))) throw new Error("Run `npm run build:exe` first.");

const env = process.env;
const iscc = [
  env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Programs", "Inno Setup 6", "ISCC.exe"),
  env["ProgramFiles(x86)"] && path.join(env["ProgramFiles(x86)"], "Inno Setup 6", "ISCC.exe"),
  env.ProgramFiles && path.join(env.ProgramFiles, "Inno Setup 6", "ISCC.exe"),
].find((p) => p && fs.existsSync(p));
if (!iscc) throw new Error("Inno Setup 6 not found. Install it: winget install --id JRSoftware.InnoSetup -e --scope user");

// The installer ships the version that the exe was built from (release README records the commit).
const version = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8")).version;
execFileSync(iscc, [
  `/DAppVersion=${version}`,
  `/DSourceDir=${src}`,
  `/DOutputDir=${path.join(repo, "release")}`,
  "/Q",
  path.join(repo, "desktop", "installer.iss"),
], { stdio: "inherit" });
const out = path.join(repo, "release", `TRC20-Forge-Setup-${version}.exe`);
console.log(`\nDone: ${out}  (${(fs.statSync(out).size / 1e6).toFixed(0)} MB)`);
