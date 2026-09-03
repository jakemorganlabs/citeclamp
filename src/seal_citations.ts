// Purpose: seal one draft sentence against the evidence set.
// Flow:
// 1. Skip a nonfactual sentence.
// 2. For a factual sentence, require at least one citation.
// 3. Require every cited id to resolve in the evidence store.
// 4. Return the tagged result. Never throw for a normal fail.
import type { EvidenceStore } from "./evidence_store.js";
import type { DraftSentence, Veto } from "./types.js";

export type CitationSealResult =
  | { sealed: true }
  | { sealed: false; veto: Veto };

function orphanCitation(detail: string, locus: string): CitationSealResult {
  return { sealed: false, veto: { code: "ORPHAN_CITATION", detail, locus } };
}

function assertDraftSentence(s: DraftSentence): void {
  if (typeof s !== "object" || s === null) {
    throw new TypeError("sealCitation requires a DraftSentence object");
  }
  if (typeof s.text !== "string") {
    throw new TypeError(`sealCitation requires a string text; got ${typeof s.text}`);
  }
  if (s.kind !== "factual" && s.kind !== "nonfactual") {
    throw new TypeError(`sealCitation requires a known sentence kind; got ${String(s.kind)}`);
  }
  if (!Array.isArray(s.citations)) {
    throw new TypeError(`sealCitation requires a citations array; got ${typeof s.citations}`);
  }
}

function assertCitationSealResult(result: CitationSealResult, locus: string): void {
  if (result.sealed === false && result.veto.locus !== locus) {
    throw new Error(`sealCitation broke its contract: veto locus "${result.veto.locus}" is not "${locus}"`);
  }
  if (result.sealed === false && result.veto.code !== "ORPHAN_CITATION") {
    throw new Error(`sealCitation broke its contract: veto code "${result.veto.code}" is not ORPHAN_CITATION`);
  }
}

export function sealCitation(
  s: DraftSentence,
  locus: string,
  store: EvidenceStore,
): CitationSealResult {
  assertDraftSentence(s);

  let result: CitationSealResult;

  if (s.kind === "nonfactual") {
    result = { sealed: true };
    assertCitationSealResult(result, locus);
    return result;
  }

  if (s.citations.length === 0) {
    result = orphanCitation("factual sentence cites no evidence id", locus);
    assertCitationSealResult(result, locus);
    return result;
  }

  for (const id of s.citations) {
    if (store.get(id) === undefined) {
      result = orphanCitation(`evidence id not found: "${id}"`, locus);
      assertCitationSealResult(result, locus);
      return result;
    }
  }

  result = { sealed: true };
  assertCitationSealResult(result, locus);
  return result;
}
