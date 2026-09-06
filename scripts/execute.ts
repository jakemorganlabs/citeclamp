// Purpose: the executor CLI. Read a sealed response, then run its first ProposedAction through the permit gate.
// Flow:
// 1. Read a seal outcome (or a bare sealed response) from argv and take the first ProposedAction.
// 2. Run the executor once with no permit. Expect the NO_PERMIT refusal.
// 3. Mint one permit bound to the action. Run once. Expect a receipt.
// 4. Run once more with the same permit. Expect the PERMIT_SPENT refusal.
// 5. Print the three outcomes as one JSON document. Exit 0 only when all three land as expected.
// The sealer and the generator hold no mint function. This CLI stands in for the permit authority.
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { execute, type ExecuteResult } from "../src/executor.js";
import { makePermitAuthority } from "../src/permit.js";
import type { ProposedAction } from "../src/types.js";

interface ExecutorRun {
  step: "without_permit" | "with_permit" | "replay_same_permit";
  permit_present: boolean;
  result: ExecuteResult;
}

function firstAction(input: unknown): ProposedAction {
  // Accept the seal() outcome as printed by `npm run seal`, or the bare sealed response.
  const outcome = input as { sealed?: unknown; response?: unknown; proposed_actions?: unknown };
  if (outcome.sealed === false) {
    throw new Error("the outcome is a veto; nothing to execute");
  }
  const body = (outcome.response ?? outcome) as { proposed_actions?: unknown };
  const actions = body.proposed_actions;
  if (!Array.isArray(actions) || actions.length === 0) {
    throw new Error("the sealed response carries no proposed_actions");
  }
  const action = actions[0] as ProposedAction;
  if (action.requires_permit !== true || typeof action.action_id !== "string") {
    throw new Error("the first proposed action is not a ProposedAction");
  }
  return action;
}

async function main(): Promise<number> {
  const [sealedPath] = process.argv.slice(2);
  if (sealedPath === undefined) {
    process.stderr.write("usage: npm run execute -- <sealed_response.json>\n");
    return 1;
  }

  let action: ProposedAction;
  try {
    action = firstAction(JSON.parse(await readFile(sealedPath, "utf8")));
  } catch (err) {
    process.stderr.write(`read error: ${(err as Error).message}\n`);
    return 1;
  }

  // The permit authority holds its own secret. The draft never sees it.
  const authority = makePermitAuthority(process.env.PERMIT_SECRET ?? randomBytes(32).toString("hex"));
  const runs: ExecutorRun[] = [];

  runs.push({ step: "without_permit", permit_present: false, result: execute(action, "", authority) });

  const permit = authority.mint(action.action_id);
  runs.push({ step: "with_permit", permit_present: true, result: execute(action, permit.token, authority) });
  runs.push({ step: "replay_same_permit", permit_present: true, result: execute(action, permit.token, authority) });

  const expected =
    runs[0]?.result.ran === false &&
    runs[0].result.reason === "NO_PERMIT" &&
    runs[1]?.result.ran === true &&
    runs[2]?.result.ran === false &&
    runs[2].result.reason === "PERMIT_SPENT";

  process.stdout.write(`${JSON.stringify({ action, runs, permit_lifecycle_ok: expected }, null, 2)}\n`);
  return expected ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`fatal: ${(err as Error).message}\n`);
    process.exit(1);
  },
);
