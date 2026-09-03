// Purpose: shared types for the draft, the evidence set, the sealed response, and the veto.
// Flow:
// 1. Define the shapes the model may emit.
// 2. Define the shapes the sealer returns.
// 3. Model every outcome as a discriminated union on a literal tag.
import type { VetoCode } from "./constants.js";

export interface EvidenceItem {
  id: string;
  source: string;
  text: string;
}

export type NumberClaim =
  | { kind: "evidence_span"; evidence_id: string; start: number; end: number }
  | { kind: "calculator"; calculator: string; inputs: Record<string, string> };

export interface DraftNumber {
  value: string;
  claim: NumberClaim;
}

export interface DraftSentence {
  text: string;
  kind: "factual" | "nonfactual";
  citations: string[];
  numbers: DraftNumber[];
}

export interface DraftToolCall {
  tool: string;
  args: Record<string, unknown>;
  permit_ref?: string;
}

export interface Draft {
  sentences: DraftSentence[];
  tool_calls: DraftToolCall[];
}

export type NumberProof =
  | { kind: "evidence_span"; evidence_id: string; start: number; end: number }
  | { kind: "calculator"; calculator: string; input_hash: string };

export interface SealedNumber {
  value: string;
  proof: NumberProof;
}

export interface SealedSentence {
  text: string;
  citations: string[];
}

export interface ProposedAction {
  action_id: string;
  tool: string;
  args: Record<string, unknown>;
  requires_permit: true;
}

export interface SealedResponse {
  sentences: SealedSentence[];
  sealed_numbers: SealedNumber[];
  proposed_actions: ProposedAction[];
}

export interface Veto {
  code: VetoCode;
  detail: string;
  locus: string;
}

export type SealOutcome =
  | { sealed: true; response: SealedResponse }
  | { sealed: false; vetoes: Veto[] };
