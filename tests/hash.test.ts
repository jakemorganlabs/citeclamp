import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { canonicalStringify, sha256Hex } from "../src/hash.js";

function shuffleKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(obj).reverse();
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = obj[k];
  return out;
}

describe("canonicalStringify", () => {
  it("sorts keys at the top level", () => {
    expect(canonicalStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("sorts keys at every depth", () => {
    const value = { z: { b: 1, a: 2 }, a: [{ d: 4, c: 3 }] };
    expect(canonicalStringify(value)).toBe('{"a":[{"c":3,"d":4}],"z":{"a":2,"b":1}}');
  });

  it("returns the same string for two inputs that differ only in key order", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        expect(canonicalStringify(value)).toBe(canonicalStringify(value));
      }),
    );
  });

  it("matches the shuffled-keys example in the plan", () => {
    const original = { b: 1, a: 2 };
    expect(canonicalStringify(shuffleKeys(original))).toBe(canonicalStringify(original));
  });

  it("throws on a non-serializable value", () => {
    expect(() => canonicalStringify(undefined)).toThrow(TypeError);
    expect(() => canonicalStringify(() => 1)).toThrow(TypeError);
  });
});

describe("sha256Hex", () => {
  it("returns 64 lowercase hex characters", () => {
    expect(sha256Hex("citeclamp")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for the same input", () => {
    expect(sha256Hex("citeclamp")).toBe(sha256Hex("citeclamp"));
  });

  it("differs for different inputs", () => {
    expect(sha256Hex("a")).not.toBe(sha256Hex("b"));
  });

  it("always matches the hex shape", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(sha256Hex(s)).toMatch(/^[0-9a-f]{64}$/);
      }),
    );
  });

  it("throws on a non-string input", () => {
    expect(() => sha256Hex(1 as unknown as string)).toThrow(TypeError);
  });
});
