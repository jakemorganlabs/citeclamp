// Purpose: the paste-a-draft CLI. Read a draft path and an evidence path, then print the seal outcome.
// Flow:
// 1. Read the draft path and the evidence path from argv.
// 2. Parse each file as JSON. The CLI does the only I/O; seal() stays pure.
// 3. Run seal() and print the outcome as JSON.
// 4. Exit 0 on a pass. Exit 1 on a veto or an I/O failure.
import { readFile } from "node:fs/promises";
import { makeRegistry, type Calculator } from "../src/calculators.js";
import { validateEvidence } from "../src/schema.js";
import { seal, type SealDeps } from "../src/sealer.js";
import { makeToolPolicy } from "../src/seal_side_effects.js";

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

async function readJson(path: string): Promise<unknown> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
}

async function main(): Promise<number> {
  const [draftPath, evidencePath] = process.argv.slice(2);
  if (draftPath === undefined || evidencePath === undefined) {
    process.stderr.write("usage: tsx scripts/seal.ts <draft.json> <evidence.json>\n");
    return 1;
  }

  let draftInput: unknown;
  let evidenceInput: unknown;
  try {
    draftInput = await readJson(draftPath);
    evidenceInput = await readJson(evidencePath);
  } catch (err) {
    process.stderr.write(`read error: ${(err as Error).message}\n`);
    return 1;
  }

  let evidence: SealDeps["evidence"];
  try {
    evidence = validateEvidence(evidenceInput);
  } catch (err) {
    process.stderr.write(`evidence error: ${(err as Error).message}\n`);
    return 1;
  }

  const deps: SealDeps = { evidence, registry, policy, traceId: `cli-${Date.now()}` };
  const outcome = seal(draftInput, deps);
  process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`);
  return outcome.sealed ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`fatal: ${(err as Error).message}\n`);
    process.exit(1);
  },
);
