import type { WorkflowInput } from "../types";
import { useProjectStore } from "../../project";
import { DEFAULT_GENERATION_TARGET_RESOLUTION } from "../services/workflowRules";
import { runProcessors } from "./runner";
import { FRONTEND_PREPROCESSORS } from "./preprocessors";
import { throwIfAborted } from "./utils/abort";
import {
  maybeCropVisualFileToAspectRatio,
  normalizeToSupportedProjectAspectRatio,
  probeVisualFileAspectRatio,
} from "./utils/media";
import {
  buildWorkflowInputLookup,
  getNodeInputRequestKey,
} from "../utils/workflowInputs";
import type {
  DerivedMaskMapping,
  FrontendPreprocessContext,
  FrontendPreprocessOptions,
  GenerationRequest,
  SlotValue,
} from "./types";

async function resolveTargetAspectRatio(
  ctx: FrontendPreprocessContext,
): Promise<string> {
  const inputById = buildWorkflowInputLookup(ctx.workflowInputs);
  const maskNodeIds = new Set(
    ctx.derivedMaskMappings.map((mapping) => mapping.maskNodeId),
  );

  const resolveInputFile = (input: WorkflowInput): File | undefined => {
    if (input.inputType === "image") {
      return ctx.imageInputs[getNodeInputRequestKey(input, inputById)];
    }
    if (input.inputType === "video") {
      return ctx.videoInputs[getNodeInputRequestKey(input, inputById)];
    }
    return undefined;
  };

  const probeInputs = async (
    inputs: readonly WorkflowInput[],
  ): Promise<string | null> => {
    for (const input of inputs) {
      if (input.inputType !== "image" && input.inputType !== "video") {
        continue;
      }
      const file = resolveInputFile(input);
      if (!file) continue;

      try {
        const aspectRatio = await probeVisualFileAspectRatio(file);
        if (aspectRatio) return aspectRatio;
      } catch (error) {
        console.warn(
          "[Generation] Failed to probe input aspect ratio",
          input.nodeId,
          error,
        );
      }
    }

    return null;
  };

  const preferredInputs = ctx.workflowInputs.filter(
    (input) => !maskNodeIds.has(input.nodeId),
  );
  const preferredAspectRatio = await probeInputs(preferredInputs);
  if (preferredAspectRatio) {
    return preferredAspectRatio;
  }

  const fallbackAspectRatio = await probeInputs(ctx.workflowInputs);
  return fallbackAspectRatio ?? ctx.projectConfig.aspectRatio;
}

async function cropVisualInputsToAspectRatio(
  ctx: FrontendPreprocessContext,
  targetAspectRatio: string,
): Promise<void> {
  const croppedFiles = new Map<File, Promise<File>>();

  const cropFile = (file: File): Promise<File> => {
    const pending = croppedFiles.get(file);
    if (pending) {
      return pending;
    }

    const nextPending = maybeCropVisualFileToAspectRatio(file, targetAspectRatio);
    croppedFiles.set(file, nextPending);
    return nextPending;
  };

  for (const [key, file] of Object.entries(ctx.imageInputs)) {
    throwIfAborted(ctx.signal);
    ctx.imageInputs[key] = await cropFile(file);
  }

  for (const [key, file] of Object.entries(ctx.videoInputs)) {
    throwIfAborted(ctx.signal);
    ctx.videoInputs[key] = await cropFile(file);
  }
}

/**
 * Builds a {@link FrontendPreprocessContext}, runs all frontend preprocessors,
 * and returns the assembled {@link GenerationRequest}.
 *
 * This is the canonical entry point for frontend preprocessing. The legacy
 * `frontendPreprocess()` in `utils/pipeline.ts` delegates to this function.
 */
export async function runFrontendPreprocess(
  syncedWorkflow: Record<string, unknown> | null,
  workflowId: string | null,
  workflowInputs: WorkflowInput[],
  slotValues: Record<string, SlotValue>,
  clientId: string,
  derivedMaskMappings: DerivedMaskMapping[] = [],
  maskCropDilation?: number,
  options: FrontendPreprocessOptions = {},
  syncedGraphData: Record<string, unknown> | null = null,
): Promise<GenerationRequest> {
  const projectConfig = options.projectConfig ?? useProjectStore.getState().config;

  const ctx: FrontendPreprocessContext = {
    // Inputs
    syncedWorkflow,
    syncedGraphData,
    workflowId,
    workflowInputs,
    slotValues,
    derivedMaskMappings,
    projectConfig: {
      fps: projectConfig.fps,
      aspectRatio: projectConfig.aspectRatio,
    },
    exactAspectRatio: options.exactAspectRatio ?? false,
    targetResolution:
      options.targetResolution ?? DEFAULT_GENERATION_TARGET_RESOLUTION,
    clientId,
    maskCropDilation,
    maskCropMode: options.maskCropMode,
    signal: options.signal,

    // Accumulated outputs
    textInputs: {},
    imageInputs: {},
    videoInputs: {},
  };

  throwIfAborted(ctx.signal);
  await runProcessors(FRONTEND_PREPROCESSORS, ctx);
  throwIfAborted(ctx.signal);
  const requestedTargetAspectRatio = await resolveTargetAspectRatio(ctx);
  const exactAspectRatio = ctx.exactAspectRatio;
  const targetAspectRatio = exactAspectRatio
    ? requestedTargetAspectRatio
    : normalizeToSupportedProjectAspectRatio(requestedTargetAspectRatio) ??
      requestedTargetAspectRatio;
  if (!exactAspectRatio) {
    await cropVisualInputsToAspectRatio(ctx, targetAspectRatio);
  }
  throwIfAborted(ctx.signal);

  return {
    workflow: ctx.syncedWorkflow,
    graphData: ctx.syncedGraphData,
    workflowId: ctx.workflowId,
    targetAspectRatio,
    exactAspectRatio,
    targetResolution: ctx.targetResolution,
    textInputs: ctx.textInputs,
    imageInputs: ctx.imageInputs,
    videoInputs: ctx.videoInputs,
    maskCropDilation:
      ctx.derivedMaskMappings.length > 0 && ctx.maskCropMode !== "full"
        ? ctx.maskCropDilation
        : undefined,
    maskCropMode:
      ctx.derivedMaskMappings.length > 0 ? ctx.maskCropMode : undefined,
    clientId: ctx.clientId,
  };
}
