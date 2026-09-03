// Purpose: load a fixture, run seal, compare the outcome to the expected outcome.
// Flow:
// 1. Validate each fixture file against the fixture schema on load. Fail loud with the file name.
// 2. Load the shared evidence set once per loadFixtures call.
// 3. Run seal on each fixture draft.
// 4. Compare the outcome to the fixture expectation. Veto codes compare as a set.
// 5. Return one FixtureResult per fixture. The runner never throws for a normal seal outcome.
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { makeRegistry, type Calculator, type CalculatorRegistry } from "./calculators.js";
import { VETO_CODES, type VetoCode } from "./constants.js";
import { validateEvidence } from "./schema.js";
import { seal, type SealDeps } from "./sealer.js";
import { makeToolPolicy, type ToolPolicy } from "./seal_side_effects.js";
import type { EvidenceItem, SealOutcome } from "./types.js";

export interface Fixture {
  id: string;
  note: string;
  draft: unknown;
  expect:
    | { sealed: true }
    | { sealed: false; codes: VetoCode[] };
}

export interface FixtureResult {
  id: string;
  pass: boolean;
  detail: string;
}

export interface LoadedFixtures {
  fixtures: Fixture[];
  evidence: EvidenceItem[];
  evidencePath: string;
}

const sum: Calculator = (inputs) => {
  const a = Number.parseInt(inputs.a ?? "", 10);
  const b = Number.parseInt(inputs.b ?? "", 10);
  return String(a + b);
};

const registry: CalculatorRegistry = makeRegistry({ sum });

const policy: ToolPolicy = makeToolPolicy({
  read_only: ["search_docs"],
  side_effect_verbs: ["send", "post", "email", "delete"],
});

const knownVetoCodes = new Set<string>(VETO_CODES);

function fail(fileName: string, reason: string): never {
  throw new Error(`fixture ${fileName}: ${reason}`);
}

function assertFixtureShape(raw: unknown, fileName: string): asserts raw is Fixture {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail(fileName, "fixture must be a plain object");
  }
  const obj = raw as Record<string, unknown>;

  const allowed = new Set(["id", "note", "draft", "expect"]);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      fail(fileName, `unknown top-level key "${key}"`);
    }
  }

  if (typeof obj.id !== "string" || obj.id.length === 0) {
    fail(fileName, `id must be a non-empty string; got ${typeof obj.id}`);
  }
  if (typeof obj.note !== "string" || obj.note.length === 0) {
    fail(fileName, `note must be a non-empty string; got ${typeof obj.note}`);
  }
  if (!("draft" in obj)) {
    fail(fileName, "fixture must carry a draft key");
  }

  const expect = obj.expect;
  if (typeof expect !== "object" || expect === null || Array.isArray(expect)) {
    fail(fileName, "expect must be a plain object");
  }
  const exp = expect as Record<string, unknown>;

  if (exp.sealed === true) {
    const extra = Object.keys(exp).filter((k) => k !== "sealed");
    if (extra.length > 0) {
      fail(fileName, `expect with sealed true must not carry extra keys: ${extra.join(", ")}`);
    }
    return;
  }

  if (exp.sealed === false) {
    if (!Array.isArray(exp.codes)) {
      fail(fileName, `expect.codes must be an array; got ${typeof exp.codes}`);
    }
    if (exp.codes.length === 0) {
      fail(fileName, "expect.codes must list at least one veto code");
    }
    const extra = Object.keys(exp).filter((k) => k !== "sealed" && k !== "codes");
    if (extra.length > 0) {
      fail(fileName, `expect with sealed false must not carry extra keys: ${extra.join(", ")}`);
    }
    for (const code of exp.codes) {
      if (typeof code !== "string" || !knownVetoCodes.has(code)) {
        fail(fileName, `expect.codes carries an unknown veto code "${String(code)}"`);
      }
    }
    return;
  }

  fail(fileName, `expect.sealed must be true or false; got ${typeof exp.sealed}`);
}

async function loadEvidence(evidencePath: string): Promise<EvidenceItem[]> {
  let raw: unknown;
  try {
    const text = await readFile(evidencePath, "utf8");
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `fixture_runner: failed to read evidence at "${evidencePath}": ${(err as Error).message}`,
    );
  }
  return validateEvidence(raw);
}

function defaultEvidencePath(dir: string): string {
  return resolve(dir, "..", "evidence.json");
}

export async function loadFixtures(dir: string): Promise<LoadedFixtures> {
  const evidencePath = defaultEvidencePath(dir);
  const evidence = await loadEvidence(evidencePath);

  const entries = await readdir(dir);
  const jsonFiles = entries.filter((name) => name.endsWith(".json")).sort();
  if (jsonFiles.length === 0) {
    throw new Error(`loadFixtures: directory "${dir}" holds no .json files`);
  }

  const fixtures = await Promise.all(
    jsonFiles.map(async (fileName): Promise<Fixture> => {
      const path = join(dir, fileName);
      let parsed: unknown;
      try {
        const rawText = await readFile(path, "utf8");
        parsed = JSON.parse(rawText);
      } catch (err) {
        fail(fileName, `failed to read or parse: ${(err as Error).message}`);
      }
      assertFixtureShape(parsed, fileName);
      return parsed;
    }),
  );

  return { fixtures, evidence, evidencePath };
}

function codesMatch(actual: VetoCode[], expected: VetoCode[]): boolean {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  if (actualSet.size !== expectedSet.size) {
    return false;
  }
  for (const code of expectedSet) {
    if (!actualSet.has(code)) {
      return false;
    }
  }
  return true;
}

function describeOutcome(outcome: SealOutcome): string {
  if (outcome.sealed) {
    return "sealed";
  }
  return `vetoes [${outcome.vetoes.map((v) => v.code).join(", ")}]`;
}

export function runFixture(f: Fixture, evidence: EvidenceItem[]): FixtureResult {
  const deps: SealDeps = { evidence, registry, policy, traceId: `fixture-${f.id}` };
  const outcome = seal(f.draft, deps);

  if (f.expect.sealed === true) {
    if (outcome.sealed === true) {
      return { id: f.id, pass: true, detail: "" };
    }
    return {
      id: f.id,
      pass: false,
      detail: `expected sealed, got ${describeOutcome(outcome)}`,
    };
  }

  if (outcome.sealed === true) {
    return {
      id: f.id,
      pass: false,
      detail: `expected vetoes [${f.expect.codes.join(", ")}], got sealed`,
    };
  }

  const actualCodes = outcome.vetoes.map((v) => v.code);
  if (codesMatch(actualCodes, f.expect.codes)) {
    return { id: f.id, pass: true, detail: "" };
  }
  return {
    id: f.id,
    pass: false,
    detail: `expected vetoes [${f.expect.codes.join(", ")}], got [${actualCodes.join(", ")}]`,
  };
}
