import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { makeRegistry, type Calculator } from "../src/calculators.js";

export const sum: Calculator = (inputs) => {
  const a = Number.parseInt(inputs.a ?? "", 10);
  const b = Number.parseInt(inputs.b ?? "", 10);
  return String(a + b);
};

const registry = makeRegistry({ sum });

describe("calculator registry has and run", () => {
  it("has a registered calculator", () => {
    expect(registry.has("sum")).toBe(true);
  });

  it("lacks an unregistered calculator", () => {
    expect(registry.has("unknown")).toBe(false);
  });

  it("runs sum over the example inputs", () => {
    expect(registry.run("sum", { a: "2", b: "3" })).toBe("5");
  });

  it("returns the same output for the same inputs", () => {
    expect(registry.run("sum", { a: "2", b: "3" })).toBe(registry.run("sum", { a: "2", b: "3" }));
  });

  it("throws on a missing calculator", () => {
    expect(() => registry.run("unknown", { a: "1" })).toThrow(/not registered/);
  });
});

describe("calculator registry inputHash", () => {
  it("returns 64 lowercase hex characters", () => {
    expect(registry.inputHash({ a: "2", b: "3" })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable across key order", () => {
    const m = { b: "3", a: "2" };
    const shuffled = { a: "2", b: "3" };
    expect(registry.inputHash(m)).toBe(registry.inputHash(shuffled));
  });

  it("holds the shuffled-keys property for all input maps", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.string()), (m) => {
        const keys = Object.keys(m).reverse();
        const shuffled: Record<string, string> = {};
        for (const k of keys) {
          const v = m[k];
          if (v !== undefined) shuffled[k] = v;
        }
        expect(registry.inputHash(m)).toBe(registry.inputHash(shuffled));
      }),
    );
  });
});

describe("sum calculator", () => {
  it("agrees with String(a + b) for all integer pairs", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        const out = registry.run("sum", { a: String(a), b: String(b) });
        expect(out).toBe(String(a + b));
      }),
    );
  });
});
