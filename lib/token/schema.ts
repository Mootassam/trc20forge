import { z } from "zod";

/** TRC-20 standard decimals on TRON (same as USDT-TRC20). Editable 0-18; this is the default. */
export const DEFAULT_DECIMALS = "6";
export const MAX_DECIMALS = 18;

/** Upper bound for the human-readable supply (1 quadrillion whole tokens). */
export const MAX_SUPPLY = 10n ** 15n;

/**
 * Symbols of major TRON / stablecoin assets. Tokens that copy these are the
 * classic "fake USDT" scam pattern, so the generator refuses them outright.
 */
const RESERVED_SYMBOLS = new Set([
  "USDT", "USDC", "USDD", "USDJ", "TUSD", "BUSD", "DAI", "PYUSD", "FDUSD", "USDE",
  "TRX", "WTRX", "STRX", "TRON", "BTT", "JST", "SUN", "WIN", "NFT", "HTX",
  "BTC", "WBTC", "BTCT", "ETH", "WETH", "ETHOLD", "BNB", "SOL", "XRP", "TON",
]);

/** Fragments that must never appear in a name or symbol (stablecoin / issuer impersonation). */
const RESERVED_FRAGMENTS = ["TETHER", "USDT", "USDC", "USDCOIN", "CIRCLE", "BINANCE", "TRONLINK", "TRONSCAN", "JUSTLEND", "SUNSWAP"];

/** Fold common look-alike characters so "U5DT" / "USDТ" (Cyrillic) are caught too. */
export function normalizeForReservedCheck(input: string): string {
  const folded = input
    .normalize("NFKD")
    .toUpperCase()
    .replace(/[А]/g, "A").replace(/[В]/g, "B").replace(/[Е]/g, "E")
    .replace(/[К]/g, "K").replace(/[М]/g, "M").replace(/[Н]/g, "H")
    .replace(/[О]/g, "O").replace(/[Р]/g, "P").replace(/[С]/g, "C")
    .replace(/[Т]/g, "T").replace(/[Х]/g, "X");
  return folded
    .replace(/0/g, "O").replace(/1/g, "I").replace(/5/g, "S").replace(/\$/g, "S")
    .replace(/[^A-Z]/g, "");
}

export function reservedReason(name: string, symbol: string): { field: "name" | "symbol"; message: string } | null {
  const n = normalizeForReservedCheck(name);
  const s = normalizeForReservedCheck(symbol);
  const usd = "Names or symbols containing \"USD\" imply a dollar-pegged stablecoin. This token has no guaranteed value, so that is not allowed.";
  if (RESERVED_SYMBOLS.has(s)) return { field: "symbol", message: `"${symbol}" is the symbol of an existing major asset. Pick an original symbol.` };
  if (s.includes("USD")) return { field: "symbol", message: usd };
  for (const f of RESERVED_FRAGMENTS) if (s.includes(f)) return { field: "symbol", message: `"${f}" refers to an existing asset or company. Pick an original symbol.` };
  if (RESERVED_SYMBOLS.has(n)) return { field: "name", message: `"${name}" is the name of an existing major asset. Pick an original name.` };
  if (n.includes("USD")) return { field: "name", message: usd };
  for (const f of RESERVED_FRAGMENTS) if (n.includes(f)) return { field: "name", message: `"${f}" refers to an existing asset or company. Pick an original name.` };
  return null;
}

/**
 * Character sets are deliberately strict: the values are written into Solidity
 * source, so nothing that could escape a string literal or comment is allowed.
 */
export const tokenConfigSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters.")
      .max(40, "Name must be at most 40 characters.")
      .regex(/^[A-Za-z0-9][A-Za-z0-9 .\-]*[A-Za-z0-9.]$/, "Use letters, numbers, spaces, dots and hyphens only (start and end with a letter or number).")
      .refine((v) => !/\s{2,}/.test(v), "Avoid double spaces."),
    symbol: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9]{1,9}$/, "2–10 characters: uppercase letters and digits, starting with a letter."),
    supply: z
      .string()
      .trim()
      .regex(/^[1-9][0-9]*$/, "Whole number without separators, greater than 0.")
      .refine((v) => !/^[0-9]+$/.test(v) || (v.length <= 16 && BigInt(v) <= MAX_SUPPLY), "Maximum supply is 1,000,000,000,000,000."),
    decimals: z
      .string()
      .trim()
      .regex(/^(?:[0-9]|1[0-8])$/, "Decimals must be a whole number from 0 to 18."),
    features: z
      .object({ burn: z.boolean(), batch: z.boolean(), erc165: z.boolean(), timed: z.boolean() })
      .partial()
      .optional(),
  })
  .superRefine((cfg, ctx) => {
    const r = reservedReason(cfg.name, cfg.symbol);
    if (r) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [r.field], message: r.message });
  });

export type TokenConfig = z.infer<typeof tokenConfigSchema>;

/** Optional, owner-free extensions. None of them can create tokens or touch other people's balances. */
export type Features = { burn: boolean; batch: boolean; erc165: boolean; timed: boolean };
export const NO_FEATURES: Features = { burn: false, batch: false, erc165: false, timed: false };
export const featuresOf = (cfg: Pick<TokenConfig, "features">): Features => ({ ...NO_FEATURES, ...cfg.features });

/** Upper bound on recipients per batchTransfer call (keeps a single call far below block energy limits). */
export const MAX_BATCH = 200;

/** Allowed claim window for timed sends: 1 minute to 365 days (seconds). */
export const MIN_TIMED_SECONDS = 60;
export const MAX_TIMED_SECONDS = 365 * 24 * 60 * 60;

export type FieldErrors = Partial<Record<keyof TokenConfig, string>>;

export function validateConfig(input: unknown):
  | { ok: true; config: TokenConfig }
  | { ok: false; errors: FieldErrors } {
  const r = tokenConfigSchema.safeParse(input);
  if (r.success) return { ok: true, config: r.data };
  const errors: FieldErrors = {};
  for (const issue of r.error.issues) {
    const key = issue.path[0] as keyof TokenConfig;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

/** 1234567 -> "1,234,567" without locale surprises. */
export function groupDigits(v: string | bigint | number): string {
  const s = typeof v === "number" ? Math.round(v).toString() : v.toString();
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Raw on-chain units (supply × 10^decimals). */
export function rawSupply(supply: string, decimals: string | number): bigint {
  return BigInt(supply) * 10n ** BigInt(decimals);
}
