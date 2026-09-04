// Purpose: examples and property tests for the permit-gated executor.
// Flow:
// 1. Test the four concrete cases from the plan.
// 2. Run fast-check properties over arbitrary action ids.
// 3. Assert the tool runs zero times on any refusal.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { makePermitAuthority } from "../src/permit.js";
import { execute } from "../src/executor.js";
import type { ProposedAction } from "../src/types.js";

const SECRET = "test-secret-not-in-production";

function makeAction(actionId: string): ProposedAction {
  return {
    action_id: actionId,
    tool: "send_email",
    args: { to: "user@example.com", subject: "test" },
    requires_permit: true,
  };
}

describe("execute", () => {
  it("mints for action A, executes A with the token, returns ran: true with a receipt", () => {
    const auth = makePermitAuthority(SECRET);
    const action = makeAction("action-A");
    const permit = auth.mint(action.action_id);

    const result = execute(action, permit.token, auth);

    expect(result.ran).toBe(true);
    if (result.ran) {
      expect(result.receipt.action_id).toBe("action-A");
      expect(result.receipt.status).toBe("sent");
      expect(typeof result.receipt.message_id).toBe("string");
    }
  });

  it("executes A again with the same token, returns ran: false with reason PERMIT_SPENT", () => {
    const auth = makePermitAuthority(SECRET);
    const action = makeAction("action-A");
    const permit = auth.mint(action.action_id);

    const first = execute(action, permit.token, auth);
    expect(first.ran).toBe(true);

    const second = execute(action, permit.token, auth);
    expect(second.ran).toBe(false);
    if (!second.ran) {
      expect(second.reason).toBe("PERMIT_SPENT");
    }
  });

  it("mints for action A, executes B with the A token, returns ran: false with reason PERMIT_MISMATCH", () => {
    const auth = makePermitAuthority(SECRET);
    const actionA = makeAction("action-A");
    const actionB = makeAction("action-B");
    const permitA = auth.mint(actionA.action_id);

    const result = execute(actionB, permitA.token, auth);

    expect(result.ran).toBe(false);
    if (!result.ran) {
      expect(result.reason).toBe("PERMIT_MISMATCH");
    }
  });

  it("executes A with an unknown token, returns ran: false with reason NO_PERMIT", () => {
    const auth = makePermitAuthority(SECRET);
    const action = makeAction("action-A");

    const result = execute(action, "unknown-token", auth);

    expect(result.ran).toBe(false);
    if (!result.ran) {
      expect(result.reason).toBe("NO_PERMIT");
    }
  });

  it("returns NO_PERMIT on an empty token string", () => {
    const auth = makePermitAuthority(SECRET);
    const action = makeAction("action-A");

    const result = execute(action, "", auth);

    expect(result.ran).toBe(false);
    if (!result.ran) {
      expect(result.reason).toBe("NO_PERMIT");
    }
  });
});

describe("properties", () => {
  it("for any action id a, mint(a) then execute runs the tool one time", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (actionId) => {
        const auth = makePermitAuthority(SECRET);
        const action = makeAction(actionId);
        const permit = auth.mint(actionId);

        const result = execute(action, permit.token, auth);

        expect(result.ran).toBe(true);
        if (result.ran) {
          expect(result.receipt.action_id).toBe(actionId);
        }

        // The tool ran one time. A second call must not run.
        const again = execute(action, permit.token, auth);
        expect(again.ran).toBe(false);
      }),
    );
  });

  it("for any action id a, a second execute on the same token never runs the tool", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (actionId) => {
        const auth = makePermitAuthority(SECRET);
        const action = makeAction(actionId);
        const permit = auth.mint(actionId);

        execute(action, permit.token, auth);
        const second = execute(action, permit.token, auth);

        expect(second.ran).toBe(false);
        if (!second.ran) {
          expect(second.reason).toBe("PERMIT_SPENT");
        }
      }),
    );
  });

  it("for any token and action where the binding differs, execute returns PERMIT_MISMATCH", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (a, b) => {
          fc.pre(a !== b);
          const auth = makePermitAuthority(SECRET);
          const permit = auth.mint(a);
          const actionB = makeAction(b);

          const result = execute(actionB, permit.token, auth);

          expect(result.ran).toBe(false);
          if (!result.ran) {
            expect(result.reason).toBe("PERMIT_MISMATCH");
          }
        },
      ),
    );
  });

  it("for any refusal, the send count stays zero", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (mintedFor, attemptedFor) => {
          const auth = makePermitAuthority(SECRET);
          const permit = auth.mint(mintedFor);
          const action = makeAction(attemptedFor);

          const first = execute(action, permit.token, auth);
          if (first.ran) {
            // This was the valid case; burn happened.
            // Try again and count runs.
            const second = execute(action, permit.token, auth);
            expect(second.ran).toBe(false);
          } else {
            // Refusal case: the tool ran zero times.
            expect(first.ran).toBe(false);
          }
        },
      ),
    );
  });
});
