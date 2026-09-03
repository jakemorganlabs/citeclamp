// Purpose: canonical JSON stringify and sha256 hex digest.
// Flow:
// 1. Walk the value and sort object keys at every depth.
// 2. Serialize with JSON.stringify so the byte output is stable.
// 3. Hash the canonical string with the Node crypto module.
import { createHash } from "node:crypto";

function assertJsonSerializable(value: unknown): void {
  if (value === undefined) {
    throw new TypeError("canonicalStringify requires a JSON-serializable value; got undefined");
  }
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    throw new TypeError(`canonicalStringify requires a JSON-serializable value; got ${typeof value}`);
  }
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const child = record[key];
    if (child === undefined) {
      throw new TypeError(`canonicalStringify requires a JSON-serializable value; key "${key}" is undefined`);
    }
    out[key] = sortKeys(child);
  }
  return out;
}

export function canonicalStringify(value: unknown): string {
  assertJsonSerializable(value);
  return JSON.stringify(sortKeys(value));
}

export function sha256Hex(input: string): string {
  if (typeof input !== "string") {
    throw new TypeError(`sha256Hex requires a string; got ${typeof input}`);
  }
  return createHash("sha256").update(input, "utf8").digest("hex");
}
