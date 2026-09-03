// Purpose: Ajv validators for the draft and the evidence set.
// Flow:
// 1. Compile every schema once at module load.
// 2. On a draft match, return the typed Draft.
// 3. On a draft fail, return a MALFORMED_DRAFT veto with the Ajv path.
// 4. On an evidence fail, throw; the caller must not continue.
import * as AjvNs from "ajv";
import type { ValidateFunction } from "ajv";

const Ajv = (AjvNs as unknown as { default: new (opts?: object) => import("ajv").Ajv }).default;
import draftSchema from "../schemas/draft.schema.json" with { type: "json" };
import evidenceSchema from "../schemas/evidence.schema.json" with { type: "json" };
import sealedResponseSchema from "../schemas/sealed_response.schema.json" with { type: "json" };
import vetoSchema from "../schemas/veto.schema.json" with { type: "json" };
import type { Draft, EvidenceItem, Veto } from "./types.js";

const ajv = new Ajv({ allErrors: false, strict: true });

function compile(schema: object, name: string): ValidateFunction {
  try {
    return ajv.compile(schema);
  } catch (err) {
    throw new Error(`schema ${name} failed to compile: ${(err as Error).message}`);
  }
}

const validateDraftFn = compile(draftSchema, "draft");
const validateEvidenceFn = compile(evidenceSchema, "evidence");
export const validateSealedResponseFn = compile(sealedResponseSchema, "sealed_response");
export const validateVetoFn = compile(vetoSchema, "veto");

export type ValidateDraftResult =
  | { valid: true; draft: Draft }
  | { valid: false; veto: Veto };

function firstErrorLocus(fn: ValidateFunction): string {
  const err = fn.errors?.[0];
  if (!err) {
    throw new Error("validateDraft: Ajv reported invalid but returned no errors");
  }
  return err.instancePath === "" ? "/" : err.instancePath;
}

export function validateDraft(input: unknown): ValidateDraftResult {
  if (validateDraftFn(input)) {
    return { valid: true, draft: input as Draft };
  }
  const veto: Veto = {
    code: "MALFORMED_DRAFT",
    detail: validateDraftFn.errors?.[0]?.message ?? "draft failed schema",
    locus: firstErrorLocus(validateDraftFn),
  };
  return { valid: false, veto };
}

export function validateEvidence(input: unknown): EvidenceItem[] {
  if (!validateEvidenceFn(input)) {
    const err = validateEvidenceFn.errors?.[0];
    const path = err && err.instancePath !== "" ? err.instancePath : "/";
    const msg = err?.message ?? "evidence set failed schema";
    throw new Error(`validateEvidence: ${msg} at ${path}`);
  }
  return input as EvidenceItem[];
}
