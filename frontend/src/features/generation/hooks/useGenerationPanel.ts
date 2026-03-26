import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { SelectChangeEvent, ChipProps } from "@mui/material";
import type { Asset } from "../../../types/Asset";
import { useExtractStore } from "../../player/useExtractStore";
import { usePlayerStore } from "../../player/usePlayerStore";
import { playbackClock } from "../../player/services/PlaybackClock";
import { TICKS_PER_SECOND, insertAssetAtTime } from "../../timeline";
import {
  createPointTimelineSelection,
  createTimelineSelection,
  getDefaultSelectionEnd,
  getTimelineSelectionFromAsset,
  useTimelineSelectionStore,
} from "../../timelineSelection";
import { useGenerationStore } from "../useGenerationStore";
import { useProjectStore } from "../../project";
import type {
  GenerationMediaInputValue,
  WorkflowSelectionConfig,
  WorkflowWidgetInput,
} from "../types";
import type { SlotValue } from "../utils/pipeline";
import {
  captureFramePngAtTick,
  renderTimelineSelectionToWebm,
  renderTimelineSelectionToWebmWithMask,
} from "../utils/inputSelection";
import { resolveWidgetInputs } from "../store/workflowState";
import {
  DEFAULT_DERIVED_MASK_SOURCE_VIDEO_TREATMENT,
  resolveDerivedMaskVideoTreatments,
} from "../derivedMaskVideoTreatment";
import { addLocalAsset, useAssetStore } from "../../userAssets";
import {
  findWorkflowInputValidationFailures,
} from "../services/workflowRules";
import {
  buildWorkflowInputLookup,
  getWorkflowInputId,
  getWorkflowInputValue,
  resolveWorkflowInputKeys,
} from "../utils/workflowInputs";
import { resolveExistingAssetForExternalDrop } from "../utils/externalDropAsset";

function hasInputValue(
  inputType: "image" | "video",
  value: GenerationMediaInputValue | null | undefined,
): boolean {
  if (!value) return false;

  if (inputType === "image") {
    if (value.kind === "asset") {
      return value.asset.type === "image" && Boolean(value.asset.file);
    }
    return value.kind === "frame";
  }

  if (value.kind === "asset") {
    return value.asset.type === "video" && Boolean(value.asset.file);
  }
  return (
    value.kind === "timelineSelection" &&
    value.preparedVideoFile !== null &&
    !value.isExtracting
  );
}

function applySelectionConfigDefaults(
  selection: ReturnType<typeof createTimelineSelection>,
  config: WorkflowSelectionConfig | undefined,
): ReturnType<typeof createTimelineSelection> {
  const next = { ...selection };

  if (
    (typeof next.frameStep !== "number" || next.frameStep <= 0) &&
    typeof config?.frameStep === "number" &&
    Number.isFinite(config.frameStep) &&
    config.frameStep > 0
  ) {
    next.frameStep = Math.max(1, Math.round(config.frameStep));
  }

  return next;
}

function setNodeParamValue(
  current: Record<string, Record<string, unknown>>,
  nodeId: string,
  param: string,
  value: unknown,
): Record<string, Record<string, unknown>> {
  return {
    ...current,
    [nodeId]: { ...(current[nodeId] ?? {}), [param]: value },
  };
}

function parseStoredWidgetValue(
  widget: WorkflowWidgetInput,
  storedValue: string,
): unknown {
  const valueType = widget.config.valueType;
  const fallbackValue = widget.currentValue;

  if (
    valueType === "int" ||
    valueType === "float" ||
    typeof fallbackValue === "number"
  ) {
    const parsed = Number(storedValue);
    return Number.isFinite(parsed) ? parsed : fallbackValue;
  }

  if (valueType === "boolean" || typeof fallbackValue === "boolean") {
    if (storedValue === "true") {
      return true;
    }
    if (storedValue === "false") {
      return false;
    }
    return fallbackValue;
  }

  return storedValue;
}

export function useGenerationPanel() {
  const [editorOpen, setEditorOpen] = useState(false);
  const [urlAnchorEl, setUrlAnchorEl] = useState<null | HTMLElement>(null);
  const [urlInput, setUrlInput] = useState("");

  // Slot values keyed by workflow input ID
  const [textValues, setTextValues] = useState<Record<string, string>>({});

  // Widget state
  const [widgetValues, setWidgetValues] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const widgetValuesRef = useRef<Record<string, Record<string, unknown>>>({});
  const [randomizeToggles, setRandomizeToggles] = useState<
    Record<string, boolean>
  >({});

  const connectionStatus = useGenerationStore((s) => s.connectionStatus);
  const runtimeStatus = useGenerationStore((s) => s.runtimeStatus);
  const runtimeStatusError = useGenerationStore((s) => s.runtimeStatusError);
  const latestPreviewUrl = useGenerationStore((s) => s.latestPreviewUrl);
  const previewAnimation = useGenerationStore((s) => s.previewAnimation);
  const comfyuiDirectUrl = useGenerationStore((s) => s.comfyuiDirectUrl);
  const workflowInputs = useGenerationStore((s) => s.workflowInputs);
  const mediaInputs = useGenerationStore((s) => s.mediaInputs);
  const activeJobId = useGenerationStore((s) => s.activeJobId);
  const jobs = useGenerationStore((s) => s.jobs);
  const pipelineStatus = useGenerationStore((s) => s.pipelineStatus);
  const queuedGenerationCount = useGenerationStore(
    (s) => s.generationQueue.length,
  );
  const postprocessingCount = useGenerationStore(
    (s) => s.postprocessingJobIds.length,
  );
  const clearGenerationQueue = useGenerationStore((s) => s.clearGenerationQueue);
  const interruptCurrentGeneration = useGenerationStore(
    (s) => s.interruptCurrentGeneration,
  );
  const availableWorkflows = useGenerationStore((s) => s.availableWorkflows);
  const selectedWorkflowId = useGenerationStore((s) => s.selectedWorkflowId);
  const isWorkflowLoading = useGenerationStore((s) => s.isWorkflowLoading);
  const isWorkflowReady = useGenerationStore((s) => s.isWorkflowReady);
  const workflowLoadError = useGenerationStore((s) => s.workflowLoadError);
  const workflowWarning = useGenerationStore((s) => s.workflowWarning);
  const hasInferredInputs = useGenerationStore((s) => s.hasInferredInputs);
  const derivedMaskMappings = useGenerationStore((s) => s.derivedMaskMappings);
  const workflowRuleWarnings = useGenerationStore(
    (s) => s.workflowRuleWarnings,
  );
  const loadWorkflow = useGenerationStore((s) => s.loadWorkflow);
  const setWorkflowLoadState = useGenerationStore(
    (s) => s.setWorkflowLoadState,
  );
  const clearWorkflowWarning = useGenerationStore(
    (s) => s.clearWorkflowWarning,
  );
  const clearWorkflowLoadError = useGenerationStore(
    (s) => s.clearWorkflowLoadError,
  );
  const refreshRuntimeStatus = useGenerationStore((s) => s.refreshRuntimeStatus);
  const queueGeneration = useGenerationStore((s) => s.queueGeneration);
  const fetchWorkflows = useGenerationStore((s) => s.fetchWorkflows);
  const setMediaInputAsset = useGenerationStore((s) => s.setMediaInputAsset);
  const setMediaInputFrameWithSelection = useGenerationStore(
    (s) => s.setMediaInputFrameWithSelection,
  );
  const setMediaInputTimelineSelection = useGenerationStore(
    (s) => s.setMediaInputTimelineSelection,
  );
  const clearMediaInput = useGenerationStore((s) => s.clearMediaInput);
  const pendingReplayPanelState = useGenerationStore(
    (s) => s.pendingReplayPanelState,
  );
  const clearPendingReplayPanelState = useGenerationStore(
    (s) => s.clearPendingReplayPanelState,
  );
  const selectionExtractionRequestIdsRef = useRef<Record<string, number>>({});

  const activeJob = activeJobId ? (jobs.get(activeJobId) ?? null) : null;

  // Memoize lastCompletedJob calculation to avoid running on every render
  const lastCompletedJob = useGenerationStore((s) => {
    let latest: ReturnType<typeof s.jobs.get> = undefined;
    for (const job of s.jobs.values()) {
      if (
        (job.status === "completed" || job.status === "error") &&
        (!latest || job.submittedAt > latest.submittedAt)
      ) {
        latest = job;
      }
    }
    return latest;
  });

  const displayJob = activeJob ?? lastCompletedJob;

  // Resolve widget inputs from the synced workflow + active rules
  const syncedWorkflow = useGenerationStore((s) => s.syncedWorkflow);
  const activeWorkflowRules = useGenerationStore((s) => s.activeWorkflowRules);
  const lastAppliedWidgetValues = useGenerationStore(
    (s) => s.lastAppliedWidgetValues,
  );
  const widgetInputs = useMemo(
    () => resolveWidgetInputs(syncedWorkflow, activeWorkflowRules),
    [syncedWorkflow, activeWorkflowRules],
  );
  const workflowInputById = useMemo(
    () => buildWorkflowInputLookup(workflowInputs),
    [workflowInputs],
  );
  const derivedMaskVideoTreatmentBySourceNodeId = useMemo(
    () =>
      resolveDerivedMaskVideoTreatments(
        derivedMaskMappings,
        widgetInputs,
        widgetValues,
      ),
    [derivedMaskMappings, widgetInputs, widgetValues],
  );

  useEffect(() => {
    widgetValuesRef.current = widgetValues;
  }, [widgetValues]);

  useEffect(() => {
    setTextValues((prev) => {
      const next: Record<string, string> = {};
      let changed = false;
      for (const input of workflowInputs) {
        if (input.inputType !== "text") continue;
        const inputId = getWorkflowInputId(input);
        const existing = getWorkflowInputValue(prev, input, workflowInputById);
        if (typeof existing === "string") {
          next[inputId] = existing;
          continue;
        }
        const initialValue =
          typeof input.currentValue === "string" ? input.currentValue : "";
        next[inputId] = initialValue;
      }

      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) {
        changed = true;
      } else {
        changed = prevKeys.some((key) => prev[key] !== next[key]);
      }
      return changed ? next : prev;
    });
  }, [workflowInputById, workflowInputs]);

  // Initialize widget values and randomize toggles when widget inputs change
  useEffect(() => {
    const nextValues: Record<string, Record<string, unknown>> = {};
    const nextToggles: Record<string, boolean> = {};
    for (const w of widgetInputs) {
      if (!nextValues[w.nodeId]) nextValues[w.nodeId] = {};
      nextValues[w.nodeId][w.param] = w.currentValue;
      if (w.config.controlAfterGenerate) {
        const key = `${w.nodeId}:${w.param}`;
        // Preserve existing toggle state, fall back to workflow's saved mode
        nextToggles[key] = randomizeToggles[key] ?? w.config.defaultRandomize ?? true;
      }
    }
    widgetValuesRef.current = nextValues;
    setWidgetValues(nextValues);
    setRandomizeToggles((prev) => ({ ...prev, ...nextToggles }));
    // Only re-run when widgetInputs identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetInputs]);

  // Sync displayed widget values to exactly what the backend applied.
  useEffect(() => {
    const entries = Object.entries(lastAppliedWidgetValues);
    if (entries.length === 0) return;
    setWidgetValues((prev) => {
      const next = { ...prev };
      for (const [key, applied] of entries) {
        const sep = key.lastIndexOf(":");
        if (sep <= 0 || sep >= key.length - 1) continue;
        const nodeId = key.slice(0, sep);
        const param = key.slice(sep + 1);
        next[nodeId] = { ...(next[nodeId] ?? {}), [param]: applied };
      }
      widgetValuesRef.current = next;
      return next;
    });
  }, [lastAppliedWidgetValues]);

  useEffect(() => {
    if (!pendingReplayPanelState) {
      return;
    }

    setTextValues((prev) => {
      const next = { ...prev };
      for (const input of workflowInputs) {
        if (input.inputType !== "text") {
          continue;
        }
        const inputId = getWorkflowInputId(input);
        if (
          Object.prototype.hasOwnProperty.call(
            pendingReplayPanelState.textValues,
            inputId,
          )
        ) {
          next[inputId] = pendingReplayPanelState.textValues[inputId] ?? "";
        }
      }
      return next;
    });

    if (
      Object.keys(pendingReplayPanelState.widgetValues).length > 0 ||
      Object.keys(pendingReplayPanelState.derivedWidgetValues).length > 0
    ) {
      const nextWidgetValues: Record<string, Record<string, unknown>> = {};

      for (const widget of widgetInputs) {
        if (!nextWidgetValues[widget.nodeId]) {
          nextWidgetValues[widget.nodeId] = {};
        }

        let restoredValue: unknown = widget.currentValue;
        if (widget.kind === "derived") {
          const replayKey = `derived_widget_${widget.derivedWidgetId}`;
          const storedValue =
            pendingReplayPanelState.derivedWidgetValues[replayKey];
          if (typeof storedValue === "string") {
            restoredValue = parseStoredWidgetValue(widget, storedValue);
          }
        } else {
          const replayKey = `widget_${widget.nodeId}_${widget.param}`;
          const storedValue = pendingReplayPanelState.widgetValues[replayKey];
          if (typeof storedValue === "string") {
            restoredValue = parseStoredWidgetValue(widget, storedValue);
          }
        }

        nextWidgetValues[widget.nodeId][widget.param] = restoredValue;
      }

      widgetValuesRef.current = nextWidgetValues;
      setWidgetValues(nextWidgetValues);
    }

    if (Object.keys(pendingReplayPanelState.widgetModes).length > 0) {
      setRandomizeToggles((prev) => {
        const next = { ...prev };
        for (const widget of widgetInputs) {
          if (!widget.config.controlAfterGenerate) {
            continue;
          }
          const replayKey = `widget_mode_${widget.nodeId}_${widget.param}`;
          const restoredMode = pendingReplayPanelState.widgetModes[replayKey];
          if (!restoredMode) {
            continue;
          }
          next[`${widget.nodeId}:${widget.param}`] =
            restoredMode === "randomize";
        }
        return next;
      });
    }
  }, [pendingReplayPanelState, widgetInputs, workflowInputs]);

  useEffect(() => {
    const store = useGenerationStore.getState();
    store.connect();
    void store.refreshRuntimeStatus();

    const intervalId = window.setInterval(() => {
      const current = useGenerationStore.getState();
      if (
        current.connectionStatus !== "connected" ||
        current.workflowLoadError !== null
      ) {
        void current.refreshRuntimeStatus();
      }
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const handleGenerate = useCallback(async (count = 1) => {
    const store = useGenerationStore.getState();
    const currentWidgetValues = widgetValuesRef.current;
    const currentDerivedMaskVideoTreatmentBySourceNodeId =
      resolveDerivedMaskVideoTreatments(
        derivedMaskMappings,
        widgetInputs,
        currentWidgetValues,
      );

    if (store.connectionStatus !== "connected") {
      store.connect();
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Build slot values from current UI state
    const slotValues: Record<string, SlotValue> = {};

    for (const input of store.workflowInputs) {
      const inputId = getWorkflowInputId(input);
      if (input.inputType === "text") {
        const text =
          getWorkflowInputValue(textValues, input, workflowInputById) ?? "";
        slotValues[inputId] = { type: "text", value: text };
      } else {
        const value = getWorkflowInputValue(
          store.mediaInputs,
          input,
          workflowInputById,
        );
        if (!value) continue;

        if (input.inputType === "image") {
          if (value.kind === "asset" && value.asset.file) {
            slotValues[inputId] = {
              type: "image",
              file: value.asset.file,
            };
          } else if (value.kind === "frame") {
            slotValues[inputId] = {
              type: "image",
              file: value.file,
            };
          }
          continue;
        }

        if (value.kind === "asset" && value.asset.file) {
          slotValues[inputId] = {
            type: "video",
            file: value.asset.file,
          };
          continue;
        }

        if (value.kind === "timelineSelection") {
          slotValues[inputId] = {
            type: "video_selection",
            selection: value.timelineSelection,
            preparedVideoFile: value.preparedVideoFile ?? undefined,
            preparedMaskFile: value.preparedMaskFile ?? undefined,
            derivedMaskVideoTreatment:
              currentDerivedMaskVideoTreatmentBySourceNodeId[input.nodeId] ??
              undefined,
            preparedDerivedMaskVideoTreatment:
              value.preparedDerivedMaskVideoTreatment ?? undefined,
          };
        }
      }
    }

    // Build widget overrides and randomization modes.
    // Actual random number generation happens in the backend to preserve
    // precision for large integer domains (for example seed ranges).
    const widgetOverrides: Record<string, string> = {};
    const derivedWidgetInputs: Record<string, string> = {};
    const widgetModes: Record<string, "fixed" | "randomize"> = {};
    for (const w of widgetInputs) {
      const value = currentWidgetValues[w.nodeId]?.[w.param] ?? w.currentValue;
      if (w.kind === "derived") {
        if (value !== undefined && value !== null) {
          derivedWidgetInputs[`derived_widget_${w.derivedWidgetId}`] =
            String(value);
        }
        continue;
      }

      const key = `${w.nodeId}:${w.param}`;
      const isRandomized = randomizeToggles[key] ?? false;
      if (w.config.controlAfterGenerate) {
        widgetModes[`widget_mode_${w.nodeId}_${w.param}`] = isRandomized
          ? "randomize"
          : "fixed";
      }
      if (w.config.frontendOnly) {
        continue;
      }

      if (isRandomized && w.config.controlAfterGenerate) {
        continue;
      }
      if (value !== undefined && value !== null) {
        widgetOverrides[`widget_${w.nodeId}_${w.param}`] = String(value);
      }
    }

    await queueGeneration(
      slotValues,
      widgetOverrides,
      widgetModes,
      derivedWidgetInputs,
      count,
    );
  }, [
    queueGeneration,
    workflowInputById,
    textValues,
    widgetInputs,
    randomizeToggles,
    derivedMaskMappings,
  ]);

  const handleClearQueue = useCallback(() => {
    clearGenerationQueue();
  }, [clearGenerationQueue]);

  const handleInterruptCurrent = useCallback(() => {
    void interruptCurrentGeneration();
  }, [interruptCurrentGeneration]);

  const handleUrlSave = useCallback(async () => {
    if (urlInput) {
      try {
        const store = useGenerationStore.getState();
        await store.updateComfyUrl(urlInput);
        store.requestEditorReconnect();
        setUrlAnchorEl(null);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to update ComfyUI URL";
        window.alert(message);
      }
    }
  }, [urlInput]);

  const handleWorkflowChange = useCallback(
    (event: SelectChangeEvent) => {
      setWorkflowLoadState("loading");
      void loadWorkflow(event.target.value);
    },
    [loadWorkflow, setWorkflowLoadState],
  );

  const handleDismissWorkflowWarning = useCallback(() => {
    clearWorkflowWarning();
  }, [clearWorkflowWarning]);

  const handleRetryWorkflow = useCallback(() => {
    clearWorkflowLoadError();
    void refreshRuntimeStatus();

    if (selectedWorkflowId) {
      setWorkflowLoadState("loading");
      void loadWorkflow(selectedWorkflowId);
      return;
    }

    void fetchWorkflows();
  }, [
    clearWorkflowLoadError,
    fetchWorkflows,
    loadWorkflow,
    refreshRuntimeStatus,
    selectedWorkflowId,
    setWorkflowLoadState,
  ]);

  const handleOpenEditorFromWarning = useCallback(() => {
    clearWorkflowWarning();
    setEditorOpen(true);
  }, [clearWorkflowWarning]);

  const handleInputDrop = useCallback(
    (inputId: string, asset: Asset) => {
      selectionExtractionRequestIdsRef.current[inputId] =
        (selectionExtractionRequestIdsRef.current[inputId] ?? 0) + 1;
      setMediaInputAsset(inputId, asset);
    },
    [setMediaInputAsset],
  );

  const handleExternalInputDrop = useCallback(
    async (inputId: string, file: File) => {
      const requestId =
        (selectionExtractionRequestIdsRef.current[inputId] ?? 0) + 1;
      selectionExtractionRequestIdsRef.current[inputId] = requestId;

      const ingestedAsset = await addLocalAsset(file, { source: "uploaded" });
      const asset =
        ingestedAsset ??
        (await resolveExistingAssetForExternalDrop(
          file,
          useAssetStore.getState().assets,
        ));
      if (selectionExtractionRequestIdsRef.current[inputId] !== requestId) {
        return;
      }
      if (!asset) {
        return;
      }

      setMediaInputAsset(inputId, asset);
    },
    [setMediaInputAsset],
  );

  const handleInputClear = useCallback(
    (inputId: string) => {
      selectionExtractionRequestIdsRef.current[inputId] =
        (selectionExtractionRequestIdsRef.current[inputId] ?? 0) + 1;
      clearMediaInput(inputId);
    },
    [clearMediaInput],
  );

  const handleClickSelect = useCallback(
    (inputId: string, inputType: "image" | "video") => {
      const extractStore = useExtractStore.getState();
      const timelineSelectionStore = useTimelineSelectionStore.getState();
      const playerStore = usePlayerStore.getState();
      const input = workflowInputById.get(inputId);
      const selectionConfig =
        input?.dispatch && "selectionConfig" in input.dispatch
          ? input.dispatch.selectionConfig
          : undefined;

      if (playerStore.isPlaying) {
        playerStore.setIsPlaying(false);
      }

      if (inputType === "image") {
        timelineSelectionStore.clearSelectionRecommendations();
        extractStore.enterFrameSelectionMode();
        extractStore.setOnConfirmSelection(() => {
          void (async () => {
            try {
              const frameFile = await captureFramePngAtTick(
                playbackClock.time,
                "generation-frame",
              );
              setMediaInputFrameWithSelection(
                inputId,
                frameFile,
                createPointTimelineSelection(playbackClock.time),
              );
            } catch (error) {
              console.error("Failed to capture generation image frame", error);
            } finally {
              const current = useExtractStore.getState();
              current.exitFrameSelectionMode();
              current.setOnConfirmSelection(null);
              useTimelineSelectionStore
                .getState()
                .clearSelectionRecommendations();
            }
          })();
        });
        return;
      }

      const projectFps = Math.max(1, useProjectStore.getState().config.fps);
      const recommendedFps =
        typeof selectionConfig?.exportFps === "number" &&
        selectionConfig.exportFps > 0
          ? selectionConfig.exportFps
          : null;
      const recommendedFrameStep =
        typeof selectionConfig?.frameStep === "number" &&
        selectionConfig.frameStep > 0
          ? selectionConfig.frameStep
          : null;
      const recommendedMaxTicks =
        typeof selectionConfig?.maxFrames === "number" &&
        selectionConfig.maxFrames > 0
          ? (selectionConfig.maxFrames / (recommendedFps ?? projectFps)) *
            TICKS_PER_SECOND
          : null;
      timelineSelectionStore.setSelectionFpsOverride(recommendedFps);
      timelineSelectionStore.setSelectionFrameStep(recommendedFrameStep ?? 1);
      timelineSelectionStore.setSelectionRecommendations({
        fps: recommendedFps,
        frameStep: recommendedFrameStep,
        maxTicks: recommendedMaxTicks,
      });

      const selectionStartTick = playbackClock.time;
      const selectionEndTick = getDefaultSelectionEnd(selectionStartTick);

      timelineSelectionStore.enterSelectionMode(
        selectionStartTick,
        selectionEndTick,
      );
      extractStore.setOnConfirmSelection(() => {
        void (async () => {
          let selectionClosed = false;
          const closeSelectionMode = () => {
            if (selectionClosed) return;
            selectionClosed = true;
            useTimelineSelectionStore.getState().exitSelectionMode();
            useExtractStore.getState().setOnConfirmSelection(null);
          };

          try {
            const { selectionStartTick, selectionEndTick } =
              useTimelineSelectionStore.getState();
            const timelineSelection = applySelectionConfigDefaults(
              createTimelineSelection(selectionStartTick, selectionEndTick),
              selectionConfig,
            );
            const thumbnailFile = await captureFramePngAtTick(
              selectionStartTick,
              "generation-selection-thumb",
            );
            const extractionRequestId =
              (selectionExtractionRequestIdsRef.current[inputId] ?? 0) + 1;
            selectionExtractionRequestIdsRef.current[inputId] =
              extractionRequestId;

            setMediaInputTimelineSelection(
              inputId,
              timelineSelection,
              thumbnailFile,
              {
                isExtracting: true,
                extractionRequestId,
              },
            );
            closeSelectionMode();

            const nodeMasks = derivedMaskMappings.filter(
              (mapping) =>
                mapping.sourceInputId === inputId ||
                (!mapping.sourceInputId && mapping.sourceNodeId === input?.nodeId),
            );

            if (nodeMasks.length > 0) {
              const videoTreatment =
                derivedMaskVideoTreatmentBySourceNodeId[input?.nodeId ?? inputId] ??
                DEFAULT_DERIVED_MASK_SOURCE_VIDEO_TREATMENT;
              const { video, mask } = await renderTimelineSelectionToWebmWithMask(
                timelineSelection,
                nodeMasks[0].maskType,
                {
                  videoTreatment,
                },
              );
              if (
                selectionExtractionRequestIdsRef.current[inputId] ===
                extractionRequestId
              ) {
                setMediaInputTimelineSelection(
                  inputId,
                  timelineSelection,
                  thumbnailFile,
                  {
                    isExtracting: false,
                    extractionRequestId,
                    preparedVideoFile: video,
                    preparedMaskFile: mask,
                    preparedDerivedMaskVideoTreatment: videoTreatment,
                  },
                );
              }
            } else {
              const preparedVideoFile =
                await renderTimelineSelectionToWebm(timelineSelection);
              if (
                selectionExtractionRequestIdsRef.current[inputId] ===
                extractionRequestId
              ) {
                setMediaInputTimelineSelection(
                  inputId,
                  timelineSelection,
                  thumbnailFile,
                  {
                    isExtracting: false,
                    extractionRequestId,
                    preparedVideoFile,
                  },
                );
              }
            }
          } catch (error) {
            const extractionRequestId =
              selectionExtractionRequestIdsRef.current[inputId] ?? 0;
            const storeMediaInputs = useGenerationStore.getState().mediaInputs;
            const existingValue = input
              ? getWorkflowInputValue(
                  storeMediaInputs,
                  input,
                  workflowInputById,
                )
              : storeMediaInputs[inputId];
            if (
              existingValue?.kind === "timelineSelection" &&
              existingValue.extractionRequestId === extractionRequestId
            ) {
              setMediaInputTimelineSelection(
                inputId,
                existingValue.timelineSelection,
                existingValue.thumbnailFile,
                {
                  isExtracting: false,
                  extractionRequestId,
                  extractionError:
                    error instanceof Error
                      ? error.message
                      : "Failed to extract timeline selection",
                },
              );
            }
            console.error(
              "Failed to capture generation video timeline selection",
              error,
            );
          } finally {
            closeSelectionMode();
          }
        })();
      });
    },
    [
      derivedMaskMappings,
      derivedMaskVideoTreatmentBySourceNodeId,
      setMediaInputFrameWithSelection,
      setMediaInputTimelineSelection,
      workflowInputById,
    ],
  );

  const handleTextValueCommit = useCallback((inputId: string, value: string) => {
    clearPendingReplayPanelState();
    const canonicalInputId =
      resolveWorkflowInputKeys(inputId, workflowInputById)[0] ?? inputId;
    setTextValues((prev) => {
      if (prev[canonicalInputId] === value) return prev;
      return { ...prev, [canonicalInputId]: value };
    });
  }, [clearPendingReplayPanelState, workflowInputById]);

  const handleWidgetChange = useCallback(
    (nodeId: string, param: string, value: unknown) => {
      clearPendingReplayPanelState();
      widgetValuesRef.current = setNodeParamValue(
        widgetValuesRef.current,
        nodeId,
        param,
        value,
      );
      setWidgetValues((prev) => {
        if (Object.is(prev[nodeId]?.[param], value)) {
          return prev;
        }
        return setNodeParamValue(prev, nodeId, param, value);
      });
    },
    [clearPendingReplayPanelState],
  );

  const handleToggleRandomize = useCallback((nodeId: string, param: string) => {
    clearPendingReplayPanelState();
    const key = `${nodeId}:${param}`;
    setRandomizeToggles((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, [clearPendingReplayPanelState]);

  const isRunning =
    activeJob?.status === "running" || activeJob?.status === "queued";
  const isPreprocessing = pipelineStatus.phase === "preprocessing";
  const hasQueuedGenerations = queuedGenerationCount > 0;
  const isPostprocessing = postprocessingCount > 0;
  const isPipelineBusy = isPreprocessing || isRunning || hasQueuedGenerations;
  const canInterruptCurrentGeneration = isPreprocessing || isRunning;
  const canClearQueuedGenerations = hasQueuedGenerations;
  const isPipelineInterruptible = isPipelineBusy;
  const queueStatusText = hasQueuedGenerations
    ? `${queuedGenerationCount} queued${isRunning || isPreprocessing ? " after current" : ""}`
    : null;
  const postprocessingStatusText = isPostprocessing
    ? postprocessingCount === 1
      ? "Rendering generation"
      : `Rendering ${postprocessingCount} generations`
    : null;
  const pipelineStatusText = isPreprocessing
    ? pipelineStatus.message
    : [queueStatusText, postprocessingStatusText].filter(Boolean).join(" • ") ||
      null;
  const isExtractingSelection = Object.values(mediaInputs).some(
    (value) => value?.kind === "timelineSelection" && value.isExtracting,
  );

  const providedInputIds = useMemo(() => {
    const provided = new Set<string>();
    for (const input of workflowInputs) {
      const inputId = getWorkflowInputId(input);
      if (input.inputType === "text") {
        const value =
          getWorkflowInputValue(textValues, input, workflowInputById) ?? "";
        if (value.trim().length > 0) {
          provided.add(inputId);
          provided.add(input.nodeId);
        }
        continue;
      }

      if (
        hasInputValue(
          input.inputType as "image" | "video",
          getWorkflowInputValue(mediaInputs, input, workflowInputById),
        )
      ) {
        provided.add(inputId);
        provided.add(input.nodeId);
      }
    }
    return provided;
  }, [mediaInputs, textValues, workflowInputById, workflowInputs]);

  const inputValidationFailures = findWorkflowInputValidationFailures(
    workflowInputs,
    activeWorkflowRules,
    providedInputIds,
  );
  const inputValidationSatisfied = inputValidationFailures.length === 0;

  const backendConnected =
    runtimeStatus?.backend.status === "ok" && runtimeStatusError === null;
  const comfyConnected = runtimeStatus?.comfyui.status === "connected";

  const canGenerate =
    comfyConnected &&
    isWorkflowReady &&
    !isWorkflowLoading &&
    !isExtractingSelection &&
    (workflowInputs.length > 0 || widgetInputs.length > 0) &&
    inputValidationSatisfied;
  const generateButtonLabel = isExtractingSelection
    ? "Extracting selection"
    : "Generate";

  const connectionChipLabel = runtimeStatusError
    ? "Backend unavailable"
    : runtimeStatus?.comfyui.status === "invalid_config"
      ? "ComfyUI misconfigured"
      : comfyConnected
        ? "ComfyUI connected"
        : connectionStatus === "connecting"
          ? "Checking ComfyUI..."
          : "ComfyUI disconnected";

  const connectionChipColor: ChipProps["color"] =
    runtimeStatusError || runtimeStatus?.comfyui.status === "invalid_config"
      ? "error"
      : comfyConnected
        ? "success"
        : connectionStatus === "connecting"
          ? "default"
          : "warning";

  const connectionSummary = runtimeStatusError
    ? runtimeStatusError
    : runtimeStatus?.comfyui.error ??
      (backendConnected
        ? runtimeStatus?.backend.mode === "production"
          ? "Release mode: frontend served by FastAPI."
          : "Development mode: frontend build not present on backend."
        : null);

  // Resolve imported assets that have a TimelineSelection (eligible for "send to timeline")
  const allAssets = useAssetStore((s) => s.assets);
  const importedAssets = useMemo(() => {
    const ids = displayJob?.importedAssetIds;
    if (!ids || ids.length === 0) return [];
    const assetsById = new Map(allAssets.map((asset) => [asset.id, asset]));
    return ids
      .map((id) => assetsById.get(id))
      .filter((asset): asset is Asset => Boolean(asset));
  }, [displayJob?.importedAssetIds, allAssets]);

  const sendableAssets = useMemo(() => {
    return importedAssets.filter(
      (asset) => getTimelineSelectionFromAsset(asset) !== null,
    );
  }, [importedAssets]);

  const handleSendToTimeline = useCallback(() => {
    for (const asset of sendableAssets) {
      const selection = getTimelineSelectionFromAsset(asset);
      if (selection) {
        insertAssetAtTime(asset, selection.start);
      }
    }
  }, [sendableAssets]);

  return {
    // State
    editorOpen,
    setEditorOpen,
    urlAnchorEl,
    setUrlAnchorEl,
    urlInput,
    setUrlInput,
    textValues,
    handleTextValueCommit,
    mediaInputs,

    // Widget state
    widgetInputs,
    widgetValues,
    randomizeToggles,
    handleWidgetChange,
    handleToggleRandomize,

    // Derived
    connectionStatus,
    runtimeStatus,
    runtimeStatusError,
    latestPreviewUrl,
    previewAnimation,
    comfyuiDirectUrl,
    workflowInputs,
    activeJob,
    activeJobId,
    displayJob,
    availableWorkflows,
    selectedWorkflowId,
    isWorkflowLoading,
    isWorkflowReady,
    workflowLoadError,
    workflowWarning,
    hasInferredInputs,
    workflowRuleWarnings,
    inputValidationFailures,
    queuedGenerationCount,
    postprocessingCount,
    isRunning,
    isPipelineBusy,
    canInterruptCurrentGeneration,
    canClearQueuedGenerations,
    isPipelineInterruptible,
    isPostprocessing,
    pipelineStatusText,
    isExtractingSelection,
    canGenerate,
    generateButtonLabel,
    connectionChipLabel,
    connectionChipColor,
    connectionSummary,

    // Send to timeline
    importedAssets,
    sendableAssets,
    handleSendToTimeline,

    // Handlers
    handleGenerate,
    handleInterruptCurrent,
    handleClearQueue,
    handleUrlSave,
    handleWorkflowChange,
    handleRetryWorkflow,
    handleDismissWorkflowWarning,
    handleOpenEditorFromWarning,
    handleInputDrop,
    handleExternalInputDrop,
    handleInputClear,
    handleClickSelect,
  };
}
