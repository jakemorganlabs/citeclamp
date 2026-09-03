import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { validateDraft, validateEvidence } from "../src/schema.js";
import type { Draft } from "../src/types.js";

const emptyDraft = { sentences: [], tool_calls: [] };

const draftWithSentence: Draft = {
  sentences: [
    {
      text: "Revenue was 90.",
      kind: "factual",
      citations: ["e-1"],
      numbers: [
        {
          value: "90",
          claim: { kind: "evidence_span", evidence_id: "e-1", start: 12, end: 14 },
        },
      ],
    },
  ],
  tool_calls: [],
};

const draftWithToolCall: Draft = {
  sentences: [],
  tool_calls: [
    { tool: "send_email", args: { to: "ops@example.com" }, permit_ref: "p-1" },
  ],
};

describe("validateDraft", () => {
  it("accepts an empty draft", () => {
    const result = validateDraft(emptyDraft);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.draft).toEqual(emptyDraft);
  });

  it("accepts a draft with a sealed number claim", () => {
    const result = validateDraft(draftWithSentence);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.draft).toEqual(draftWithSentence);
  });

  it("accepts a draft with a tool call that carries a permit_ref", () => {
    const result = validateDraft(draftWithToolCall);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.draft).toEqual(draftWithToolCall);
  });

  it("rejects a draft with an extra top-level key", () => {
    const result = validateDraft({ ...emptyDraft, notes: "extra" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.veto.code).toBe("MALFORMED_DRAFT");
      expect(typeof result.veto.locus).toBe("string");
    }
  });

  it("rejects a sentence with a kind outside the enum", () => {
    const bad = {
      sentences: [{ text: "x", kind: "opinion", citations: [], numbers: [] }],
      tool_calls: [],
    };
    const result = validateDraft(bad);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.veto.code).toBe("MALFORMED_DRAFT");
      expect(result.veto.locus).toContain("sentences");
    }
  });

  it("rejects a number claim with a kind outside the enum", () => {
    const bad = {
      sentences: [
        {
          text: "x",
          kind: "factual",
          citations: [],
          numbers: [{ value: "90", claim: { kind: "guess" } }],
        },
      ],
      tool_calls: [],
    };
    const result = validateDraft(bad);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.veto.code).toBe("MALFORMED_DRAFT");
  });

  it("rejects a tool call with an unknown property", () => {
    const bad = {
      sentences: [],
      tool_calls: [{ tool: "send_email", args: {}, execute: true }],
    };
    const result = validateDraft(bad);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.veto.code).toBe("MALFORMED_DRAFT");
  });

  it("accepts every draft the type system accepts", () => {
    const claimArb = fc.oneof(
      fc.record({
        kind: fc.constant("evidence_span" as const),
        evidence_id: fc.string(),
        start: fc.nat(),
        end: fc.nat(),
      }),
      fc.record({
        kind: fc.constant("calculator" as const),
        calculator: fc.string(),
        inputs: fc.dictionary(fc.string(), fc.string()),
      }),
    );
    const sentenceArb = fc.record({
      text: fc.string(),
      kind: fc.constantFrom("factual" as const, "nonfactual" as const),
      citations: fc.array(fc.string()),
      numbers: fc.array(fc.record({ value: fc.string(), claim: claimArb })),
    });
    const toolCallArb = fc.record({
      tool: fc.string(),
      args: fc.dictionary(fc.string(), fc.jsonValue()),
      permit_ref: fc.option(fc.string(), { nil: undefined }),
    });
    const draftArb = fc.record({
      sentences: fc.array(sentenceArb),
      tool_calls: fc.array(toolCallArb),
    });
    fc.assert(
      fc.property(draftArb, (d) => {
        const result = validateDraft(d);
        expect(result.valid).toBe(true);
      }),
    );
  });
});

describe("validateEvidence", () => {
  it("accepts an evidence set", () => {
    const items = [{ id: "e-1", source: "q3.txt", text: "Revenue was 90." }];
    expect(validateEvidence(items)).toEqual(items);
  });

  it("throws on an evidence item with an unknown property", () => {
    const bad = [{ id: "e-1", source: "q3.txt", text: "x", extra: 1 }];
    expect(() => validateEvidence(bad)).toThrow();
  });

  it("throws on a non-array input", () => {
    expect(() => validateEvidence({ id: "e-1" })).toThrow();
  });
});
