import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { makeEvidenceStore } from "../src/evidence_store.js";
import { sealCitation } from "../src/seal_citations.js";
import type { DraftSentence, EvidenceItem } from "../src/types.js";

const EVIDENCE: EvidenceItem[] = [
  { id: "e-1", source: "spec.pdf", text: "The link is limited to 90 metres." },
];

const store = makeEvidenceStore(EVIDENCE);

function sentence(kind: "factual" | "nonfactual", citations: string[], text = "x"): DraftSentence {
  return { text, kind, citations, numbers: [] };
}

describe("sealCitation examples", () => {
  it("seals a factual sentence that cites an existing id", () => {
    const result = sealCitation(sentence("factual", ["e-1"]), "s0", store);
    expect(result).toEqual({ sealed: true });
  });

  it("vetoes a factual sentence that cites no id", () => {
    const result = sealCitation(sentence("factual", []), "s0", store);
    expect(result.sealed).toBe(false);
    if (!result.sealed) {
      expect(result.veto.code).toBe("ORPHAN_CITATION");
    }
  });

  it("vetoes a factual sentence that cites an absent id", () => {
    const result = sealCitation(sentence("factual", ["e-9"]), "s0", store);
    expect(result.sealed).toBe(false);
    if (!result.sealed) {
      expect(result.veto.code).toBe("ORPHAN_CITATION");
    }
  });

  it("seals a nonfactual sentence that cites no id", () => {
    const result = sealCitation(sentence("nonfactual", []), "s0", store);
    expect(result).toEqual({ sealed: true });
  });
});

describe("sealCitation veto shape", () => {
  it("echoes the passed locus in every veto", () => {
    const cases: DraftSentence[] = [
      sentence("factual", []),
      sentence("factual", ["e-9"]),
      sentence("factual", ["e-1", "e-9"]),
    ];
    for (const s of cases) {
      const result = sealCitation(s, "sentences[7]", store);
      expect(result.sealed).toBe(false);
      if (!result.sealed) {
        expect(result.veto.locus).toBe("sentences[7]");
      }
    }
  });
});

describe("sealCitation properties", () => {
  it("seals all factual sentences with a non-empty subset of real ids", () => {
    fc.assert(
      fc.property(
        fc.subarray(["e-1"], { minLength: 1 }),
        (citations) => {
          const result = sealCitation(sentence("factual", citations), "prop", store);
          expect(result).toEqual({ sealed: true });
        },
      ),
    );
  });

  it("vetoes all factual sentences that cite one absent id", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((id) => !EVIDENCE.some((e) => e.id === id)),
        (absent) => {
          const result = sealCitation(sentence("factual", [absent]), "prop", store);
          expect(result.sealed).toBe(false);
          if (!result.sealed) {
            expect(result.veto.code).toBe("ORPHAN_CITATION");
            expect(result.veto.locus).toBe("prop");
          }
        },
      ),
    );
  });
});

describe("sealCitation contract guards", () => {
  it("throws on a non-string text", () => {
    const bad = { text: 1, kind: "factual", citations: ["e-1"], numbers: [] };
    expect(() => sealCitation(bad as unknown as DraftSentence, "guard", store)).toThrow(TypeError);
  });

  it("throws on an unknown sentence kind", () => {
    const bad = { text: "x", kind: "guess", citations: [], numbers: [] };
    expect(() => sealCitation(bad as unknown as DraftSentence, "guard", store)).toThrow(TypeError);
  });

  it("throws on a non-array citations field", () => {
    const bad = { text: "x", kind: "factual", citations: "e-1", numbers: [] };
    expect(() => sealCitation(bad as unknown as DraftSentence, "guard", store)).toThrow(TypeError);
  });
});
