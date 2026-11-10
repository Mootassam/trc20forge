// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor, cleanup } from "@testing-library/react";
import { createRequire } from "node:module";
import { WalletProvider } from "@/components/WalletProvider";
import { Forge } from "@/components/Forge";
import { compilerInput, contractName, sourceFileName } from "@/lib/token/generate";
import { parseCompilerOutput } from "@/lib/token/compile";
import { computeCost } from "@/lib/tron/cost";
import type { TokenConfig } from "@/lib/token/schema";

const solc = createRequire(import.meta.url)("solc");

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
// Real compilation with the official solc build in place of the browser worker.
vi.mock("@/lib/token/compiler-client", () => ({
  compileToken: async (cfg: TokenConfig) =>
    parseCompilerOutput(solc.compile(compilerInput(cfg)), sourceFileName(cfg), contractName(cfg), solc.version()),
}));

const estimate = computeCost({ energy: 442_124, energySource: "simulated", energyFeeSun: 100, bandwidthFeeSun: 1000, maxFeeLimitSun: 15e9, bandwidthBytes: 3380, account: null });

beforeEach(() => {
  cleanup();
  localStorage.clear();
  delete (window as { tronLink?: unknown }).tronLink;
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ network: "nile", estimate, notes: [] }), { status: 200 })) as never;
});

async function fillAndGenerate(name = "Bama Coin", symbol = "bama") {
  render(<WalletProvider><Forge /></WalletProvider>);
  fireEvent.change(screen.getByLabelText("Token name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Symbol"), { target: { value: symbol } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /Generate contract/ })));
}

describe("Forge UI", () => {
  it("blocks impersonation with a field-level error and stays on step 1", async () => {
    await fillAndGenerate("Tether Gold", "TGLD");
    expect(screen.getByRole("alert").textContent).toMatch(/TETHER/);
    expect(screen.queryByText("TGLDToken.sol")).toBeNull();
  });

  it("walks token -> contract -> compile -> cost -> deploy", async () => {
    await fillAndGenerate();
    expect(screen.getByText("BAMAToken.sol")).toBeTruthy();
    // The source viewer is code-split (next/dynamic), so wait for its chunk.
    expect((await screen.findAllByText(/NOT affiliated with Tether/, undefined, { timeout: 5000 })).length).toBeGreaterThan(0);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: /^Compile/ })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Compile contract/ })));
    await waitFor(() => expect(screen.getByText("Compiled and audited")).toBeTruthy(), { timeout: 15_000 });
    expect(screen.getByText("transferFrom")).toBeTruthy();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Estimate cost/ })));
    await waitFor(() => expect(screen.getByText("47.6 TRX")).toBeTruthy());
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/estimate", expect.objectContaining({ method: "POST" }));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: /^Deploy/ })));
    const deployBtn = screen.getByRole("button", { name: /Deploy to Nile Testnet/ }) as HTMLButtonElement;
    expect(deployBtn.disabled).toBe(true); // no wallet connected
    // Wallet detection waits briefly for TronLink to inject itself before declaring "no wallet".
    expect((await screen.findAllByText(/Install TronLink/, undefined, { timeout: 4000 })).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("radio", { name: /TRON Mainnet/ }));
    expect(screen.getByText(/spends real TRX/)).toBeTruthy();
  }, 30_000);

  it("invalidates compiled output when the token changes", async () => {
    await fillAndGenerate();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /^Compile/ })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Compile contract/ })));
    await waitFor(() => screen.getByText("Compiled and audited"), { timeout: 15_000 });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Token details/ })));
    fireEvent.change(screen.getByLabelText("Symbol"), { target: { value: "BAMB" } });
    expect((screen.getByRole("button", { name: /Cost/ }) as HTMLButtonElement).disabled).toBe(true);
  }, 30_000);
});

describe("persistence", () => {
  it("keeps the saved token under React StrictMode (effects run twice)", async () => {
    const { StrictMode } = await import("react");
    localStorage.setItem("trc20-forge:form:v1", JSON.stringify({ name: "Saved Coin", symbol: "SAVE", supply: "42", decimals: "2" }));
    await act(async () => {
      render(<StrictMode><WalletProvider><Forge /></WalletProvider></StrictMode>);
    });
    expect((screen.getByLabelText("Token name") as HTMLInputElement).value).toBe("Saved Coin");
    expect((screen.getByLabelText("Symbol") as HTMLInputElement).value).toBe("SAVE");
    const stored = JSON.parse(localStorage.getItem("trc20-forge:form:v1")!);
    expect(stored).toMatchObject({ name: "Saved Coin", symbol: "SAVE", supply: "42", decimals: "2" });
  });
});
