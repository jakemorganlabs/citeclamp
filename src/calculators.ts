// Purpose: the calculator registry and the canonical input hash.
// Flow:
// 1. Build the registry from a plain object of pure functions.
// 2. Guard run with has. Fail loud on a missing calculator.
// 3. Hash inputs with canonicalStringify, so key order never changes the hash.
import { canonicalStringify, sha256Hex } from "./hash.js";

export type Calculator = (inputs: Record<string, string>) => string;

export interface CalculatorRegistry {
  has(name: string): boolean;
  run(name: string, inputs: Record<string, string>): string;
  inputHash(inputs: Record<string, string>): string;
}

function assertCalculatorShape(name: string, fn: Calculator): void {
  if (typeof name !== "string" || name.length === 0) {
    throw new TypeError(`calculator registry requires a non-empty name; got ${String(name)}`);
  }
  if (typeof fn !== "function") {
    throw new TypeError(`calculator registry requires a function for "${name}"; got ${typeof fn}`);
  }
}

export function makeRegistry(fns: Record<string, Calculator>): CalculatorRegistry {
  const table = new Map<string, Calculator>();
  for (const [name, fn] of Object.entries(fns)) {
    assertCalculatorShape(name, fn);
    table.set(name, fn);
  }
  return {
    has(name: string): boolean {
      return table.has(name);
    },
    run(name: string, inputs: Record<string, string>): string {
      const fn = table.get(name);
      if (fn === undefined) {
        throw new Error(`calculator not registered: "${name}"`);
      }
      return fn(inputs);
    },
    inputHash(inputs: Record<string, string>): string {
      return sha256Hex(canonicalStringify(inputs));
    },
  };
}
