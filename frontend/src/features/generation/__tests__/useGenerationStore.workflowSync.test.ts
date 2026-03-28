import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEMP_WORKFLOW_ID, useGenerationStore } from "../useGenerationStore";
import type { WorkflowInput } from "../types";
import * as comfyApi from "../services/comfyuiApi";
import * as workflowSyncController from "../services/workflowSyncController";
import { createDefaultWorkflowRules } from "../services/workflowRules";

function makeInputs(): WorkflowInput[] {
  return [
    {
      nodeId: "1",
      classType: "LoadImage",
      inputType: "image",
      param: "image",
      label: "Image",
      currentValue: null,
      origin: "inferred",
    },
  ];
}

function makeConditioningInputs(): WorkflowInput[] {
  return [
    {
      nodeId: "4",
      classType: "CLIPTextEncode",
      inputType: "text",
      param: "text",
      label: "Prompt",
      currentValue: "avoid blur",
      origin: "inferred",
    },
    {
      nodeId: "3",
      classType: "CLIPTextEncode",
      inputType: "text",
      param: "text",
      label: "Prompt",
      currentValue: "a bright forest",
      origin: "inferred",
    },
  ];
}

function resetGenerationStore() {
  useGenerationStore.setState({
    availableWorkflows: [],
    tempWorkflow: null,
    selectedWorkflowId: null,
    syncedWorkflow: null,
    syncedGraphData: null,
    workflowInputs: [],
    workflowRuleWarnings: [],
    activeWorkflowRules: null,
    rulesWorkflowSourceId: null,
    activeRulesWarnings: [],
    derivedMaskMappings: [],
    mediaInputs: {},
    workflowWarning: null,
    hasInferredInputs: false,
    isWorkflowLoading: false,
    workflowLoadState: "idle",
    isWorkflowReady: false,
    editorRef: null,
    jobs: new Map(),
    activeJobId: null,
    maskCropMode: "crop",
  });
}

describe("useGenerationStore workflow editor sync", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetGenerationStore();
  });

  it("keeps a stable workflow id when syncing editor changes", async () => {
    useGenerationStore.setState({
      selectedWorkflowId: "wf.json",
      availableWorkflows: [{ id: "wf.json", name: "Workflow" }],
      activeRulesWarnings: [],
      activeWorkflowRules: null,
    });

    await useGenerationStore.getState().registerWorkflowFromEditor(
      { "1": { class_type: "LoadImage", inputs: { image: "input.png" } } },
      { nodes: [{ id: 1 }] },
      makeInputs(),
      null,
    );

    const state = useGenerationStore.getState();
    expect(state.selectedWorkflowId).toBe("wf.json");
    expect(state.tempWorkflow).toBeNull();
    expect(state.availableWorkflows).toEqual([
      { id: "wf.json", name: "Workflow" },
    ]);
    expect(state.syncedGraphData).toEqual({ nodes: [{ id: 1 }] });
  });

  it("prefers the selected workflow id when ComfyUI exposes a temporary filename", async () => {
    useGenerationStore.setState({
      selectedWorkflowId: "wf.json",
      availableWorkflows: [{ id: "wf.json", name: "Workflow" }],
      activeRulesWarnings: [],
      activeWorkflowRules: null,
    });

    await useGenerationStore.getState().registerWorkflowFromEditor(
      { "1": { class_type: "LoadImage", inputs: { image: "input.png" } } },
      { nodes: [{ id: 2 }] },
      makeInputs(),
      "wf (1).json",
    );

    const state = useGenerationStore.getState();
    expect(state.selectedWorkflowId).toBe("wf.json");
    expect(state.availableWorkflows).toEqual([
      { id: "wf.json", name: "Workflow" },
    ]);
    expect(state.syncedGraphData).toEqual({ nodes: [{ id: 2 }] });
  });

  it("normalizes bare editor filenames to .json when promoting persisted workflows", async () => {
    useGenerationStore.setState({
      selectedWorkflowId: null,
      availableWorkflows: [],
      activeRulesWarnings: [],
      activeWorkflowRules: null,
    });

    await useGenerationStore.getState().registerWorkflowFromEditor(
      { "1": { class_type: "LoadImage", inputs: { image: "input.png" } } },
      { nodes: [{ id: 3 }] },
      makeInputs(),
      "wf",
    );

    const state = useGenerationStore.getState();
    expect(state.selectedWorkflowId).toBe("wf.json");
    expect(state.availableWorkflows).toEqual([
      { id: "wf.json", name: "wf" },
    ]);
    expect(state.tempWorkflow).toBeNull();
  });

  it("keeps replay-derived temp workflows attached to their source rules when the iframe reports a synthetic temp filename", async () => {
    useGenerationStore.setState({
      selectedWorkflowId: TEMP_WORKFLOW_ID,
      availableWorkflows: [{ id: TEMP_WORKFLOW_ID, name: "Edited Workflow" }],
      activeRulesWarnings: [],
      activeWorkflowRules: createDefaultWorkflowRules(),
      rulesWorkflowSourceId: "wan2_2_flf2v.json",
      tempWorkflow: {
        workflow: { "1": { class_type: "LoadImage", inputs: {} } },
        graphData: { nodes: [{ id: 1 }] },
        inputs: makeInputs(),
        rules: createDefaultWorkflowRules(),
        rulesSourceId: "wan2_2_flf2v.json",
        rulesWarnings: [],
      },
    });

    await useGenerationStore.getState().registerWorkflowFromEditor(
      { "1": { class_type: "LoadImage", inputs: { image: "input.png" } } },
      { nodes: [{ id: 4 }] },
      makeInputs(),
      "__temp__.json",
    );

    const state = useGenerationStore.getState();
    expect(state.selectedWorkflowId).toBe(TEMP_WORKFLOW_ID);
    expect(state.rulesWorkflowSourceId).toBe("wan2_2_flf2v.json");
    expect(state.tempWorkflow?.rulesSourceId).toBe("wan2_2_flf2v.json");
    expect(state.availableWorkflows).toEqual([
      { id: TEMP_WORKFLOW_ID, name: "Edited Workflow" },
    ]);
    expect(state.syncedGraphData).toEqual({ nodes: [{ id: 4 }] });
  });

  it("drops incompatible persisted rules when a different workflow is loaded into the editor tab", async () => {
    useGenerationStore.setState({
      selectedWorkflowId: "video_ltx2_3_i2v.json",
      availableWorkflows: [
        { id: "video_ltx2_3_i2v.json", name: "LTX I2V" },
      ],
      activeRulesWarnings: [],
      activeWorkflowRules: createDefaultWorkflowRules({
        nodes: {
          "267": {
            widgets: {
              cfg: {
                label: "CFG",
              },
            },
          },
        },
      }),
      rulesWorkflowSourceId: "video_ltx2_3_i2v.json",
    });

    await useGenerationStore.getState().registerWorkflowFromEditor(
      { "2004": { class_type: "LoadImage", inputs: { image: "input.png" } } },
      { nodes: [{ id: 2004, type: "LoadImage" }] },
      [
        {
          nodeId: "2004",
          classType: "LoadImage",
          inputType: "image",
          param: "image",
          label: "Image",
          currentValue: null,
          origin: "inferred",
        },
      ],
      "video_ltx2_3_i2v.json",
    );

    const state = useGenerationStore.getState();
    expect(state.selectedWorkflowId).toBe(TEMP_WORKFLOW_ID);
    expect(state.rulesWorkflowSourceId).toBeNull();
    expect(state.activeWorkflowRules?.nodes).toEqual({});
    expect(state.tempWorkflow?.rulesSourceId).toBeNull();
  });

  it("loads workflow content from backend assets", async () => {
    vi.spyOn(comfyApi, "getWorkflowContent").mockResolvedValue({
      source: "backend",
    });
    vi.spyOn(comfyApi, "getWorkflowRules").mockResolvedValue({
      workflow_id: "wf.json",
      rules: createDefaultWorkflowRules(),
      warnings: [],
    });

    await useGenerationStore.getState().loadWorkflow("wf.json");

    expect(comfyApi.getWorkflowContent).toHaveBeenCalledWith("wf.json");
    expect(useGenerationStore.getState().syncedGraphData).toEqual({
      source: "backend",
    });
  });

  it("does not leave the previous workflow marked ready when a new sync fails", async () => {
    vi.spyOn(comfyApi, "getWorkflowContent").mockResolvedValue({
      source: "backend",
    });
    vi.spyOn(comfyApi, "getWorkflowRules").mockResolvedValue({
      workflow_id: "wf.json",
      rules: createDefaultWorkflowRules(),
      warnings: [],
    });
    vi.spyOn(workflowSyncController, "injectWorkflowAndRead").mockResolvedValue({
      ok: false,
      deferred: false,
      workflowResult: null,
      reason: "sync failed",
    });

    useGenerationStore.setState({
      syncedWorkflow: { old: true },
      syncedGraphData: { old: true },
      workflowInputs: makeInputs(),
      editorRef: {} as HTMLIFrameElement,
    });

    await useGenerationStore.getState().loadWorkflow("wf.json");

    const state = useGenerationStore.getState();
    expect(state.syncedWorkflow).toBeNull();
    expect(state.isWorkflowReady).toBe(false);
    expect(state.workflowLoadState).toBe("error");
  });

  it("refreshes the selector from backend workflows only", async () => {
    vi.spyOn(comfyApi, "listWorkflows").mockResolvedValue([
      { id: "wf.json", name: "Workflow" },
    ]);
    vi.spyOn(comfyApi, "getWorkflowContent").mockResolvedValue({});
    vi.spyOn(comfyApi, "getWorkflowRules").mockResolvedValue({
      workflow_id: "wf.json",
      rules: createDefaultWorkflowRules(),
      warnings: [],
    });

    useGenerationStore.setState({
      availableWorkflows: [{ id: "local.json", name: "local" }],
      selectedWorkflowId: null,
    });

    await useGenerationStore.getState().fetchWorkflows();

    expect(useGenerationStore.getState().availableWorkflows).toEqual([
      { id: "wf.json", name: "Workflow" },
    ]);
  });

  it("applies conditioning labels and ordering when syncing editor changes", async () => {
    useGenerationStore.setState({
      selectedWorkflowId: "wf.json",
      availableWorkflows: [{ id: "wf.json", name: "Workflow" }],
      activeRulesWarnings: [],
      activeWorkflowRules: null,
    });

    await useGenerationStore.getState().registerWorkflowFromEditor(
      {
        "2": { class_type: "CLIPLoader", inputs: {} },
        "3": {
          class_type: "CLIPTextEncode",
          inputs: { text: "a bright forest", clip: ["2", 0] },
        },
        "4": {
          class_type: "CLIPTextEncode",
          inputs: { text: "avoid blur", clip: ["2", 0] },
        },
        "9": {
          class_type: "KSampler",
          inputs: {
            positive: ["3", 0],
            negative: ["4", 0],
          },
        },
      },
      { nodes: [{ id: 3 }, { id: 4 }, { id: 9 }] },
      makeConditioningInputs(),
      null,
    );

    expect(useGenerationStore.getState().workflowInputs.map((input) => input.label)).toEqual([
      "Positive Prompt",
      "Negative Prompt",
    ]);
    expect(useGenerationStore.getState().workflowInputs.map((input) => input.nodeId)).toEqual([
      "3",
      "4",
    ]);
  });

  it("carries a single media input across a workflow switch after sync", () => {
    useGenerationStore.setState({
      workflowInputs: [
        {
          nodeId: "10",
          classType: "LoadImage",
          inputType: "image",
          param: "image",
          label: "Image",
          currentValue: null,
          origin: "rule",
        },
      ],
      mediaInputs: {
        "10:image": {
          kind: "asset",
          asset: {
            id: "asset-1",
            hash: "hash-1",
            name: "frame.png",
            type: "video",
            src: "assets/frame.png",
            createdAt: Date.now(),
          },
        },
      },
      activeRulesWarnings: [],
      activeWorkflowRules: null,
    });

    useGenerationStore.getState().syncWorkflow(
      { "20": { class_type: "LoadImage", inputs: { image: "frame.png" } } },
      { nodes: [{ id: 20 }] },
      [
        {
          nodeId: "20",
          classType: "LoadImage",
          inputType: "image",
          param: "image",
          label: "Reference Image",
          currentValue: null,
          origin: "rule",
        },
      ],
    );

    expect(useGenerationStore.getState().mediaInputs).toEqual({
      "20:image": {
        kind: "asset",
        asset: {
          id: "asset-1",
          hash: "hash-1",
          name: "frame.png",
          type: "video",
          src: "assets/frame.png",
          createdAt: expect.any(Number),
        },
      },
    });
  });
});
