// Purpose: pinned string keys and the veto code union.
// Flow:
// 1. List every veto code exactly once.
// 2. Derive the VetoCode type from the list so the two never drift.
export const VETO_CODES = [
  "MALFORMED_DRAFT",
  "UNSIGNED_NUMBER",
  "ORPHAN_CITATION",
  "SIDE_EFFECT_WITHOUT_PERMIT",
] as const;

export type VetoCode = (typeof VETO_CODES)[number];
