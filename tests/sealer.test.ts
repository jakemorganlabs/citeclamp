import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { makeRegistry, type Calculator } from "../src/calculators.js";
import { seal } from "../src/sealer.js";
import { makeToolPolicy } from "../src/seal_side_effects.js";
import type { Draft, DraftSentence, EvidenceItem, SealOutcome } from "../src/types.js";

const EVIDENCE: EvidenceItem[] = [
  { id: "e-1", source: "spec.pdf", text: "The link is limited to 90 metres." },
];

// "The link is limited to 90 metres." index 23..25 holds "90".

const sum: Calculator = (inputs) => {
  const a = Number.parseInt(inputs.a ?? "", 10);
  const b = Number.parseInt(inputs.b ?? "", 10);
  return String(a + b);
};

const registry = makeRegistry({ sum });

const policy = makeToolPolicy({
  read_only: ["search_docs"],
  side_effect_verbs: ["send", "post", "email", "delete"],
});

function deps(traceId = "trace-test") {
  return { evidence: EVIDENCE, registry, policy, traceId };
}

function sentence(text: string, kind: "factual" | "nonfactual", citations: string[], numbers: DraftSentence["numbers"] = []): DraftSentence {
  return { text, kind, citations, numbers };
}

function spanNumber(id: string, start: number, end: number, value: string) {
  return { value, claim: { kind: "evidence_span" as const, evidence_id: id, start, end } };
}

function outcome(input: unknown, traceId = "trace-test"): SealOutcome {
  return seal(input, deps(traceId));
}

describe("seal example table", () => {
  it("seals a draft with one factual sentence citing e-1 and number 90 as a span", () => {
    const draft: Draft = {
      sentences: [sentence("The link is limited to 90 metres.", "factual", ["e-1"], [spanNumber("e-1", 23, 25, "90")])],
      tool_calls: [],
    };
    const result = outcome(draft);
    expect(result.sealed).toBe(true);
    if (result.sealed) {
      expect(result.response.sentences).toHaveLength(1);
      expect(result.response.sealed_numbers).toHaveLength(1);
      expect(result.response.proposed_actions).toHaveLength(0);
    }
  });

  it("vetoes a sentence citing e-9 with ORPHAN_CITATION and nothing else for a verb-free text", () => {
    const draft: Draft = {
      sentences: [sentence("The link is limited to 90 metres.", "factual", ["e-9"], [spanNumber("e-1", 23, 25, "90")])],
      tool_calls: [],
    };
    const result = outcome(draft);
    expect(result.sealed).toBe(false);
    if (!result.sealed) {
      const codes = result.vetoes.map((v) => v.code);
      expect(codes).toEqual(["ORPHAN_CITATION"]);
    }
  });

  it("vetoes a number 95 that does not match the e-1 span with UNSIGNED_NUMBER", () => {
    const draft: Draft = {
      sentences: [sentence("The link is limited to 95 metres.", "factual", ["e-1"], [spanNumber("e-1", 23, 25, "95")])],
      tool_calls: [],
    };
    const result = outcome(draft);
    expect(result.sealed).toBe(false);
    if (!result.sealed) {
      const codes = result.vetoes.map((v) => v.code);
      expect(codes).toEqual(["UNSIGNED_NUMBER"]);
    }
  });

  it("seals a draft with one send_email tool call into one ProposedAction", () => {
    const draft: Draft = {
      sentences: [],
      tool_calls: [{ tool: "send_email", args: { to: "a@b.com" } }],
    };
    const result = outcome(draft);
    expect(result.sealed).toBe(true);
    if (result.sealed) {
      expect(result.response.proposed_actions).toHaveLength(1);
      expect(result.response.proposed_actions[0]?.tool).toBe("send_email");
      expect(result.response.proposed_actions[0]?.requires_permit).toBe(true);
    }
  });

  it("vetoes a factual sentence whose text carries the verb send with SIDE_EFFECT_WITHOUT_PERMIT", () => {
    const draft: Draft = {
      sentences: [sentence("send the report now", "factual", ["e-1"], [spanNumber("e-1", 23, 25, "90")])],
      tool_calls: [],
    };
    const result = outcome(draft);
    expect(result.sealed).toBe(false);
    if (!result.sealed) {
      const codes = result.vetoes.map((v) => v.code);
      expect(codes).toEqual(["SIDE_EFFECT_WITHOUT_PERMIT"]);
    }
  });

  it("vetoes a draft with an unknown top-level key with MALFORMED_DRAFT", () => {
    const draft = {
      sentences: [],
      tool_calls: [],
      extra: true,
    };
    const result = outcome(draft);
    expect(result.sealed).toBe(false);
    if (!result.sealed) {
      expect(result.vetoes).toHaveLength(1);
      expect(result.vetoes[0]?.code).toBe("MALFORMED_DRAFT");
    }
  });
});

describe("seal collects every veto", () => {
  it("returns two vetoes for two independent failures in one draft", () => {
    const draft: Draft = {
      sentences: [
        sentence("The link is limited to 95 metres.", "factual", ["e-9"], [spanNumber("e-1", 23, 25, "95")]),
      ],
      tool_calls: [],
    };
    const result = outcome(draft);
    expect(result.sealed).toBe(false);
    if (!result.sealed) {
      const codes = result.vetoes.map((v) => v.code).sort();
      expect(codes).toEqual(["ORPHAN_CITATION", "UNSIGNED_NUMBER"]);
    }
  });
});

describe("seal properties", () => {
  it("seals every valid draft with only nonfactual sentences, no numbers, no tool calls", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            text: fc
              .string()
              .filter((t) => !["send", "post", "email", "delete"].some((verb) => new RegExp(`\\b${verb}\\b`, "i").test(t))),
            kind: fc.constant("nonfactual" as const),
            citations: fc.array(fc.string()),
          }),
        ),
        (sentences) => {
          const draft: Draft = {
            sentences: sentences.map((s) => ({ ...s, numbers: [] })),
            tool_calls: [],
          };
          const result = outcome(draft, "prop-nonfactual");
          expect(result.sealed).toBe(true);
        },
      ),
    );
  });

  it("returns one UNSIGNED_NUMBER veto for every draft with one unsigned number", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }).filter((v) => v !== "90"), (value) => {
        const draft: Draft = {
          sentences: [sentence("The link is limited to 90 metres.", "factual", ["e-1"], [spanNumber("e-1", 23, 25, value)])],
          tool_calls: [],
        };
        const result = outcome(draft, "prop-unsigned");
        expect(result.sealed).toBe(false);
        if (!result.sealed) {
          const unsigned = result.vetoes.filter((v) => v.code === "UNSIGNED_NUMBER");
          expect(unsigned).toHaveLength(1);
        }
      }),
    );
  });

  it("returns two vetoes for every draft with two independent failures", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((v) => v !== "90"),
        fc.string({ minLength: 1 }).filter((id) => id !== "e-1"),
        (value, id) => {
          const draft: Draft = {
            sentences: [sentence("The link is limited to 90 metres.", "factual", [id], [spanNumber("e-1", 23, 25, value)])],
            tool_calls: [],
          };
          const result = outcome(draft, "prop-two-failures");
          expect(result.sealed).toBe(false);
          if (!result.sealed) {
            expect(result.vetoes).toHaveLength(2);
          }
        },
      ),
    );
  });
});
