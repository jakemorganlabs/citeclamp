import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { signHmac, verifyHmac, type AuthConfig } from "../src/auth.js";

const CONFIG: AuthConfig = { skewSeconds: 300 };
const SECRET = "test-secret";
const BODY = JSON.stringify({ sentences: [], tool_calls: [] });

// A fresh unix seconds string for the current wall clock.
function freshTimestamp(): string {
  return String(Math.floor(Date.now() / 1000));
}

describe("verifyHmac examples", () => {
  it("accepts a signature from signHmac with a fresh timestamp", () => {
    const timestamp = freshTimestamp();
    const signature = signHmac(timestamp, BODY, SECRET);
    const result = verifyHmac(timestamp, BODY, signature, SECRET, CONFIG);
    expect(result).toEqual({ ok: true });
  });

  it("returns missing when the signature header is absent", () => {
    const result = verifyHmac(freshTimestamp(), BODY, "", SECRET, CONFIG);
    expect(result).toEqual({ ok: false, reason: "missing" });
  });

  it("returns bad_signature for a signature over a different body", () => {
    const timestamp = freshTimestamp();
    const signature = signHmac(timestamp, BODY, SECRET);
    const result = verifyHmac(timestamp, `${BODY}extra`, signature, SECRET, CONFIG);
    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("returns stale for a timestamp one hour old with a 300 s window", () => {
    const timestamp = String(Math.floor(Date.now() / 1000) - 3600);
    const signature = signHmac(timestamp, BODY, SECRET);
    const result = verifyHmac(timestamp, BODY, signature, SECRET, CONFIG);
    expect(result).toEqual({ ok: false, reason: "stale" });
  });
});

describe("verifyHmac properties", () => {
  it("accepts every body with a fresh timestamp signed under the key", () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 0, max: 300 }), (body, offset) => {
        const timestamp = String(Math.floor(Date.now() / 1000) - offset);
        const signature = signHmac(timestamp, body, SECRET);
        const result = verifyHmac(timestamp, body, signature, SECRET, CONFIG);
        expect(result).toEqual({ ok: true });
      }),
    );
  });

  it("rejects every body signed under a wrong key", () => {
    fc.assert(
      fc.property(fc.string(), (body) => {
        const timestamp = freshTimestamp();
        const signature = signHmac(timestamp, body, `${SECRET}-other`);
        const result = verifyHmac(timestamp, body, signature, SECRET, CONFIG);
        expect(result).toEqual({ ok: false, reason: "bad_signature" });
      }),
    );
  });

  it("rejects every timestamp older than the window", () => {
    fc.assert(
      fc.property(fc.integer({ min: 301, max: 10_000_000 }), fc.string(), (age, body) => {
        const timestamp = String(Math.floor(Date.now() / 1000) - age);
        const signature = signHmac(timestamp, body, SECRET);
        const result = verifyHmac(timestamp, body, signature, SECRET, CONFIG);
        expect(result).toEqual({ ok: false, reason: "stale" });
      }),
    );
  });
});

describe("verifyHmac contract guards", () => {
  it("throws on a non-unix-seconds timestamp", () => {
    const signature = signHmac(freshTimestamp(), BODY, SECRET);
    expect(() => verifyHmac("not-a-time", BODY, signature, SECRET, CONFIG)).toThrow(TypeError);
  });

  it("throws on an empty secret", () => {
    const timestamp = freshTimestamp();
    const signature = signHmac(timestamp, BODY, SECRET);
    expect(() => verifyHmac(timestamp, BODY, signature, "", CONFIG)).toThrow(TypeError);
  });
});

describe("signHmac contract", () => {
  it("returns a 64 character hex tag", () => {
    expect(signHmac(freshTimestamp(), BODY, SECRET)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for the same inputs", () => {
    const timestamp = freshTimestamp();
    expect(signHmac(timestamp, BODY, SECRET)).toBe(signHmac(timestamp, BODY, SECRET));
  });
});
