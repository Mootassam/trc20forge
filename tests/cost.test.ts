import { describe, expect, it } from "vitest";
import { computeCost, SUN_PER_TRX } from "@/lib/tron/cost";
import { networkFromHost } from "@/lib/tron/networks";
import { generateReadme } from "@/lib/token/readme";
import { DISCLAIMER } from "@/lib/token/generate";

const base = { energy: 442_124, energySource: "simulated" as const, energyFeeSun: 100, bandwidthFeeSun: 1000, maxFeeLimitSun: 15_000 * SUN_PER_TRX, bandwidthBytes: 4000, account: null };

describe("cost model", () => {
  it("prices energy and bandwidth in TRX (worst case)", () => {
    const c = computeCost(base);
    expect(c.energyTrx).toBe(44.22); // 442,124 × 100 sun, rounded up to the cent
    expect(c.bandwidthTrx).toBe(4);
    expect(c.totalTrx).toBe(48.22);
    expect(c.walletTrx).toBeNull();
  });

  it("sets a fee limit with headroom, min 100 TRX, capped by the network max", () => {
    expect(computeCost(base).feeLimitSun).toBe(100 * SUN_PER_TRX); // 44 × 1.3 = 57 → min 100
    expect(computeCost({ ...base, energyFeeSun: 420 }).feeLimitSun).toBe(250 * SUN_PER_TRX); // 185.7 × 1.3 = 241 → 250
    expect(computeCost({ ...base, energy: 1e12 }).feeLimitSun).toBe(15_000 * SUN_PER_TRX);
  });

  it("accounts for the wallet's own energy and all-or-nothing bandwidth", () => {
    const acct = { balanceSun: 0, activated: true, energyAvailable: 500_000, bandwidthAvailable: 600 };
    expect(computeCost({ ...base, account: acct }).walletTrx).toBe(4); // energy covered, bandwidth 600 < 4000 → burned
    expect(computeCost({ ...base, account: { ...acct, energyAvailable: 0, bandwidthAvailable: 5000 } }).walletTrx).toBe(44.22);
  });
});

describe("networks", () => {
  it("detects TronLink nodes", () => {
    expect(networkFromHost("https://api.trongrid.io")).toBe("mainnet");
    expect(networkFromHost("https://nile.trongrid.io")).toBe("nile");
    expect(networkFromHost("https://api.shasta.trongrid.io")).toBe("shasta");
    expect(networkFromHost("http://127.0.0.1:9090")).toBeNull();
  });
});

describe("README", () => {
  it("covers deploy, cost and verification with exact settings", () => {
    const md = generateReadme({ name: "Bama Coin", symbol: "BAMA", supply: "1000000000", decimals: "6" });
    expect(md).toContain(DISCLAIMER);
    for (const s of ["TronLink", "Tronscan", "Estimated deployment cost in TRX", "Verify the source code", "BAMAToken", "0.8.20", "**200**", "1,000,000,000 BAMA"]) {
      expect(md).toContain(s);
    }
  });
});
