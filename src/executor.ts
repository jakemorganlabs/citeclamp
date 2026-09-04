// Purpose: second process that runs a ProposedAction only against a valid one-time permit.
// Flow:
// 1. Accept a ProposedAction, a permit token, and a PermitAuthority.
// 2. Look up the token. An unknown token refuses with NO_PERMIT.
// 3. A burned token refuses with PERMIT_SPENT.
// 4. A valid token bound to a different action refuses with PERMIT_MISMATCH.
// 5. On a valid matching permit, run the tool, burn the permit, and return the receipt.
// The executor holds no mint function. The sealer and the executor share no mint authority.
import type { PermitAuthority } from "./permit.js";
import { sendEmail } from "./tools/send_email.js";
import type { EmailReceipt } from "./tools/send_email.js";
import type { ProposedAction } from "./types.js";

export type ExecuteResult =
  | { ran: true; receipt: EmailReceipt }
  | { ran: false; reason: "NO_PERMIT" | "PERMIT_SPENT" | "PERMIT_MISMATCH" };

export function execute(
  action: ProposedAction,
  token: string,
  authority: PermitAuthority,
): ExecuteResult {
  if (typeof token !== "string" || token.length === 0) {
    return { ran: false, reason: "NO_PERMIT" };
  }

  const info = authority.lookup(token);

  if (info.state === "unknown") {
    return { ran: false, reason: "NO_PERMIT" };
  }

  if (info.state === "burned") {
    return { ran: false, reason: "PERMIT_SPENT" };
  }

  if (info.action_id !== action.action_id) {
    return { ran: false, reason: "PERMIT_MISMATCH" };
  }

  const receipt = sendEmail(action.action_id, action.args);
  authority.burn(token);
  return { ran: true, receipt };
}
