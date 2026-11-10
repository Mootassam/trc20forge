import { NextResponse } from "next/server";
import { z } from "zod";
import { NETWORKS, TRON_ADDRESS, ZERO_ADDRESS_BASE58, type NetworkId } from "@/lib/tron/networks";
import {
  approximateDeployEnergy, computeCost, deployTxBytes,
  DEFAULT_BANDWIDTH_FEE_SUN, DEFAULT_ENERGY_FEE_SUN, DEFAULT_MAX_FEE_LIMIT_SUN,
} from "@/lib/tron/cost";

export const dynamic = "force-dynamic";

const FEE_TTL_MS = 5 * 60_000;
const feeCache = new Map<NetworkId, { at: number; energyFeeSun: number; bandwidthFeeSun: number; maxFeeLimitSun: number }>();

const bodySchema = z.object({
  network: z.enum(["mainnet", "nile", "shasta"]),
  bytecode: z.string().regex(/^[0-9a-fA-F]+$/).max(200_000).refine((v) => v.length % 2 === 0),
  runtimeBytes: z.number().int().positive().max(100_000),
  abi: z.array(z.object({ type: z.string(), name: z.string().optional() }).passthrough()).max(200),
  contractName: z.string().max(64),
  owner: z.string().regex(TRON_ADDRESS).optional(),
});

async function tron<T>(network: NetworkId, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.TRONGRID_API_KEY) headers["TRON-PRO-API-KEY"] = process.env.TRONGRID_API_KEY;
  let lastErr: unknown;
  // TronGrid rate-limits keyless clients; retry 429 / 5xx / network errors with backoff.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    try {
      const res = await fetch(NETWORKS[network].api + path, {
        method: "POST",
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      if (res.ok) return (await res.json()) as T;
      lastErr = new Error(`TronGrid ${path} -> HTTP ${res.status}`);
      if (res.status !== 429 && res.status < 500) break;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ error: "Invalid estimate request." }, { status: 400 });
  const { network, bytecode, runtimeBytes, abi, contractName, owner } = parsed.data;

  const notes: string[] = [];

  // 1) Live fee parameters (cached per network; they change only via governance proposals)
  let fees = feeCache.get(network);
  if (!fees || Date.now() - fees.at > FEE_TTL_MS) {
    try {
      const p = await tron<{ chainParameter: { key: string; value?: number }[] }>(network, "/wallet/getchainparameters");
      const get = (k: string) => p.chainParameter.find((x) => x.key === k)?.value;
      fees = {
        at: Date.now(),
        energyFeeSun: get("getEnergyFee") ?? DEFAULT_ENERGY_FEE_SUN,
        bandwidthFeeSun: get("getTransactionFee") ?? DEFAULT_BANDWIDTH_FEE_SUN,
        maxFeeLimitSun: get("getMaxFeeLimit") ?? DEFAULT_MAX_FEE_LIMIT_SUN,
      };
      feeCache.set(network, fees);
    } catch {
      notes.push("Could not read live fee parameters; using network defaults.");
    }
  }
  const { energyFeeSun, bandwidthFeeSun, maxFeeLimitSun } = fees ?? {
    energyFeeSun: DEFAULT_ENERGY_FEE_SUN, bandwidthFeeSun: DEFAULT_BANDWIDTH_FEE_SUN, maxFeeLimitSun: DEFAULT_MAX_FEE_LIMIT_SUN,
  };

  // 2) Simulate the deployment on the node to get exact energy
  let energy = approximateDeployEnergy(runtimeBytes);
  let energySource: "simulated" | "approximate" = "approximate";
  try {
    const sim = await tron<{ energy_used?: number; result?: { result?: boolean; message?: string } }>(
      network, "/wallet/triggerconstantcontract",
      { owner_address: owner ?? ZERO_ADDRESS_BASE58, data: bytecode, visible: true },
    );
    if (sim.result?.result && typeof sim.energy_used === "number" && sim.energy_used > 0) {
      energy = sim.energy_used;
      energySource = "simulated";
    } else notes.push("Node simulation was rejected; showing an approximation.");
  } catch {
    notes.push("Node simulation unavailable; showing an approximation.");
  }

  // Wallet balance / resources are read in the browser through TronLink's own node (see lib/tron/tronlink.ts).

  const bandwidthBytes = deployTxBytes(bytecode.length / 2, abi as never, contractName.length);
  const estimate = computeCost({ energy, energySource, energyFeeSun, bandwidthFeeSun, maxFeeLimitSun, bandwidthBytes, account: null });
  return NextResponse.json({ network, estimate, notes });
}
