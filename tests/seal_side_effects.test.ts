import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  makeToolPolicy,
  sealProse,
  sealToolCall,
} from "../src/seal_side_effects.js";
import type { DraftSentence, DraftToolCall } from "../src/types.js";

const policy = makeToolPolicy({
  read_only: ["search_docs"],
  side_effect_verbs: ["send", "post", "email", "delete"],
});

function toolCall(tool: string, args: Record<string, unknown> = {}): DraftToolCall {
  return { tool, args };
}

function sentence(text: string, kind: "factual" | "nonfactual" = "factual"): DraftSentence {
  return { text, kind, citations: [], numbers: [] };
}

describe("sealToolCall examples", () => {
  it("passes a read-only tool through with no action", () => {
    const result = sealToolCall(toolCall("search_docs", { q: "x" }), "tc0", policy);
    expect(result).toEqual({ sealed: true });
  });

  it("neuters a side-effect tool into a ProposedAction that requires a permit", () => {
    const result = sealToolCall(toolCall("send_email", { to: "a@b.com" }), "tc0", policy);
    expect(result.sealed).toBe(true);
    if (result.sealed) {
      expect(result.action).toBeDefined();
      expect(result.action?.tool).toBe("send_email");
      expect(result.action?.requires_permit).toBe(true);
      expect(result.action).not.toHaveProperty("execute");
      expect(result.action).not.toHaveProperty("run");
    }
  });
});

describe("sealProse examples", () => {
  it("vetoes a sentence that carries a side-effect verb", () => {
    const result = sealProse(sentence("I will send the report"), "s0", policy);
    expect(result.sealed).toBe(false);
    if (!result.sealed) {
      expect(result.veto.code).toBe("SIDE_EFFECT_WITHOUT_PERMIT");
      expect(result.veto.locus).toBe("s0");
    }
  });

  it("seals a sentence with no side-effect verb", () => {
    expect(sealProse(sentence("The link is 90 metres"), "s0", policy)).toEqual({ sealed: true });
  });

  it("matches verbs whole-word only", () => {
    expect(sealProse(sentence("The sender approved the spec"), "s0", policy)).toEqual({
      sealed: true,
    });
    expect(sealProse(sentence("The attendant posed the question"), "s0", policy)).toEqual({
      sealed: true,
    });
  });

  it("folds case before the verb match", () => {
    const result = sealProse(sentence("SEND the report now"), "s0", policy);
    expect(result.sealed).toBe(false);
    if (!result.sealed) {
      expect(result.veto.code).toBe("SIDE_EFFECT_WITHOUT_PERMIT");
    }
  });
});

describe("sealToolCall properties", () => {
  it("returns a ProposedAction with requires_permit true for every non-allowlisted tool", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((tool) => tool !== "search_docs"),
        fc.dictionary(fc.string(), fc.jsonValue()),
        (tool, args) => {
          const result = sealToolCall(toolCall(tool, args), "prop", policy);
          expect(result.sealed).toBe(true);
          if (result.sealed) {
            expect(result.action?.requires_permit).toBe(true);
          }
        },
      ),
    );
  });

  it("keeps the action_id stable across runs for the same tool and args", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.dictionary(fc.string(), fc.jsonValue()),
        (tool, args) => {
        const first = sealToolCall(toolCall(tool, args), "prop", policy);
        const second = sealToolCall(toolCall(tool, args), "prop", policy);
        expect(first.sealed).toBe(true);
        expect(second.sealed).toBe(true);
        if (first.sealed && second.sealed) {
          expect(first.action?.action_id).toBe(second.action?.action_id);
        }
        },
      ),
    );
  });
});

describe("sealToolCall contract guards", () => {
  it("throws on a non-string tool name", () => {
    const bad = { tool: 7, args: {} };
    expect(() => sealToolCall(bad as unknown as DraftToolCall, "guard", policy)).toThrow(TypeError);
  });

  it("throws on non-object args", () => {
    const bad = { tool: "send_email", args: [] };
    expect(() => sealToolCall(bad as unknown as DraftToolCall, "guard", policy)).toThrow(TypeError);
  });
});

describe("sealProse contract guards", () => {
  it("throws on a non-string text", () => {
    const bad = { text: 3, kind: "factual", citations: [], numbers: [] };
    expect(() => sealProse(bad as unknown as DraftSentence, "guard", policy)).toThrow(TypeError);
  });
});

describe("makeToolPolicy contract guards", () => {
  it("throws on a non-object config", () => {
    expect(() => makeToolPolicy(null as unknown as { read_only: string[]; side_effect_verbs: string[] })).toThrow(TypeError);
  });

  it("throws on a non-array read_only field", () => {
    expect(() =>
      makeToolPolicy({ read_only: "search_docs" as unknown as string[], side_effect_verbs: [] }),
    ).toThrow(TypeError);
  });

  it("throws on a non-array side_effect_verbs field", () => {
    expect(() =>
      makeToolPolicy({ read_only: [], side_effect_verbs: "send" as unknown as string[] }),
    ).toThrow(TypeError);
  });
});
