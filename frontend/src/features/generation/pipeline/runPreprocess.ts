import type { WorkflowInput } from "../types";
import { useProjectStore } from "../../project";
import { DEFAULT_GENERATION_TARGET_RESOLUTION } from "../services/workflowRules";
import { runProcessors } from "./runner";
import { FRONTEND_PREPROCESSORS } from "./preprocessors";
import { throwIfAborted } from "./utils/abort";
import type {
  DerivedMaskMapping,
  FrontendPreprocessContext,
  FrontendPreprocessOptions,
  GenerationRequest,
  SlotValue,
} from "./types";

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
    targetAspectRatio: projectConfig.aspectRatio,
    textInputs: {},
    imageInputs: {},
    audioInputs: {},
    videoInputs: {},
  };

  throwIfAborted(ctx.signal);
  await runProcessors(FRONTEND_PREPROCESSORS, ctx);
  throwIfAborted(ctx.signal);

  return {
    workflow: ctx.syncedWorkflow,
    graphData: ctx.syncedGraphData,
    workflowId: ctx.workflowId,
    targetAspectRatio: ctx.targetAspectRatio,
    exactAspectRatio: ctx.exactAspectRatio,
    targetResolution: ctx.targetResolution,
    textInputs: ctx.textInputs,
    imageInputs: ctx.imageInputs,
    videoInputs: ctx.videoInputs,
    audioInputs: ctx.audioInputs,
    maskCropDilation:
      ctx.derivedMaskMappings.length > 0 && ctx.maskCropMode !== "full"
        ? ctx.maskCropDilation
        : undefined,
    maskCropMode:
      ctx.derivedMaskMappings.length > 0 ? ctx.maskCropMode : undefined,
    clientId: ctx.clientId,
  };
}
