// Purpose: dummy side-effect tool for the executor.
// Flow:
// 1. Accept an action_id and args.
// 2. Return a receipt with the action_id and a synthetic message_id.
// No network call runs in v1. A real transport is out of scope.
import { sha256Hex } from "../hash.js";

export interface EmailReceipt {
  action_id: string;
  message_id: string;
  status: "sent";
}

export function sendEmail(
  action_id: string,
  args: Record<string, unknown>,
): EmailReceipt {
  const message_id = sha256Hex(`msg-${action_id}-${JSON.stringify(args)}`);
  return {
    action_id,
    message_id,
    status: "sent",
  };
}
