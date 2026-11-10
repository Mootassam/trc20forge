import type { AbiItem } from "../token/compile";

export const SUN_PER_TRX = 1_000_000;

/** Network defaults (Nov 2026). Replaced by live chain parameters whenever TronGrid is reachable. */
export const DEFAULT_ENERGY_FEE_SUN = 100;
export const DEFAULT_BANDWIDTH_FEE_SUN = 1000;
export const DEFAULT_MAX_FEE_LIMIT_SUN = 15_000 * SUN_PER_TRX;
export const FREE_DAILY_BANDWIDTH = 600;

/** Energy we let callers of the token draw from the deployer: none, users pay their own (userFeePercentage = 100). */
export const ORIGIN_ENERGY_LIMIT = 10_000_000;

export type AccountResources = {
  balanceSun: number;
  energyAvailable: number;
  bandwidthAvailable: number;
  activated: boolean;
};

export type CostEstimate = {
  energy: number;
  energySource: "simulated" | "approximate";
  energyFeeSun: number;
  bandwidthFeeSun: number;
  bandwidthBytes: number;
  /** Worst case: no staked resources, everything burned as TRX. */
  energyTrx: number;
  bandwidthTrx: number;
  totalTrx: number;
  /** What this specific wallet will likely pay after its own energy / bandwidth. */
  walletTrx: number | null;
  feeLimitSun: number;
  account: AccountResources | null;
};

/** Heuristic used only if the node simulation is unavailable: 200 energy per stored byte + constructor work. */
export function approximateDeployEnergy(runtimeBytes: number): number {
  return runtimeBytes * 200 + 32_000;
}

/** Rough protobuf size of the ABI TRON stores inside the CreateSmartContract transaction. */
export function abiWireBytes(abi: AbiItem[]): number {
  let n = 0;
  for (const e of abi) {
    n += 8 + (e.name?.length ?? 0) + (e.stateMutability?.length ? 2 : 0);
    for (const p of [...(e.inputs ?? []), ...(e.outputs ?? [])]) n += 8 + p.name.length + p.type.length;
  }
  return n;
}

/** Bytes billed as bandwidth: raw tx + signature + result buffer, per java-tron's accounting. */
export function deployTxBytes(initBytes: number, abi: AbiItem[], nameLength: number): number {
  return initBytes + abiWireBytes(abi) + nameLength + 220 + 65 + 64;
}

const round2 = (v: number) => Math.ceil(v * 100) / 100;

export function computeCost(input: {
  energy: number;
  energySource: CostEstimate["energySource"];
  energyFeeSun: number;
  bandwidthFeeSun: number;
  maxFeeLimitSun: number;
  bandwidthBytes: number;
  account: AccountResources | null;
}): CostEstimate {
  const { energy, energyFeeSun, bandwidthFeeSun, bandwidthBytes, account } = input;
  const energySun = energy * energyFeeSun;
  const bandwidthSun = bandwidthBytes * bandwidthFeeSun;

  // Fee limit caps TRX burned for energy only. 30% headroom over the simulation, rounded up to 10 TRX, min 100 TRX.
  const step = 10 * SUN_PER_TRX;
  const feeLimitSun = Math.min(
    input.maxFeeLimitSun,
    Math.max(100 * SUN_PER_TRX, Math.ceil((energySun * 1.3) / step) * step),
  );

  const base: CostEstimate = {
    energy,
    energySource: input.energySource,
    energyFeeSun,
    bandwidthFeeSun,
    bandwidthBytes,
    energyTrx: round2(energySun / SUN_PER_TRX),
    bandwidthTrx: round2(bandwidthSun / SUN_PER_TRX),
    totalTrx: round2((energySun + bandwidthSun) / SUN_PER_TRX),
    walletTrx: null,
    feeLimitSun,
    account: null,
  };
  return account ? withAccount(base, account) : base;
}

/** Adds what this specific wallet would pay, after its own staked/free energy and bandwidth. */
export function withAccount(e: CostEstimate, account: AccountResources): CostEstimate {
  const energyShort = Math.max(0, e.energy - account.energyAvailable);
  // Bandwidth is all-or-nothing: if staked + free bandwidth can't cover the whole tx, the whole tx is burned.
  const bwSun = account.bandwidthAvailable >= e.bandwidthBytes ? 0 : e.bandwidthBytes * e.bandwidthFeeSun;
  return { ...e, account, walletTrx: round2((energyShort * e.energyFeeSun + bwSun) / SUN_PER_TRX) };
}
