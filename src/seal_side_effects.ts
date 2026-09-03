// Purpose: neuter side effects into inert ProposedActions and refuse a side effect written as prose.
// Flow:
// 1. Build a ToolPolicy from a plain config. Never read the file here.
// 2. For sealToolCall, pass a read-only tool through. Turn any other tool into a ProposedAction.
// 3. For sealProse, refuse a sentence whose text carries a side-effect verb as a whole word.
// 4. Return the tagged result. Never throw for a normal fail.
import { canonicalStringify, sha256Hex } from "./hash.js";
import type { DraftSentence, DraftToolCall, ProposedAction, Veto } from "./types.js";

export interface ToolPolicy {
  isReadOnly(tool: string): boolean;
  sideEffectVerbs(): string[];
}

export type ToolCallSealResult =
  | { sealed: true; action?: ProposedAction }
  | { sealed: false; veto: Veto };

export type ProseSealResult =
  | { sealed: true }
  | { sealed: false; veto: Veto };

function sideEffectWithoutPermit(detail: string, locus: string): ProseSealResult {
  return { sealed: false, veto: { code: "SIDE_EFFECT_WITHOUT_PERMIT", detail, locus } };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertStringList(name: string, list: string[]): void {
  if (!Array.isArray(list)) {
    throw new TypeError(`makeToolPolicy requires "${name}" to be an array; got ${typeof list}`);
  }
  for (const item of list) {
    if (typeof item !== "string" || item.length === 0) {
      throw new TypeError(`makeToolPolicy requires "${name}" entries to be non-empty strings; got ${String(item)}`);
    }
  }
}

export function makeToolPolicy(config: {
  read_only: string[];
  side_effect_verbs: string[];
}): ToolPolicy {
  if (typeof config !== "object" || config === null) {
    throw new TypeError("makeToolPolicy requires a config object");
  }
  assertStringList("read_only", config.read_only);
  assertStringList("side_effect_verbs", config.side_effect_verbs);
  const readOnly = new Set(config.read_only);
  const verbs = [...config.side_effect_verbs];
  return {
    isReadOnly(tool: string): boolean {
      return readOnly.has(tool);
    },
    sideEffectVerbs(): string[] {
      return [...verbs];
    },
  };
}

function assertDraftToolCall(call: DraftToolCall): void {
  if (typeof call !== "object" || call === null) {
    throw new TypeError("sealToolCall requires a DraftToolCall object");
  }
  if (typeof call.tool !== "string" || call.tool.length === 0) {
    throw new TypeError(`sealToolCall requires a non-empty tool name; got ${typeof call.tool}`);
  }
  if (typeof call.args !== "object" || call.args === null || Array.isArray(call.args)) {
    throw new TypeError(`sealToolCall requires args to be a plain object; got ${typeof call.args}`);
  }
}

function assertProposedAction(action: ProposedAction): void {
  if (action.requires_permit !== true) {
    throw new Error("sealToolCall broke its contract: ProposedAction must set requires_permit true");
  }
  if ("execute" in action || "run" in action) {
    throw new Error("sealToolCall broke its contract: ProposedAction carries an execute path");
  }
}

export function sealToolCall(
  call: DraftToolCall,
  locus: string,
  policy: ToolPolicy,
): ToolCallSealResult {
  assertDraftToolCall(call);
  void locus;

  if (policy.isReadOnly(call.tool)) {
    return { sealed: true };
  }

  const action: ProposedAction = {
    action_id: sha256Hex(canonicalStringify({ tool: call.tool, args: call.args })),
    tool: call.tool,
    args: call.args,
    requires_permit: true,
  };

  assertProposedAction(action);
  return { sealed: true, action };
}

function assertDraftSentence(s: DraftSentence): void {
  if (typeof s !== "object" || s === null) {
    throw new TypeError("sealProse requires a DraftSentence object");
  }
  if (typeof s.text !== "string") {
    throw new TypeError(`sealProse requires a string text; got ${typeof s.text}`);
  }
}

export function sealProse(
  s: DraftSentence,
  locus: string,
  policy: ToolPolicy,
): ProseSealResult {
  assertDraftSentence(s);

  const folded = s.text.toLowerCase();
  for (const verb of policy.sideEffectVerbs()) {
    const pattern = new RegExp(`\\b${escapeRegExp(verb.toLowerCase())}\\b`, "u");
    if (pattern.test(folded)) {
      return sideEffectWithoutPermit(
        `sentence text carries the side-effect verb "${verb}"`,
        locus,
      );
    }
  }

  return { sealed: true };
}
