"use client";

import { COMPILER, compilerInput, contractName, sourceFileName } from "./generate";
import { parseCompilerOutput, type CompileArtifact } from "./compile";
import type { TokenConfig } from "./schema";

type WorkerReply = { id: number; ok: true; output: string; version: string } | { id: number; ok: false; error: string };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (r: WorkerReply) => void; timer: ReturnType<typeof setTimeout> }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker("/compiler-worker.js");
  worker.onmessage = (e: MessageEvent<WorkerReply>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(e.data.id);
    p.resolve(e.data);
  };
  worker.onerror = (e) => {
    const reply = (id: number): WorkerReply => ({ id, ok: false, error: e.message || "Compiler worker crashed." });
    for (const [id, p] of pending) {
      clearTimeout(p.timer);
      p.resolve(reply(id));
    }
    pending.clear();
    worker?.terminate();
    worker = null; // next call starts fresh
  };
  return worker;
}

/** Compiles with TRON solc in a background worker. First call downloads the compiler (~8 MB). */
export function compileToken(cfg: TokenConfig, timeoutMs = 180_000): Promise<CompileArtifact> {
  const id = ++seq;
  const w = getWorker();
  return new Promise<WorkerReply>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ id, ok: false, error: "Compiler timed out. Check your connection and try again." });
    }, timeoutMs);
    pending.set(id, { resolve, timer });
    w.postMessage({ id, url: COMPILER.baseUrl + COMPILER.file, input: compilerInput(cfg) });
  }).then((r) => {
    if (!r.ok) throw new Error(r.error);
    return parseCompilerOutput(r.output, sourceFileName(cfg), contractName(cfg), r.version);
  });
}
