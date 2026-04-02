import type {
  MaskTimelineClip,
  TimelineSelection,
} from "../../../types/TimelineTypes";
import {
  ExportRenderer,
  buildProjectRenderInputs,
  createBinaryMaskOutputFilter,
  createFilterStackTransform,
  createNonBinaryMaskOutputColorMatrixFilter,
  createTransparentAreaNeutralGrayOutputColorMatrixFilter,
  type MaskOutputSource,
  renderProjectFrameFileAtTick,
} from "../../renderer";
import {
  getTicksPerFrame,
  resolveSelectionFps,
  resolveSelectionFrameStep,
  snapFrameCountToStep,
} from "../../timelineSelection";
import {
  DEFAULT_DERIVED_MASK_SOURCE_VIDEO_TREATMENT,
  type DerivedMaskSourceVideoTreatment,
} from "../derivedMaskVideoTreatment";
import type { DerivedMaskType } from "../pipeline/types";
import {
  createGenerationAbortError,
  throwIfAborted,
} from "../pipeline/utils/abort";

export async function captureFramePngAtTick(
  tick: number,
  filenamePrefix: string,
): Promise<File> {
  return renderProjectFrameFileAtTick(tick, {
    filenamePrefix,
    mimeType: "image/png",
  });
}

export async function renderTimelineSelectionToWebm(
  timelineSelection: TimelineSelection,
  options: { signal?: AbortSignal } = {},
): Promise<File> {
  throwIfAborted(options.signal);
  const { exportConfig, projectData } = buildProjectRenderInputs();

  const renderer = await ExportRenderer.create(exportConfig);
  try {
    const result = await renderer.render(projectData, exportConfig, () => {}, {
      timelineSelection,
      format: "webm",
      signal: options.signal,
    });
    throwIfAborted(options.signal);

    return new File([result.video], `generation-selection-${Date.now()}.webm`, {
      type: "video/webm",
      lastModified: Date.now(),
    });
  } catch (error) {
    if (options.signal?.aborted && error instanceof Error) {
      throw createGenerationAbortError(error.message);
    }
    throw error;
  }
}

export interface TimelineSelectionWithMaskResult {
  video: File;
  mask: File;
}

function resolveSelectionMaskClips(
  timelineSelection: TimelineSelection,
): MaskTimelineClip[] {
  return timelineSelection.clips.filter(
    (clip): clip is MaskTimelineClip => clip.type === "mask",
  );
}

function selectionHasActiveTimelineMasks(
  timelineSelection: TimelineSelection,
): boolean {
  const maskClipsById = new Map(
    resolveSelectionMaskClips(timelineSelection).map(
      (clip) => [clip.id, clip] as const,
    ),
  );

  return timelineSelection.clips.some((clip) => {
    if (clip.type === "mask") return false;

    return (clip.clipComponents ?? []).some((component) => {
      if (component.componentType !== "mask") return false;
      const maskClip = maskClipsById.get(component.clipId);
      return maskClip?.maskMode === "apply";
    });
  });
}

function createMaskFilter(
  maskType: DerivedMaskType,
  source: MaskOutputSource = "alpha",
) {
  switch (maskType) {
    case "binary":
      return createBinaryMaskOutputFilter(source);
    case "soft":
      return createNonBinaryMaskOutputColorMatrixFilter(source);
  }
}

function createVideoTreatmentFilter(
  treatment: DerivedMaskSourceVideoTreatment,
) {
  switch (treatment) {
    case "fill_transparent_with_neutral_gray":
      return createTransparentAreaNeutralGrayOutputColorMatrixFilter();
    case "preserve_transparency":
    case "remove_transparency":
      return null;
  }
}

function createVideoOutputDefinition(
  treatment: DerivedMaskSourceVideoTreatment,
) {
  const filter = createVideoTreatmentFilter(treatment);

  return {
    id: "video",
    format: "webm" as const,
    includeAudio: true,
    preserveAlpha: treatment === "preserve_transparency",
    ...(filter
      ? {
          transformStack: [createFilterStackTransform([filter])],
        }
      : {}),
  };
}

function createMaskOutputDefinition(
  maskType: DerivedMaskType,
  source: MaskOutputSource = "alpha",
) {
  return {
    id: "mask",
    format: "webm" as const,
    includeAudio: false,
    preserveAlpha: false,
    bitrate: 20_000_000,
    transformStack: [
      createFilterStackTransform([createMaskFilter(maskType, source)]),
    ],
  };
}

interface RenderTimelineSelectionToWebmWithMaskOptions {
  signal?: AbortSignal;
  videoTreatment?: DerivedMaskSourceVideoTreatment;
}

export async function renderTimelineSelectionToWebmWithMask(
  timelineSelection: TimelineSelection,
  maskType: DerivedMaskType = "binary",
  options: RenderTimelineSelectionToWebmWithMaskOptions = {},
): Promise<TimelineSelectionWithMaskResult> {
  throwIfAborted(options.signal);
  const { exportConfig, projectData } = buildProjectRenderInputs();
  const videoTreatment =
    options.videoTreatment ?? DEFAULT_DERIVED_MASK_SOURCE_VIDEO_TREATMENT;
  try {
    const hasActiveTimelineMasks =
      selectionHasActiveTimelineMasks(timelineSelection);
    const maskOutputSource: MaskOutputSource = hasActiveTimelineMasks
      ? "red"
      : "alpha";
    const maskOutput = createMaskOutputDefinition(maskType, maskOutputSource);
    let videoBlob: Blob;
    let maskBlob: Blob | undefined;
    const shouldRenderMaskSeparately =
      videoTreatment === "remove_transparency" || hasActiveTimelineMasks;

    if (shouldRenderMaskSeparately) {
      // Timeline-mask exports need a dedicated mask-only render pass so the
      // workflow mask comes from the composed mask layer rather than inferred
      // scene transparency. We also keep the old separate-pass behavior for
      // remove_transparency, where the video payload intentionally ignores
      // timeline masking.
      const maskRenderer = await ExportRenderer.create(exportConfig);
      const maskResult = await maskRenderer.render(
        projectData,
        exportConfig,
        () => {},
        {
          timelineSelection,
          outputs: [maskOutput],
          renderKind: hasActiveTimelineMasks ? "mask" : "scene",
          signal: options.signal,
        },
      );
      maskBlob = maskResult.outputs.mask ?? maskResult.mask ?? maskResult.video;
      throwIfAborted(options.signal);

      const videoRenderer = await ExportRenderer.create(exportConfig);
      const videoResult = await videoRenderer.render(
        projectData,
        exportConfig,
        () => {},
        {
          timelineSelection,
          outputs: [createVideoOutputDefinition(videoTreatment)],
          includeTimelineMasks:
            videoTreatment === "remove_transparency" ? false : undefined,
          signal: options.signal,
        },
      );
      videoBlob = videoResult.outputs.video ?? videoResult.video;
    } else {
      const renderer = await ExportRenderer.create(exportConfig);
      const result = await renderer.render(projectData, exportConfig, () => {}, {
        timelineSelection,
        outputs: [
          createVideoOutputDefinition(videoTreatment),
          maskOutput,
        ],
        signal: options.signal,
      });
      videoBlob = result.outputs.video ?? result.video;
      maskBlob = result.outputs.mask ?? result.mask;
    }

    throwIfAborted(options.signal);
    if (!maskBlob) {
      throw new Error("Mask output was requested but not produced");
    }

    const now = Date.now();
    return {
      video: new File([videoBlob], `generation-selection-${now}.webm`, {
        type: "video/webm",
        lastModified: now,
      }),
      mask: new File([maskBlob], `generation-selection-mask-${now}.webm`, {
        type: "video/webm",
        lastModified: now,
      }),
    };
  } catch (error) {
    if (options.signal?.aborted && error instanceof Error) {
      throw createGenerationAbortError(error.message);
    }
    throw error;
  }
}

export async function renderTimelineSelectionToFrameBatch(
  timelineSelection: TimelineSelection,
  fps: number,
  options: { frameStep?: number; maxFrames?: number } = {},
): Promise<File[]> {
  const clampedFps = resolveSelectionFps(timelineSelection, fps);
  const frameStep = resolveSelectionFrameStep({
    frameStep:
      timelineSelection.frameStep && timelineSelection.frameStep > 1
        ? timelineSelection.frameStep
        : options.frameStep ?? timelineSelection.frameStep,
  });
  const ticksPerFrame = getTicksPerFrame(clampedFps);
  const startTick = timelineSelection.start;
  const requestedEndTick = Math.max(
    startTick + ticksPerFrame,
    timelineSelection.end ?? startTick + ticksPerFrame,
  );
  const rawFrameCount = Math.max(
    1,
    Math.ceil((requestedEndTick - startTick) / ticksPerFrame),
  );
  let frameCount = snapFrameCountToStep(rawFrameCount, frameStep, "floor");
  const maxFrames =
    typeof options.maxFrames === "number" &&
    Number.isFinite(options.maxFrames) &&
    options.maxFrames > 0
      ? Math.max(1, Math.round(options.maxFrames))
      : null;
  if (maxFrames !== null) {
    frameCount = snapFrameCountToStep(
      Math.min(frameCount, maxFrames),
      frameStep,
      "floor",
    );
  }

  const frames: File[] = [];

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const tick = startTick + frameIndex * ticksPerFrame;
    const frame = await captureFramePngAtTick(
      tick,
      `generation-selection-frame-${frameIndex}`,
    );
    frames.push(frame);
  }

  if (frames.length === 0) {
    frames.push(
      await captureFramePngAtTick(startTick, "generation-selection-frame-0"),
    );
  }

  return frames;
}
