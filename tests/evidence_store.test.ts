import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { makeEvidenceStore } from "../src/evidence_store.js";
import type { EvidenceItem } from "../src/types.js";

const EVIDENCE: EvidenceItem[] = [
  { id: "e-1", source: "spec.pdf", text: "The link is limited to 90 metres." },
];

// "The link is limited to 90 metres." index 23..25 holds "90".

describe("evidence store spanEquals", () => {
  it("returns true when the sliced text equals the value", () => {
    const store = makeEvidenceStore(EVIDENCE);
    expect(store.spanEquals("e-1", 23, 25, "90")).toBe(true);
  });

  it("returns false when the sliced text does not equal the value", () => {
    const store = makeEvidenceStore(EVIDENCE);
    expect(store.spanEquals("e-1", 23, 25, "95")).toBe(false);
  });

  it("returns false when the id does not exist", () => {
    const store = makeEvidenceStore(EVIDENCE);
    expect(store.spanEquals("e-9", 0, 2, "90")).toBe(false);
  });

  it("seals every substring span of an evidence text", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.nat(),
        fc.nat(),
        (text, a, b) => {
          const start = Math.min(a, b);
          const end = Math.max(a, b);
          const item: EvidenceItem = { id: "e-x", source: "p", text };
          const store = makeEvidenceStore([item]);
          const value = text.slice(start, end);
          expect(store.spanEquals("e-x", start, end, value)).toBe(true);
        },
      ),
    );
  });

  it("returns false for every value that does not equal the sliced text", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.nat(),
        fc.nat(),
        fc.string(),
        (text, a, b, value) => {
          const start = Math.min(a, b);
          const end = Math.max(a, b);
          fc.pre(text.slice(start, end) !== value);
          const item: EvidenceItem = { id: "e-x", source: "p", text };
          const store = makeEvidenceStore([item]);
          expect(store.spanEquals("e-x", start, end, value)).toBe(false);
        },
      ),
    );
  });

  it("returns false for an absent id on any span", () => {
    fc.assert(
      fc.property(fc.nat(), fc.nat(), fc.string(), (a, b, value) => {
        const start = Math.min(a, b);
        const end = Math.max(a, b);
        const store = makeEvidenceStore([]);
        expect(store.spanEquals("absent", start, end, value)).toBe(false);
      }),
    );
  });
});

describe("evidence store span contract", () => {
  it("throws on non-integer bounds", () => {
    const store = makeEvidenceStore(EVIDENCE);
    expect(() => store.spanEquals("e-1", 1.5, 25, "90")).toThrow(TypeError);
    expect(() => store.spanEquals("e-1", 23, 24.5, "90")).toThrow(TypeError);
  });

  it("throws on a negative start", () => {
    const store = makeEvidenceStore(EVIDENCE);
    expect(() => store.spanEquals("e-1", -1, 25, "90")).toThrow(RangeError);
  });

  it("throws when end is less than start", () => {
    const store = makeEvidenceStore(EVIDENCE);
    expect(() => store.spanEquals("e-1", 25, 23, "90")).toThrow(RangeError);
  });

  it("accepts an empty span", () => {
    const store = makeEvidenceStore(EVIDENCE);
    expect(store.spanEquals("e-1", 10, 10, "")).toBe(true);
    expect(store.spanEquals("e-1", 10, 10, "x")).toBe(false);
  });
});

describe("evidence store get", () => {
  it("returns the item for a known id", () => {
    const store = makeEvidenceStore(EVIDENCE);
    expect(store.get("e-1")?.source).toBe("spec.pdf");
  });

  it("returns undefined for an unknown id", () => {
    const store = makeEvidenceStore(EVIDENCE);
    expect(store.get("e-9")).toBeUndefined();
  });
});
