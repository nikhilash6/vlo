import { beforeEach, describe, expect, it, vi } from "vitest";
import * as comfyApi from "../services/comfyuiApi";
import { TEMP_WORKFLOW_ID, useGenerationStore } from "../useGenerationStore";
import { useAssetStore } from "../../userAssets/useAssetStore";
import { createDefaultWorkflowRules } from "../services/workflowRules";
import type { Asset } from "../../../types/Asset";

const mocks = vi.hoisted(() => ({
  captureFramePngAtTick: vi.fn(),
  renderTimelineSelectionToWebm: vi.fn(),
  renderTimelineSelectionToWebmWithMask: vi.fn(),
  injectWorkflowAndRead: vi.fn(),
}));

vi.mock("../utils/inputSelection", () => ({
  captureFramePngAtTick: mocks.captureFramePngAtTick,
  renderTimelineSelectionToWebm: mocks.renderTimelineSelectionToWebm,
  renderTimelineSelectionToWebmWithMask:
    mocks.renderTimelineSelectionToWebmWithMask,
}));

vi.mock("../services/workflowSyncController", () => ({
  injectWorkflowAndRead: mocks.injectWorkflowAndRead,
}));

describe("useGenerationStore metadata replay", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    useAssetStore.setState({ assets: [] });
    useGenerationStore.setState({
      editorRef: null,
      tempWorkflow: null,
      availableWorkflows: [],
      selectedWorkflowId: null,
      activeWorkflowRules: null,
      activeRulesWarnings: [],
      rulesWorkflowSourceId: null,
      syncedWorkflow: null,
      syncedGraphData: null,
      workflowInputs: [],
      mediaInputs: {},
      pendingReplayPanelState: null,
      derivedMaskMappings: [],
      isWorkflowLoading: false,
      workflowLoadState: "idle",
      isWorkflowReady: false,
      workflowLoadError: null,
      workflowWarning: null,
      workflowRuleWarnings: [],
    });

    mocks.captureFramePngAtTick.mockResolvedValue(
      new File(["thumb"], "thumb.png", { type: "image/png" }),
    );
    mocks.renderTimelineSelectionToWebm.mockResolvedValue(
      new File(["video"], "selection.webm", { type: "video/webm" }),
    );
    mocks.renderTimelineSelectionToWebmWithMask.mockResolvedValue({
      video: new File(["video"], "selection.webm", { type: "video/webm" }),
      mask: new File(["mask"], "selection-mask.webm", {
        type: "video/webm",
      }),
    });
    mocks.injectWorkflowAndRead.mockReset();
  });

  it("matches sidecar presentation from saved workflow graph data and restores asset inputs", async () => {
    const sourceAsset: Asset = {
      id: "source-asset",
      hash: "hash-source",
      name: "source.png",
      type: "image",
      src: "source.png",
      createdAt: Date.now(),
    };
    const generatedAsset: Asset = {
      id: "generated-asset",
      hash: "hash-generated",
      name: "generated.png",
      type: "image",
      src: "generated.png",
      createdAt: Date.now(),
      creationMetadata: {
        source: "generated",
        workflowName: "Original Workflow",
        targetResolution: 720,
        inputs: [
          {
            nodeId: "145",
            kind: "draggedAsset",
            parentAssetId: sourceAsset.id,
          },
        ],
        comfyuiPrompt: {
          "145": {
            class_type: "LoadImage",
            inputs: { image: "source.png" },
          },
          "999": {
            class_type: "RuntimeOnlyNode",
            inputs: {},
          },
        },
        comfyuiWorkflow: {
          nodes: [{ id: 145, type: "LoadImage", widgets_values: ["source.png"] }],
        },
      },
    };

    useAssetStore.setState({ assets: [sourceAsset, generatedAsset] });

    vi.spyOn(comfyApi, "listWorkflows").mockResolvedValue([
      { id: "wan2_2_flf2v.json", name: "Wan2.2 I2V & FLF2V" },
    ]);
    vi.spyOn(comfyApi, "getWorkflowContent").mockResolvedValue({
      nodes: [{ id: 145, type: "LoadImage", widgets_values: ["other.png"] }],
    });
    vi.spyOn(comfyApi, "getWorkflowRules").mockResolvedValue({
      workflow_id: "wan2_2_flf2v.json",
      has_sidecar: true,
      rules: createDefaultWorkflowRules({
        aspect_ratio_processing: {
          enabled: true,
          resolutions: [480, 720, 1080],
        },
        nodes: {
          "145": {
            present: {
              label: "Source Image",
              input_type: "image",
              param: "image",
              class_type: "LoadImage",
            },
          },
        },
      }),
      warnings: [],
    });

    await useGenerationStore
      .getState()
      .loadWorkflowFromAssetMetadata(generatedAsset);

    const state = useGenerationStore.getState();
    const restoredInput = Object.values(state.mediaInputs)[0];

    expect(state.selectedWorkflowId).toBe(TEMP_WORKFLOW_ID);
    expect(state.rulesWorkflowSourceId).toBe("wan2_2_flf2v.json");
    expect(state.targetResolution).toBe(720);
    expect(state.workflowInputs[0]?.label).toBe("Source Image");
    expect(state.workflowInputs[0]?.origin).toBe("rule");
    expect(restoredInput).toMatchObject({
      kind: "asset",
      asset: { id: sourceAsset.id },
    });
  });

  it("prefers the saved visual workflow snapshot and replay state when restoring a generated workflow", async () => {
    const sourceAsset: Asset = {
      id: "source-asset",
      hash: "hash-source",
      name: "source.png",
      type: "image",
      src: "source.png",
      createdAt: Date.now(),
    };
    const generatedAsset: Asset = {
      id: "generated-asset",
      hash: "hash-generated",
      name: "generated.png",
      type: "image",
      src: "generated.png",
      createdAt: Date.now(),
      creationMetadata: {
        source: "generated",
        workflowName: "Original Workflow",
        workflowSourceId: "wan2_2_flf2v.json",
        targetResolution: 720,
        inputs: [
          {
            nodeId: "145",
            kind: "draggedAsset",
            parentAssetId: sourceAsset.id,
          },
        ],
        replayState: {
          version: 1,
          workflowSourceId: "wan2_2_flf2v.json",
          workflowInputs: [
            {
              nodeId: "145",
              classType: "LoadImage",
              inputType: "image",
              param: "image",
              label: "Replay Source Image",
              origin: "rule",
            },
          ],
          textValues: {
            "6:text": "hello from replay",
          },
          widgetValues: {
            widget_145_strength_model: "0.5",
          },
          widgetModes: {
            widget_mode_145_seed: "randomize",
          },
          derivedWidgetValues: {
            derived_widget_dual_sampler_denoise: "0.4",
          },
          exactAspectRatio: true,
          maskCropMode: "full",
          maskCropDilation: 0.2,
        },
        comfyuiPrompt: {
          "999": {
            class_type: "RuntimeOnlyNode",
            inputs: {},
          },
        },
        comfyuiWorkflow: {
          nodes: [{ id: 145, type: "LoadImage", widgets_values: ["source.png"] }],
        },
      },
    };
    useAssetStore.setState({ assets: [sourceAsset, generatedAsset] });

    vi.spyOn(comfyApi, "listWorkflows").mockResolvedValue([
      { id: "wan2_2_flf2v.json", name: "Wan2.2 I2V & FLF2V" },
    ]);
    const getWorkflowContentSpy = vi
      .spyOn(comfyApi, "getWorkflowContent")
      .mockResolvedValue({
        nodes: [
          { id: 62, type: "LoadImage", widgets_values: ["source.png"] },
          { id: 68, type: "LoadImage", widgets_values: ["example.png"] },
        ],
      });
    vi.spyOn(comfyApi, "getWorkflowRules").mockResolvedValue({
      workflow_id: "wan2_2_flf2v.json",
      has_sidecar: true,
      rules: createDefaultWorkflowRules({
        aspect_ratio_processing: {
          enabled: true,
          resolutions: [480, 720, 1080],
        },
        nodes: {
          "145": {
            present: {
              label: "Source Image",
              input_type: "image",
              param: "image",
              class_type: "LoadImage",
            },
          },
        },
      }),
      warnings: [],
    });

    await useGenerationStore
      .getState()
      .loadWorkflowFromAssetMetadata(generatedAsset);

    const state = useGenerationStore.getState();

    expect(state.selectedWorkflowId).toBe(TEMP_WORKFLOW_ID);
    expect(state.rulesWorkflowSourceId).toBe("wan2_2_flf2v.json");
    expect(state.targetResolution).toBe(720);
    expect(state.exactAspectRatio).toBe(true);
    expect(state.maskCropMode).toBe("full");
    expect(state.maskCropDilation).toBe(0.2);
    expect(state.workflowInputs[0]?.label).toBe("Source Image");
    expect(state.syncedGraphData).toEqual({
      nodes: [{ id: 145, type: "LoadImage", widgets_values: ["source.png"] }],
    });
    expect(state.pendingReplayPanelState).toEqual({
      textValues: {
        "6:text": "hello from replay",
      },
      widgetValues: {
        widget_145_strength_model: "0.5",
      },
      widgetModes: {
        widget_mode_145_seed: "randomize",
      },
        derivedWidgetValues: {
          derived_widget_dual_sampler_denoise: "0.4",
        },
    });
    expect(getWorkflowContentSpy).not.toHaveBeenCalled();
  });

  it("clamps a saved target resolution to the closest supported workflow value", async () => {
    const generatedAsset: Asset = {
      id: "generated-asset",
      hash: "hash-generated",
      name: "generated.png",
      type: "image",
      src: "generated.png",
      createdAt: Date.now(),
      creationMetadata: {
        source: "generated",
        workflowName: "Original Workflow",
        targetResolution: 900,
        inputs: [],
        comfyuiPrompt: {
          "145": {
            class_type: "LoadImage",
            inputs: { image: "source.png" },
          },
        },
        comfyuiWorkflow: {
          nodes: [{ id: 145, type: "LoadImage", widgets_values: ["source.png"] }],
        },
      },
    };

    vi.spyOn(comfyApi, "listWorkflows").mockResolvedValue([
      { id: "wan2_2_flf2v.json", name: "Wan2.2 I2V & FLF2V" },
    ]);
    vi.spyOn(comfyApi, "getWorkflowContent").mockResolvedValue({
      nodes: [{ id: 145, type: "LoadImage", widgets_values: ["other.png"] }],
    });
    vi.spyOn(comfyApi, "getWorkflowRules").mockResolvedValue({
      workflow_id: "wan2_2_flf2v.json",
      has_sidecar: true,
      rules: createDefaultWorkflowRules({
        aspect_ratio_processing: {
          enabled: true,
          resolutions: [720, 1080],
        },
      }),
      warnings: [],
    });

    await useGenerationStore
      .getState()
      .loadWorkflowFromAssetMetadata(generatedAsset);

    expect(useGenerationStore.getState().targetResolution).toBe(720);
  });

  it("restores prepared timeline selections so generation is immediately ready", async () => {
    const preparedVideoFile = new File(["video"], "selection.webm", {
      type: "video/webm",
    });
    const thumbnailFile = new File(["thumb"], "thumb.png", {
      type: "image/png",
    });
    const generatedAsset: Asset = {
      id: "generated-video",
      hash: "hash-generated-video",
      name: "generated-video.mp4",
      type: "video",
      src: "generated-video.mp4",
      createdAt: Date.now(),
      creationMetadata: {
        source: "generated",
        workflowName: "Original Workflow",
        inputs: [
          {
            nodeId: "145",
            kind: "timelineSelection",
            timelineSelection: {
              start: 10,
              end: 40,
              clips: [],
            },
          },
        ],
        comfyuiPrompt: {
          "145": {
            class_type: "LoadVideo",
            inputs: { video: "selection.webm" },
          },
        },
      },
    };

    mocks.captureFramePngAtTick.mockResolvedValue(thumbnailFile);
    mocks.renderTimelineSelectionToWebm.mockResolvedValue(preparedVideoFile);
    vi.spyOn(comfyApi, "listWorkflows").mockResolvedValue([]);

    await useGenerationStore
      .getState()
      .loadWorkflowFromAssetMetadata(generatedAsset);

    const restoredInput = Object.values(
      useGenerationStore.getState().mediaInputs,
    )[0];

    expect(restoredInput).toMatchObject({
      kind: "timelineSelection",
      isExtracting: false,
      preparedVideoFile,
      thumbnailFile,
    });
  });

  it("restores image timeline selections as frame captures", async () => {
    const restoredFrame = new File(["frame"], "frame.png", {
      type: "image/png",
    });
    const generatedAsset: Asset = {
      id: "generated-image",
      hash: "hash-generated-image",
      name: "generated-image.png",
      type: "image",
      src: "generated-image.png",
      createdAt: Date.now(),
      creationMetadata: {
        source: "generated",
        workflowName: "Original Workflow",
        inputs: [
          {
            nodeId: "145",
            kind: "timelineSelection",
            timelineSelection: {
              start: 10,
              clips: [],
              fps: 24,
            },
          },
        ],
        replayState: {
          version: 1,
          workflowInputs: [
            {
              nodeId: "145",
              classType: "LoadImage",
              inputType: "image",
              param: "image",
              label: "Start Frame",
              origin: "rule",
            },
          ],
        },
        comfyuiPrompt: {
          "145": {
            class_type: "LoadImage",
            inputs: { image: "frame.png" },
          },
        },
      },
    };

    mocks.captureFramePngAtTick.mockResolvedValue(restoredFrame);
    vi.spyOn(comfyApi, "listWorkflows").mockResolvedValue([]);

    await useGenerationStore
      .getState()
      .loadWorkflowFromAssetMetadata(generatedAsset);

    const restoredInput = Object.values(
      useGenerationStore.getState().mediaInputs,
    )[0];

    expect(restoredInput).toMatchObject({
      kind: "frame",
      file: restoredFrame,
      timelineSelection: {
        start: 10,
        clips: [],
        fps: 24,
      },
    });
  });

  it("falls back to the saved workflow name when no workflow snapshot is stored", async () => {
    const sourceAsset: Asset = {
      id: "source-asset",
      hash: "hash-source",
      name: "source.png",
      type: "image",
      src: "source.png",
      createdAt: Date.now(),
    };
    const graphData = {
      nodes: [{ id: 145, type: "LoadImage", widgets_values: ["source.png"] }],
    };
    const generatedAsset: Asset = {
      id: "generated-asset",
      hash: "hash-generated",
      name: "generated.png",
      type: "image",
      src: "generated.png",
      createdAt: Date.now(),
      creationMetadata: {
        source: "generated",
        workflowName: "Original Workflow",
        targetResolution: 720,
        inputs: [
          {
            nodeId: "145",
            kind: "draggedAsset",
            parentAssetId: sourceAsset.id,
          },
        ],
      },
    };

    useAssetStore.setState({ assets: [sourceAsset, generatedAsset] });
    useGenerationStore.setState({
      editorRef: {} as HTMLIFrameElement,
    });

    vi.spyOn(comfyApi, "listWorkflows").mockResolvedValue([
      { id: "original_workflow.json", name: "Original Workflow" },
    ]);
    vi.spyOn(comfyApi, "getWorkflowContent").mockResolvedValue(graphData);
    vi.spyOn(comfyApi, "getWorkflowRules").mockResolvedValue({
      workflow_id: "original_workflow.json",
      has_sidecar: true,
      rules: createDefaultWorkflowRules({
        aspect_ratio_processing: {
          enabled: true,
          resolutions: [480, 720, 1080],
        },
        nodes: {
          "145": {
            present: {
              label: "Source Image",
              input_type: "image",
              param: "image",
              class_type: "LoadImage",
            },
          },
        },
      }),
      warnings: [],
    });
    mocks.injectWorkflowAndRead.mockResolvedValue({
      ok: true,
      deferred: false,
      reason: null,
      warnings: null,
      workflowResult: {
        workflow: {
          "145": {
            class_type: "LoadImage",
            inputs: { image: "source.png" },
          },
        },
        graphData,
        inputs: [
          {
            nodeId: "145",
            classType: "LoadImage",
            inputType: "image",
            param: "image",
            label: "Source Image",
            currentValue: "source.png",
            origin: "inferred",
          },
        ],
        filename: "original_workflow.json",
      },
    });

    await useGenerationStore
      .getState()
      .loadWorkflowFromAssetMetadata(generatedAsset);

    const state = useGenerationStore.getState();
    const restoredInput = Object.values(state.mediaInputs)[0];

    expect(state.selectedWorkflowId).toBe("original_workflow.json");
    expect(state.rulesWorkflowSourceId).toBe("original_workflow.json");
    expect(state.targetResolution).toBe(720);
    expect(mocks.injectWorkflowAndRead).toHaveBeenCalledWith(
      state.editorRef,
      graphData,
      "original_workflow.json",
      expect.any(Function),
      null,
    );
    expect(restoredInput).toMatchObject({
      kind: "asset",
      asset: { id: sourceAsset.id },
    });
  });
});
