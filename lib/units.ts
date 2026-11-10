/** Exact decimal <-> integer unit conversion for token amounts (no floating point). */

export class AmountError extends Error {}

/** "12.5" with 6 decimals -> 12500000n. Rejects negatives, exponents, separators and excess precision. */
export function parseUnits(input: string, decimals: number): bigint {
  const v = input.trim();
  if (!/^\d+(\.\d+)?$/.test(v)) throw new AmountError("Enter a number like 10 or 2.5 (no commas, no minus sign).");
  const [whole, frac = ""] = v.split(".");
  if (frac.length > decimals) {
    throw new AmountError(decimals === 0 ? "This token has 0 decimals: whole numbers only." : `This token allows at most ${decimals} decimal places.`);
  }
  const raw = BigInt(whole) * 10n ** BigInt(decimals) + BigInt((frac + "0".repeat(decimals)).slice(0, decimals) || "0");
  if (raw === 0n) throw new AmountError("Amount must be greater than 0.");
  return raw;
}

/** 12500000n with 6 decimals -> "12.5"; groups thousands in the whole part. */
export function formatUnits(raw: bigint, decimals: number, group = true): string {
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = (abs / base).toString();
  const frac = decimals ? (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "") : "";
  const w = group ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : whole;
  return `${neg ? "-" : ""}${w}${frac ? "." + frac : ""}`;
}
