import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sam2ModelDownloadOverlay } from "../Sam2ModelDownloadOverlay";
import { getAvailableModels, subscribeToProgress } from "../../../../services/downloadApi";

vi.mock("../../../../services/downloadApi", () => ({
  getAvailableModels: vi.fn(),
  startModelDownload: vi.fn(),
  cancelDownload: vi.fn(),
  subscribeToProgress: vi.fn(),
}));

describe("Sam2ModelDownloadOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.mocked(subscribeToProgress).mockReturnValue(() => undefined);
  });

  it("notifies the parent when any SAM2 model is already installed", async () => {
    vi.mocked(getAvailableModels).mockResolvedValue({
      sam2: [
        {
          key: "sam2.1_hiera_small",
          label: "SAM2.1 Small",
          description: "Faster",
          installed: true,
        },
        {
          key: "sam2.1_hiera_large",
          label: "SAM2.1 Large",
          description: "Higher quality",
          installed: false,
        },
      ],
    });

    const onModelsInstalled = vi.fn();
    render(<Sam2ModelDownloadOverlay onModelsInstalled={onModelsInstalled} />);

    await waitFor(() => {
      expect(onModelsInstalled).toHaveBeenCalledTimes(1);
    });
  });

  it("does not notify the parent when no SAM2 models are installed", async () => {
    vi.mocked(getAvailableModels)
      .mockResolvedValue({
        sam2: [
          {
            key: "sam2.1_hiera_small",
            label: "SAM2.1 Small",
            description: "Faster",
            installed: false,
          },
          {
            key: "sam2.1_hiera_large",
            label: "SAM2.1 Large",
            description: "Higher quality",
            installed: false,
          },
        ],
      });

    const onModelsInstalled = vi.fn();
    render(<Sam2ModelDownloadOverlay onModelsInstalled={onModelsInstalled} />);

    await waitFor(() => {
      expect(getAvailableModels).toHaveBeenCalledTimes(1);
    });
    expect(onModelsInstalled).not.toHaveBeenCalled();
  });
});
