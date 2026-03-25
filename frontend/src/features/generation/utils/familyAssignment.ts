import type {
  Asset,
  AssetFamily,
  GeneratedCreationInput,
} from "../../../types/Asset";
import {
  computeXxhash64Bytes,
  computeXxhash64String,
} from "../../../shared/utils/xxhash";
import { getAssetById } from "../../userAssets/publicApi";
import type { SlotValue } from "../pipeline/types";
import type { WorkflowInput } from "../types";
import {
  buildWorkflowInputLookup,
  getNodeInputRequestKey,
  getWorkflowInputId,
  getWorkflowInputValue,
} from "./workflowInputs";
import { buildWorkflowStructureSignature } from "./workflowNodeSignature";

interface BuildGenerationFamilyHashOptions {
  workflow: Record<string, unknown> | null | undefined;
  workflowInputs: WorkflowInput[];
  slotValues: Record<string, SlotValue>;
  generationInputs: GeneratedCreationInput[];
}

const AUTO_FAMILY_HASH_PREFIX = "generation-family:v1:";

function stableSerialize(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));

    return `{${entries
      .map(
        ([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`,
      )
      .join(",")}}`;
  }

  return JSON.stringify(String(value));
}

function buildGeneratedInputLookup(
  generationInputs: readonly GeneratedCreationInput[],
): Map<string, GeneratedCreationInput> {
  return new Map(
    generationInputs.map((generationInput) => [generationInput.nodeId, generationInput]),
  );
}

async function buildExternalFileSignature(file: File): Promise<string> {
  return computeXxhash64Bytes(new Uint8Array(await file.arrayBuffer()));
}

async function buildMediaInputDescriptor(
  workflowInput: WorkflowInput,
  workflowInputLookup: ReadonlyMap<string, WorkflowInput>,
  slotValue: SlotValue | undefined,
  generationInput: GeneratedCreationInput | undefined,
): Promise<Record<string, unknown> | null> {
  if (!slotValue) {
    return null;
  }

  if (generationInput?.kind === "draggedAsset") {
    const asset = getAssetById(generationInput.parentAssetId);
    if (!asset) {
      return {
        key: getNodeInputRequestKey(workflowInput, workflowInputLookup),
        kind: "asset",
        parentAssetId: generationInput.parentAssetId,
      };
    }

    return {
      key: getNodeInputRequestKey(workflowInput, workflowInputLookup),
      kind: "asset",
      hash: asset.hash,
    };
  }

  if (generationInput?.kind === "timelineSelection") {
    return {
      key: getNodeInputRequestKey(workflowInput, workflowInputLookup),
      kind: "timelineSelection",
      selection: generationInput.timelineSelection,
    };
  }

  if (slotValue.type === "image" || slotValue.type === "video") {
    return {
      key: getNodeInputRequestKey(workflowInput, workflowInputLookup),
      kind: slotValue.type,
      hash: await buildExternalFileSignature(slotValue.file),
    };
  }

  if (slotValue.type === "video_selection") {
    return {
      key: getNodeInputRequestKey(workflowInput, workflowInputLookup),
      kind: "timelineSelection",
      selection: slotValue.selection,
    };
  }

  return null;
}

export async function buildGenerationFamilyHash(
  options: BuildGenerationFamilyHashOptions,
): Promise<string | null> {
  const workflowStructure = buildWorkflowStructureSignature(options.workflow);
  if (!workflowStructure) {
    return null;
  }

  const workflowInputLookup = buildWorkflowInputLookup(options.workflowInputs);
  const generationInputLookup = buildGeneratedInputLookup(options.generationInputs);
  const textInputs: Array<{ key: string; value: string }> = [];
  const mediaInputs: Record<string, unknown>[] = [];

  const sortedInputs = [...options.workflowInputs].sort((left, right) =>
    getWorkflowInputId(left).localeCompare(getWorkflowInputId(right)),
  );

  for (const workflowInput of sortedInputs) {
    if (workflowInput.inputType === "text") {
      const slotValue = getWorkflowInputValue(
        options.slotValues,
        workflowInput,
        workflowInputLookup,
      );
      if (!slotValue || slotValue.type !== "text") {
        continue;
      }

      textInputs.push({
        key: getNodeInputRequestKey(workflowInput, workflowInputLookup),
        value: slotValue.value,
      });
      continue;
    }

    const slotValue = getWorkflowInputValue(
      options.slotValues,
      workflowInput,
      workflowInputLookup,
    );
    const mediaDescriptor = await buildMediaInputDescriptor(
      workflowInput,
      workflowInputLookup,
      slotValue,
      generationInputLookup.get(workflowInput.nodeId),
    );
    if (mediaDescriptor) {
      mediaInputs.push(mediaDescriptor);
    }
  }

  const signaturePayload = stableSerialize({
    workflowStructure,
    textInputs,
    mediaInputs,
  });

  return `${AUTO_FAMILY_HASH_PREFIX}${await computeXxhash64String(
    signaturePayload,
  )}`;
}

export function resolveFamilyForGenerationHash(
  assets: readonly Asset[],
  familyHash: string | null | undefined,
): AssetFamily | undefined {
  if (!familyHash) {
    return undefined;
  }

  const matchingFamily = assets.find((asset) =>
    asset.family?.hashes?.includes(familyHash),
  )?.family;

  if (!matchingFamily) {
    return {
      uuid: crypto.randomUUID(),
      hashes: [familyHash],
    };
  }

  const hashes = new Set(matchingFamily.hashes ?? []);
  hashes.add(familyHash);

  return {
    uuid: matchingFamily.uuid,
    hashes: [...hashes].sort((left, right) => left.localeCompare(right)),
  };
}
