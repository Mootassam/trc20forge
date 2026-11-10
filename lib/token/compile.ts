export type AbiItem = {
  type: string;
  name?: string;
  inputs?: { name: string; type: string; indexed?: boolean }[];
  outputs?: { name: string; type: string }[];
  stateMutability?: string;
  anonymous?: boolean;
};

export type CompileArtifact = {
  abi: AbiItem[];
  /** Creation bytecode, hex without 0x. */
  bytecode: string;
  /** Runtime bytecode, hex without 0x. */
  deployedBytecode: string;
  compilerVersion: string;
  warnings: string[];
};

type SolcMessage = { severity: "error" | "warning" | "info"; formattedMessage?: string; message: string };

export class CompileError extends Error {
  constructor(public readonly messages: string[]) {
    super(messages[0] ?? "Compilation failed.");
    this.name = "CompileError";
  }
}

const HEX = /^[0-9a-fA-F]+$/;

/** Turns raw standard-JSON output into a checked artifact, or throws CompileError. */
export function parseCompilerOutput(
  rawOutput: string,
  fileName: string,
  contract: string,
  compilerVersion: string,
): CompileArtifact {
  let out: {
    errors?: SolcMessage[];
    contracts?: Record<string, Record<string, { abi: AbiItem[]; evm: { bytecode: { object: string }; deployedBytecode: { object: string } } }>>;
  };
  try {
    out = JSON.parse(rawOutput);
  } catch {
    throw new CompileError(["The compiler returned unreadable output."]);
  }

  const msgs = out.errors ?? [];
  const errors = msgs.filter((m) => m.severity === "error").map((m) => m.formattedMessage ?? m.message);
  if (errors.length) throw new CompileError(errors);

  const c = out.contracts?.[fileName]?.[contract];
  if (!c) throw new CompileError([`Contract ${contract} was not found in the compiler output.`]);

  const bytecode = c.evm.bytecode.object;
  const deployedBytecode = c.evm.deployedBytecode.object;
  if (!bytecode || !HEX.test(bytecode) || bytecode.length % 2 !== 0) throw new CompileError(["Compiler produced invalid bytecode."]);

  return {
    abi: c.abi,
    bytecode,
    deployedBytecode,
    compilerVersion,
    warnings: msgs.filter((m) => m.severity === "warning").map((m) => m.formattedMessage ?? m.message),
  };
}

/** Functions the generated contract must expose, used as a post-compile safety check. */
export const REQUIRED_FUNCTIONS = [
  "name", "symbol", "decimals", "totalSupply", "balanceOf", "allowance",
  "transfer", "approve", "transferFrom", "increaseAllowance", "decreaseAllowance",
] as const;

/** Anything in this list showing up in the ABI means the contract is not fixed-supply / owner-free. */
export const FORBIDDEN_FUNCTIONS = [
  "mint", "burn", "burnFrom", "owner", "transferOwnership", "renounceOwnership",
  "pause", "unpause", "freeze", "blacklist", "addBlackList", "destroyBlackFunds", "issue", "redeem",
] as const;

/** Functions/events of the optional "timed sends" extension. */
export const TIMED_FUNCTIONS = ["sendTimed", "claimTimed", "reclaimTimed", "timedSend", "timedSendCount"] as const;
export const TIMED_EVENTS = ["TimedSendCreated", "TimedSendClaimed", "TimedSendReclaimed"] as const;

export function auditAbi(
  abi: AbiItem[],
  features: { burn?: boolean; batch?: boolean; erc165?: boolean; timed?: boolean } = {},
): { ok: boolean; missing: string[]; forbidden: string[]; events: string[] } {
  const fns = new Set(abi.filter((i) => i.type === "function").map((i) => i.name!));
  const events = abi.filter((i) => i.type === "event").map((i) => i.name!);
  const required: string[] = [...REQUIRED_FUNCTIONS];
  if (features.burn) required.push("burn", "burnFrom");
  if (features.batch) required.push("batchTransfer");
  if (features.erc165) required.push("supportsInterface");
  if (features.timed) required.push(...TIMED_FUNCTIONS);
  const allowed = new Set(required);
  const requiredEvents: string[] = ["Transfer", "Approval", ...(features.timed ? TIMED_EVENTS : [])];
  const missing = [...required.filter((f) => !fns.has(f)), ...requiredEvents.filter((e) => !events.includes(e))];
  const forbidden: string[] = FORBIDDEN_FUNCTIONS.filter((f) => fns.has(f) && !allowed.has(f));
  // Defence in depth: any function that was not explicitly expected is flagged too.
  for (const fn of fns) if (!allowed.has(fn) && !forbidden.includes(fn)) forbidden.push(fn);
  if (abi.some((i) => i.stateMutability === "payable")) forbidden.push("payable function");
  return { ok: missing.length === 0 && forbidden.length === 0, missing, forbidden, events };
}
