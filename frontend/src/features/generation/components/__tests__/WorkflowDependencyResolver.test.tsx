import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowDependencyResolver } from "../WorkflowDependencyResolver";
import {
  getAvailableModels,
  startModelDownload,
  subscribeToProgress,
} from "../../../../services/downloadApi";

vi.mock("../../../../services/downloadApi", () => ({
  getAvailableModels: vi.fn(),
  startModelDownload: vi.fn(),
  cancelDownload: vi.fn(),
  subscribeToProgress: vi.fn(),
}));

describe("WorkflowDependencyResolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(subscribeToProgress).mockReturnValue(() => undefined);
  });

  it("shows only the ComfyUI editor action when nodes are missing but models are not", () => {
    render(
      <WorkflowDependencyResolver
        workflowId="wf.json"
        warning={{
          missingNodeTypes: ["CustomNode"],
          missingModels: [],
        }}
        onOpenEditor={vi.fn()}
        onRefreshWarning={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /open comfyui editor/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /download/i })).not.toBeInTheDocument();
    expect(getAvailableModels).not.toHaveBeenCalled();
  });

  it("shows workflow download options for missing models", async () => {
    vi.mocked(getAvailableModels).mockResolvedValue({
      sam2: [],
      comfyui: {
        modelDownloadsEnabled: true,
        workflowModels: [
          {
            key: "checkpoints:model.safetensors",
            label: "model.safetensors",
            description: "Save to ComfyUI/models/checkpoints",
            installed: false,
            filename: "model.safetensors",
            directory: "checkpoints",
          },
          {
            key: "checkpoints:other.safetensors",
            label: "other.safetensors",
            description: "Save to ComfyUI/models/checkpoints",
            installed: false,
            filename: "other.safetensors",
            directory: "checkpoints",
          },
        ],
      },
    });

    render(
      <WorkflowDependencyResolver
        workflowId="wf.json"
        warning={{
          missingNodeTypes: [],
          missingModels: ["model.safetensors"],
        }}
        onOpenEditor={vi.fn()}
        onRefreshWarning={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("model.safetensors")).toBeInTheDocument();
    });

    expect(screen.queryByText("other.safetensors")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download/i })).toBeInTheDocument();
  });

  it("falls back to the ComfyUI editor path when workflow download metadata is unavailable", async () => {
    vi.mocked(getAvailableModels).mockRejectedValue(
      new Error("Unable to load model download options"),
    );

    const onOpenEditor = vi.fn();
    render(
      <WorkflowDependencyResolver
        workflowId="wf.json"
        warning={{
          missingNodeTypes: [],
          missingModels: ["model.safetensors"],
        }}
        onOpenEditor={onOpenEditor}
        onRefreshWarning={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(getAvailableModels).toHaveBeenCalledWith({ workflowId: "wf.json" });
    });

    expect(screen.queryByRole("button", { name: /download/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /open comfyui editor/i }));
    expect(onOpenEditor).toHaveBeenCalledTimes(1);
  });

  it("starts a workflow-scoped download with the selected workflow id", async () => {
    vi.mocked(getAvailableModels).mockResolvedValue({
      sam2: [],
      comfyui: {
        modelDownloadsEnabled: true,
        workflowModels: [
          {
            key: "checkpoints:model.safetensors",
            label: "model.safetensors",
            description: "Save to ComfyUI/models/checkpoints",
            installed: false,
            filename: "model.safetensors",
            directory: "checkpoints",
          },
        ],
      },
    });
    vi.mocked(startModelDownload).mockResolvedValue({
      jobId: "job-1",
      label: "model.safetensors",
      status: "pending",
    });

    render(
      <WorkflowDependencyResolver
        workflowId="wf.json"
        warning={{
          missingNodeTypes: [],
          missingModels: ["model.safetensors"],
        }}
        onOpenEditor={vi.fn()}
        onRefreshWarning={vi.fn()}
      />,
    );

    const downloadButton = await screen.findByRole("button", { name: /download/i });
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(startModelDownload).toHaveBeenCalledWith(
        "comfyui-workflow",
        "checkpoints:model.safetensors",
        { workflowId: "wf.json" },
      );
    });
  });
});
