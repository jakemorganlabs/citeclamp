import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { makeRegistry, type Calculator } from "../src/calculators.js";
import { makeEvidenceStore } from "../src/evidence_store.js";
import { sealNumber } from "../src/seal_numbers.js";
import type { DraftNumber, EvidenceItem } from "../src/types.js";

const EVIDENCE: EvidenceItem[] = [
  { id: "e-1", source: "spec.pdf", text: "The link is limited to 90 metres." },
];

// "The link is limited to 90 metres." index 23..25 holds "90".

const sum: Calculator = (inputs) => {
  const a = Number.parseInt(inputs.a ?? "", 10);
  const b = Number.parseInt(inputs.b ?? "", 10);
  return String(a + b);
};

const store = makeEvidenceStore(EVIDENCE);
const registry = makeRegistry({ sum });

function spanClaim(id: string, start: number, end: number, value: string): DraftNumber {
  return { value, claim: { kind: "evidence_span", evidence_id: id, start, end } };
}

function calcClaim(name: string, inputs: Record<string, string>, value: string): DraftNumber {
  return { value, claim: { kind: "calculator", calculator: name, inputs } };
}

describe("sealNumber evidence_span examples", () => {
  it("seals a span whose sliced text equals the value", () => {
    const result = sealNumber(spanClaim("e-1", 23, 25, "90"), "s0.n0", store, registry);
    expect(result.sealed).toBe(true);
    if (result.sealed) {
      expect(result.proof).toEqual({
        kind: "evidence_span",
        evidence_id: "e-1",
        start: 23,
        end: 25,
      });
    }
  });

  it("vetoes a span whose sliced text differs from the value", () => {
    const result = sealNumber(spanClaim("e-1", 23, 25, "95"), "s0.n0", store, registry);
    expect(result.sealed).toBe(false);
    if (!result.sealed) {
      expect(result.veto.code).toBe("UNSIGNED_NUMBER");
    }
  });

  it("vetoes a span whose evidence id is absent", () => {
    const result = sealNumber(spanClaim("e-9", 0, 2, "90"), "s0.n0", store, registry);
    expect(result.sealed).toBe(false);
    if (!result.sealed) {
      expect(result.veto.code).toBe("UNSIGNED_NUMBER");
    }
  });
});

describe("sealNumber calculator examples", () => {
  it("seals a calculator claim whose output equals the value", () => {
    const result = sealNumber(calcClaim("sum", { a: "2", b: "3" }, "5"), "s0.n0", store, registry);
    expect(result.sealed).toBe(true);
    if (result.sealed) {
      expect(result.proof).toEqual({
        kind: "calculator",
        calculator: "sum",
        input_hash: registry.inputHash({ a: "2", b: "3" }),
      });
    }
  });

  it("vetoes a calculator claim whose output differs from the value", () => {
    const result = sealNumber(calcClaim("sum", { a: "2", b: "3" }, "6"), "s0.n0", store, registry);
    expect(result.sealed).toBe(false);
    if (!result.sealed) {
      expect(result.veto.code).toBe("UNSIGNED_NUMBER");
    }
  });

  it("vetoes a claim that names an unregistered calculator", () => {
    const result = sealNumber(calcClaim("unknown", { a: "1" }, "1"), "s0.n0", store, registry);
    expect(result.sealed).toBe(false);
    if (!result.sealed) {
      expect(result.veto.code).toBe("UNSIGNED_NUMBER");
    }
  });
});

describe("sealNumber veto shape", () => {
  it("echoes the passed locus in every veto", () => {
    const cases: DraftNumber[] = [
      spanClaim("e-1", 23, 25, "95"),
      spanClaim("e-9", 0, 2, "90"),
      calcClaim("sum", { a: "2", b: "3" }, "6"),
      calcClaim("unknown", { a: "1" }, "1"),
    ];
    for (const n of cases) {
      const result = sealNumber(n, "sentences[3].numbers[1]", store, registry);
      expect(result.sealed).toBe(false);
      if (!result.sealed) {
        expect(result.veto.locus).toBe("sentences[3].numbers[1]");
      }
    }
  });
});

describe("sealNumber properties", () => {
  it("seals every substring span value of an evidence text", () => {
    fc.assert(
      fc.property(fc.string(), fc.nat(), fc.nat(), (text, a, b) => {
        const start = Math.min(a, b);
        const end = Math.max(a, b);
        const localStore = makeEvidenceStore([{ id: "e-x", source: "p", text }]);
        const value = text.slice(start, end);
        const result = sealNumber(spanClaim("e-x", start, end, value), "prop.span", localStore, registry);
        expect(result.sealed).toBe(true);
      }),
    );
  });

  it("vetoes every span value that does not equal the sliced text", () => {
    fc.assert(
      fc.property(fc.string(), fc.nat(), fc.nat(), fc.string(), (text, a, b, value) => {
        const start = Math.min(a, b);
        const end = Math.max(a, b);
        fc.pre(text.slice(start, end) !== value);
        const localStore = makeEvidenceStore([{ id: "e-x", source: "p", text }]);
        const result = sealNumber(spanClaim("e-x", start, end, value), "prop.span", localStore, registry);
        expect(result.sealed).toBe(false);
        if (!result.sealed) {
          expect(result.veto.code).toBe("UNSIGNED_NUMBER");
        }
      }),
    );
  });

  it("seals the sum calculator for every integer pair", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        const n = calcClaim("sum", { a: String(a), b: String(b) }, String(a + b));
        const result = sealNumber(n, "prop.calc", store, registry);
        expect(result.sealed).toBe(true);
      }),
    );
  });
});

describe("sealNumber contract guards", () => {
  it("throws on a non-string value", () => {
    const bad = { value: 90, claim: { kind: "evidence_span", evidence_id: "e-1", start: 23, end: 25 } };
    expect(() => sealNumber(bad as unknown as DraftNumber, "guard", store, registry)).toThrow(TypeError);
  });

  it("throws on an unknown claim kind", () => {
    const bad = { value: "90", claim: { kind: "oracle" } };
    expect(() => sealNumber(bad as unknown as DraftNumber, "guard", store, registry)).toThrow(TypeError);
  });
});
