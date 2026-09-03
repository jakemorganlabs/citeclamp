// Purpose: seal one draft number against the evidence set or the calculator registry.
// Flow:
// 1. Branch on the claim kind.
// 2. For evidence_span, slice the evidence text and strict-compare the value.
// 3. For calculator, run the registered calculator and compare the output.
// 4. Return the tagged result. Never throw for a normal fail.
import type { CalculatorRegistry } from "./calculators.js";
import type { EvidenceStore } from "./evidence_store.js";
import type { DraftNumber, NumberProof, Veto } from "./types.js";

export type NumberSealResult =
  | { sealed: true; proof: NumberProof }
  | { sealed: false; veto: Veto };

function unsignedNumber(detail: string, locus: string): NumberSealResult {
  return { sealed: false, veto: { code: "UNSIGNED_NUMBER", detail, locus } };
}

function assertDraftNumber(n: DraftNumber): void {
  if (typeof n !== "object" || n === null) {
    throw new TypeError("sealNumber requires a DraftNumber object");
  }
  if (typeof n.value !== "string") {
    throw new TypeError(`sealNumber requires a string value; got ${typeof n.value}`);
  }
  const kind = n.claim?.kind;
  if (kind !== "evidence_span" && kind !== "calculator") {
    throw new TypeError(`sealNumber requires a known claim kind; got ${String(kind)}`);
  }
}

export function sealNumber(
  n: DraftNumber,
  locus: string,
  store: EvidenceStore,
  registry: CalculatorRegistry,
): NumberSealResult {
  assertDraftNumber(n);

  if (n.claim.kind === "evidence_span") {
    const { evidence_id, start, end } = n.claim;
    if (store.get(evidence_id) === undefined) {
      return unsignedNumber(`evidence id not found: "${evidence_id}"`, locus);
    }
    if (!store.spanEquals(evidence_id, start, end, n.value)) {
      return unsignedNumber(
        `span ${evidence_id}[${start}:${end}] does not equal "${n.value}"`,
        locus,
      );
    }
    const proof: NumberProof = { kind: "evidence_span", evidence_id, start, end };
    return { sealed: true, proof };
  }

  const { calculator, inputs } = n.claim;
  if (!registry.has(calculator)) {
    return unsignedNumber(`calculator not registered: "${calculator}"`, locus);
  }
  const output = registry.run(calculator, inputs);
  if (output !== n.value) {
    return unsignedNumber(
      `calculator "${calculator}" returned "${output}", not "${n.value}"`,
      locus,
    );
  }
  const proof: NumberProof = {
    kind: "calculator",
    calculator,
    input_hash: registry.inputHash(inputs),
  };
  return { sealed: true, proof };
}
