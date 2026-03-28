import { assetMatchesType } from "../../../shared/utils/assetTypeDetection";
import type { GenerationMediaInputValue, WorkflowInput } from "../types";
import {
  buildWorkflowInputLookup,
  getWorkflowInputId,
  getWorkflowInputValue,
} from "./workflowInputs";

type MediaInputType = Exclude<WorkflowInput["inputType"], "text">;

type CarryoverValueMap<T> = Readonly<Record<string, T>>;

function normalizeLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildLabelClassParamSignature(input: WorkflowInput): string {
  return [
    normalizeLabel(input.label),
    input.classType.trim().toLowerCase(),
    input.param.trim().toLowerCase(),
  ].join("|");
}

function buildClassParamSignature(input: WorkflowInput): string {
  return [
    input.classType.trim().toLowerCase(),
    input.param.trim().toLowerCase(),
  ].join("|");
}

function buildCarryoverMatches(
  previousInputs: readonly WorkflowInput[],
  nextInputs: readonly WorkflowInput[],
  canUseDirect: (input: WorkflowInput) => boolean,
  canUseHeuristic: (input: WorkflowInput) => boolean,
): Map<string, string> {
  const previousInputLookup = buildWorkflowInputLookup(previousInputs);
  const usedPreviousIds = new Set<string>();
  const matches = new Map<string, string>();

  const assign = (nextInput: WorkflowInput, previousInput: WorkflowInput) => {
    const nextId = getWorkflowInputId(nextInput);
    const previousId = getWorkflowInputId(previousInput);
    matches.set(nextId, previousId);
    usedPreviousIds.add(previousId);
  };

  const resolveUnmatchedCandidates = (
    nextInput: WorkflowInput,
    predicate: (input: WorkflowInput) => boolean,
  ): WorkflowInput[] =>
    previousInputs.filter((previousInput) => {
      const previousId = getWorkflowInputId(previousInput);
      return (
        !usedPreviousIds.has(previousId) &&
        previousInput.inputType === nextInput.inputType &&
        predicate(previousInput)
      );
    });

  for (const nextInput of nextInputs) {
    const directCandidates = [
      previousInputLookup.get(getWorkflowInputId(nextInput)),
      previousInputLookup.get(nextInput.nodeId),
    ]
      .filter((candidate): candidate is WorkflowInput => Boolean(candidate))
      .filter(
        (candidate, index, candidates) =>
          candidates.findIndex(
            (entry) => getWorkflowInputId(entry) === getWorkflowInputId(candidate),
          ) === index,
      )
      .filter(
        (candidate) =>
          candidate.inputType === nextInput.inputType &&
          !usedPreviousIds.has(getWorkflowInputId(candidate)) &&
          canUseDirect(candidate),
      );

    if (directCandidates.length === 1) {
      assign(nextInput, directCandidates[0]);
    }
  }

  const heuristicSignaturePasses = [
    buildLabelClassParamSignature,
    (input: WorkflowInput) => normalizeLabel(input.label),
    buildClassParamSignature,
  ];

  for (const signatureForInput of heuristicSignaturePasses) {
    for (const nextInput of nextInputs) {
      if (matches.has(getWorkflowInputId(nextInput))) {
        continue;
      }

      const nextSignature = signatureForInput(nextInput);
      if (!nextSignature) {
        continue;
      }

      const candidates = resolveUnmatchedCandidates(
        nextInput,
        (previousInput) =>
          canUseHeuristic(previousInput) &&
          signatureForInput(previousInput) === nextSignature,
      );

      if (candidates.length === 1) {
        assign(nextInput, candidates[0]);
      }
    }
  }

  const inputTypes: WorkflowInput["inputType"][] = ["text", "image", "video"];
  for (const inputType of inputTypes) {
    const remainingNextInputs = nextInputs.filter(
      (input) =>
        input.inputType === inputType && !matches.has(getWorkflowInputId(input)),
    );
    const remainingPreviousInputs = previousInputs.filter((input) => {
      const previousId = getWorkflowInputId(input);
      return (
        input.inputType === inputType &&
        !usedPreviousIds.has(previousId) &&
        canUseHeuristic(input)
      );
    });

    if (remainingNextInputs.length === 1 && remainingPreviousInputs.length === 1) {
      assign(remainingNextInputs[0], remainingPreviousInputs[0]);
    }
  }

  return matches;
}

function textInputDefaultValue(input: WorkflowInput): string {
  return typeof input.currentValue === "string" ? input.currentValue : "";
}

function isDirectCompatibleMediaValue(
  inputType: MediaInputType,
  value: GenerationMediaInputValue | null | undefined,
): value is GenerationMediaInputValue {
  if (!value) {
    return false;
  }

  if (inputType === "image") {
    return (
      value.kind === "frame" ||
      (value.kind === "asset" && assetMatchesType(value.asset, "image"))
    );
  }

  return (
    (value.kind === "asset" && assetMatchesType(value.asset, "video")) ||
    value.kind === "timelineSelection"
  );
}

function isHeuristicCompatibleMediaValue(
  inputType: MediaInputType,
  value: GenerationMediaInputValue | null | undefined,
): value is GenerationMediaInputValue {
  if (!isDirectCompatibleMediaValue(inputType, value)) {
    return false;
  }

  if (value.kind !== "timelineSelection") {
    return true;
  }

  return value.preparedVideoFile !== null && !value.isExtracting;
}

export function carryOverTextValues(
  previousInputs: readonly WorkflowInput[],
  previousValues: CarryoverValueMap<string>,
  nextInputs: readonly WorkflowInput[],
): Record<string, string> {
  const previousTextInputs = previousInputs.filter(
    (input) => input.inputType === "text",
  );
  const nextTextInputs = nextInputs.filter((input) => input.inputType === "text");
  const previousInputLookup = buildWorkflowInputLookup(previousTextInputs);
  const previousValuesById = new Map<string, string>();

  for (const input of previousTextInputs) {
    const value = getWorkflowInputValue(previousValues, input, previousInputLookup);
    if (typeof value === "string") {
      previousValuesById.set(getWorkflowInputId(input), value);
    }
  }

  const matches = buildCarryoverMatches(
    previousTextInputs,
    nextTextInputs,
    (input) => previousValuesById.has(getWorkflowInputId(input)),
    (input) => {
      const value = previousValuesById.get(getWorkflowInputId(input));
      return typeof value === "string" && value.trim().length > 0;
    },
  );

  return Object.fromEntries(
    nextTextInputs.map((input) => {
      const nextId = getWorkflowInputId(input);
      const matchedPreviousId = matches.get(nextId);
      return [
        nextId,
        matchedPreviousId
          ? (previousValuesById.get(matchedPreviousId) ?? textInputDefaultValue(input))
          : textInputDefaultValue(input),
      ];
    }),
  );
}

export function carryOverMediaInputs(
  previousInputs: readonly WorkflowInput[],
  previousValues: CarryoverValueMap<GenerationMediaInputValue | null>,
  nextInputs: readonly WorkflowInput[],
): Record<string, GenerationMediaInputValue | null> {
  const previousMediaInputs = previousInputs.filter(
    (input): input is WorkflowInput & { inputType: MediaInputType } =>
      input.inputType !== "text",
  );
  const nextMediaInputs = nextInputs.filter(
    (input): input is WorkflowInput & { inputType: MediaInputType } =>
      input.inputType !== "text",
  );
  const previousInputLookup = buildWorkflowInputLookup(previousMediaInputs);
  const previousValuesById = new Map<string, GenerationMediaInputValue>();

  for (const input of previousMediaInputs) {
    const value = getWorkflowInputValue(previousValues, input, previousInputLookup);
    if (isDirectCompatibleMediaValue(input.inputType, value)) {
      previousValuesById.set(getWorkflowInputId(input), value);
    }
  }

  const matches = buildCarryoverMatches(
    previousMediaInputs,
    nextMediaInputs,
    (input) =>
      isDirectCompatibleMediaValue(
        input.inputType,
        previousValuesById.get(getWorkflowInputId(input)),
      ),
    (input) =>
      isHeuristicCompatibleMediaValue(
        input.inputType,
        previousValuesById.get(getWorkflowInputId(input)),
      ),
  );

  return Object.fromEntries(
    nextMediaInputs.flatMap((input) => {
      const nextId = getWorkflowInputId(input);
      const matchedPreviousId = matches.get(nextId);
      if (!matchedPreviousId) {
        return [];
      }

      const value = previousValuesById.get(matchedPreviousId);
      if (!value) {
        return [];
      }

      return [[nextId, value]];
    }),
  );
}
