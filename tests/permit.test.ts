// Purpose: examples and property tests for the permit authority.
// Flow:
// 1. Test mint, isValid, and burn as separate units.
// 2. Run fast-check properties over arbitrary action_id strings.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { makePermitAuthority } from "../src/permit.js";

const SECRET = "test-secret-not-in-production";

describe("makePermitAuthority", () => {
  it("mints a permit with token, action_id, and issued_at", () => {
    const auth = makePermitAuthority(SECRET);
    const permit = auth.mint("action-1");
    expect(typeof permit.token).toBe("string");
    expect(permit.token.length).toBeGreaterThan(0);
    expect(permit.action_id).toBe("action-1");
    expect(typeof permit.issued_at).toBe("number");
    expect(permit.issued_at).toBeGreaterThan(0);
  });

  it("throws TypeError on empty action_id", () => {
    const auth = makePermitAuthority(SECRET);
    expect(() => auth.mint("")).toThrow(TypeError);
  });

  it("throws TypeError on non-string action_id", () => {
    const auth = makePermitAuthority(SECRET);
    // @ts-expect-error: deliberately test runtime type check
    expect(() => auth.mint(42)).toThrow(TypeError);
  });
});

describe("PermitAuthority.isValid", () => {
  it("returns true for a fresh unburned permit with matching action_id", () => {
    const auth = makePermitAuthority(SECRET);
    const permit = auth.mint("action-1");
    expect(auth.isValid(permit.token, "action-1")).toBe(true);
  });

  it("returns false for an unknown token", () => {
    const auth = makePermitAuthority(SECRET);
    expect(auth.isValid("no-such-token", "action-1")).toBe(false);
  });

  it("returns false when action_id does not match", () => {
    const auth = makePermitAuthority(SECRET);
    const permit = auth.mint("action-1");
    expect(auth.isValid(permit.token, "action-2")).toBe(false);
  });

  it("returns false after burn", () => {
    const auth = makePermitAuthority(SECRET);
    const permit = auth.mint("action-1");
    auth.burn(permit.token);
    expect(auth.isValid(permit.token, "action-1")).toBe(false);
  });
});

describe("PermitAuthority.burn", () => {
  it("marks the token as spent", () => {
    const auth = makePermitAuthority(SECRET);
    const permit = auth.mint("action-1");
    expect(auth.isValid(permit.token, "action-1")).toBe(true);
    auth.burn(permit.token);
    expect(auth.isValid(permit.token, "action-1")).toBe(false);
  });

  it("does not throw on unknown token", () => {
    const auth = makePermitAuthority(SECRET);
    expect(() => auth.burn("unknown-token")).not.toThrow();
  });

  it("burning one token does not affect another", () => {
    const auth = makePermitAuthority(SECRET);
    const p1 = auth.mint("action-1");
    const p2 = auth.mint("action-2");
    auth.burn(p1.token);
    expect(auth.isValid(p1.token, "action-1")).toBe(false);
    expect(auth.isValid(p2.token, "action-2")).toBe(true);
  });
});

describe("properties", () => {
  it("for any action_id, mint produces a valid permit", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (actionId) => {
        const auth = makePermitAuthority(SECRET);
        const permit = auth.mint(actionId);
        expect(auth.isValid(permit.token, actionId)).toBe(true);
        expect(permit.action_id).toBe(actionId);
      }),
    );
  });

  it("for any action_id, a burned permit is never valid", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (actionId) => {
        const auth = makePermitAuthority(SECRET);
        const permit = auth.mint(actionId);
        auth.burn(permit.token);
        expect(auth.isValid(permit.token, actionId)).toBe(false);
      }),
    );
  });

  it("for any two different action_ids, a permit for one is invalid for the other", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (a, b) => {
          fc.pre(a !== b);
          const auth = makePermitAuthority(SECRET);
          const permit = auth.mint(a);
          expect(auth.isValid(permit.token, b)).toBe(false);
        },
      ),
    );
  });

  it("for any token not minted, isValid returns false", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (token, actionId) => {
          const auth = makePermitAuthority(SECRET);
          expect(auth.isValid(token, actionId)).toBe(false);
        },
      ),
    );
  });
});
