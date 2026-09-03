// Purpose: the seal() walk. Validate the draft, run every seal, return a sealed response or every veto.
// Flow:
// 1. Validate the draft. On a fail, return one MALFORMED_DRAFT veto and stop.
// 2. Walk the sentences. Seal each number, each factual citation, and each sentence as prose.
// 3. Walk the tool calls. Neuter each call and collect each ProposedAction.
// 4. Collect every veto in one list. Build the sealed response only when the list is empty.
// 5. Log one structured event at the start and the end of each stage with a trace_id.
import { makeEvidenceStore } from "./evidence_store.js";
import { validateDraft } from "./schema.js";
import { sealCitation } from "./seal_citations.js";
import { sealNumber } from "./seal_numbers.js";
import { sealProse, sealToolCall } from "./seal_side_effects.js";
import type { CalculatorRegistry } from "./calculators.js";
import type { ToolPolicy } from "./seal_side_effects.js";
import type {
  EvidenceItem,
  ProposedAction,
  SealOutcome,
  SealedNumber,
  SealedSentence,
  Veto,
} from "./types.js";

export interface SealDeps {
  evidence: EvidenceItem[];
  registry: CalculatorRegistry;
  policy: ToolPolicy;
  traceId: string;
}

interface SealEvent {
  trace_id: string;
  stage: string;
  phase: "start" | "end";
  detail?: string;
}

// Log one structured event. The walk stays pure: this writes only to a sink the caller can swap.
export interface SealEventSink {
  log(event: SealEvent): void;
}

const defaultSink: SealEventSink = {
  log(_event: SealEvent): void {
    // no-op by default; the CLI can attach a real sink
  },
};

let activeSink: SealEventSink = defaultSink;

export function setSealEventSink(sink: SealEventSink): void {
  activeSink = sink;
}

function emit(traceId: string, stage: string, phase: "start" | "end", detail?: string): void {
  const event: SealEvent = { trace_id: traceId, stage, phase };
  if (detail !== undefined) {
    activeSink.log({ ...event, detail });
  } else {
    activeSink.log(event);
  }
}

// Assert the outcome contract. Throws on a violation so a broken walk fails loud.
function assertSealOutcome(outcome: SealOutcome): void {
  if (outcome.sealed === true) {
    if (!Array.isArray(outcome.response?.sentences)) {
      throw new Error("seal broke its contract: a sealed outcome must carry a sentences array");
    }
    if (!Array.isArray(outcome.response?.sealed_numbers)) {
      throw new Error("seal broke its contract: a sealed outcome must carry a sealed_numbers array");
    }
    if (!Array.isArray(outcome.response?.proposed_actions)) {
      throw new Error("seal broke its contract: a sealed outcome must carry a proposed_actions array");
    }
    return;
  }
  if (outcome.sealed === false) {
    if (!Array.isArray(outcome.vetoes) || outcome.vetoes.length === 0) {
      throw new Error("seal broke its contract: a vetoed outcome must list at least one veto");
    }
    return;
  }
  throw new Error("seal broke its contract: the outcome is neither sealed nor vetoed");
}

export function seal(input: unknown, deps: SealDeps): SealOutcome {
  const { evidence, registry, policy, traceId } = deps;

  emit(traceId, "validate", "start");
  const result = validateDraft(input);
  emit(traceId, "validate", "end", result.valid ? "valid" : "malformed");

  if (!result.valid) {
    const outcome: SealOutcome = { sealed: false, vetoes: [result.veto] };
    assertSealOutcome(outcome);
    return outcome;
  }

  const draft = result.draft;
  const store = makeEvidenceStore(evidence);
  const vetoes: Veto[] = [];
  const sealedNumbers: SealedNumber[] = [];
  const sealedSentences: SealedSentence[] = [];
  const proposedActions: ProposedAction[] = [];

  emit(traceId, "sentences", "start");
  draft.sentences.forEach((sentence, sIdx) => {
    const sentenceLocus = `sentences[${sIdx}]`;

    sentence.numbers.forEach((number, nIdx) => {
      const numberLocus = `${sentenceLocus}.numbers[${nIdx}]`;
      const numberResult = sealNumber(number, numberLocus, store, registry);
      if (numberResult.sealed) {
        sealedNumbers.push({ value: number.value, proof: numberResult.proof });
      } else {
        vetoes.push(numberResult.veto);
      }
    });

    const citationResult = sealCitation(sentence, sentenceLocus, store);
    if (!citationResult.sealed) {
      vetoes.push(citationResult.veto);
    }

    const proseResult = sealProse(sentence, sentenceLocus, policy);
    if (!proseResult.sealed) {
      vetoes.push(proseResult.veto);
    }

    sealedSentences.push({ text: sentence.text, citations: sentence.citations });
  });
  emit(traceId, "sentences", "end", `vetoes=${vetoes.length}`);

  emit(traceId, "tool_calls", "start");
  draft.tool_calls.forEach((call, tIdx) => {
    const toolLocus = `tool_calls[${tIdx}]`;
    const toolResult = sealToolCall(call, toolLocus, policy);
    if (toolResult.sealed) {
      if (toolResult.action !== undefined) {
        proposedActions.push(toolResult.action);
      }
    } else {
      vetoes.push(toolResult.veto);
    }
  });
  emit(traceId, "tool_calls", "end", `proposed_actions=${proposedActions.length}`);

  if (vetoes.length > 0) {
    const outcome: SealOutcome = { sealed: false, vetoes };
    assertSealOutcome(outcome);
    return outcome;
  }

  const outcome: SealOutcome = {
    sealed: true,
    response: {
      sentences: sealedSentences,
      sealed_numbers: sealedNumbers,
      proposed_actions: proposedActions,
    },
  };
  assertSealOutcome(outcome);
  return outcome;
}
