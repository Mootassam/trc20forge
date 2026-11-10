import { describe, expect, it } from "vitest";
import { tokenize, tokenLines } from "@/lib/highlight";
import { generateContract } from "@/lib/token/generate";

describe("highlighter", () => {
  const src = generateContract({ name: "Bama Coin", symbol: "BAMA", supply: "1000000", decimals: "6" });
  it("round-trips the source exactly and quickly", () => {
    const t = performance.now();
    const toks = tokenize(src);
    expect(performance.now() - t).toBeLessThan(200);
    expect(toks.map((x) => x.v).join("")).toBe(src);
    expect(tokenLines(src).length).toBe(src.split("\n").length);
  });
  it("classifies tokens", () => {
    const toks = tokenize('function f(address a) { // hi\n return "x"; }');
    expect(toks.find((x) => x.v === "function")?.t).toBe("keyword");
    expect(toks.find((x) => x.v === "address")?.t).toBe("type");
    expect(toks.find((x) => x.v === "f")?.t).toBe("fn");
    expect(toks.find((x) => x.v === "// hi")?.t).toBe("comment");
    expect(toks.find((x) => x.v === '"x"')?.t).toBe("string");
  });
  it("survives pathological input", () => {
    const evil = '"'.repeat(5000) + "/*".repeat(5000) + "a".repeat(20000);
    const t = performance.now();
    expect(tokenize(evil).map((x) => x.v).join("")).toBe(evil);
    expect(performance.now() - t).toBeLessThan(1000);
  });
});
