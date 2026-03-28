import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnsureAssetFileLoaded } = vi.hoisted(() => ({
  mockEnsureAssetFileLoaded: vi.fn(),
}));

vi.mock("../../../userAssets", () => ({
  ensureAssetFileLoaded: mockEnsureAssetFileLoaded,
}));

import {
  hasProvidedMediaInputValue,
  resolveAssetFileForGeneration,
} from "../mediaInputAssets";

describe("mediaInputAssets", () => {
  beforeEach(() => {
    mockEnsureAssetFileLoaded.mockReset();
    globalThis.fetch = vi.fn();
  });

  it("treats lazy video assets as provided workflow inputs", () => {
    expect(
      hasProvidedMediaInputValue("video", {
        kind: "asset",
        asset: {
          id: "asset-1",
          hash: "hash",
          name: "clip.mp4",
          type: "video",
          src: "assets/clip.mp4",
          createdAt: Date.now(),
        },
      }),
    ).toBe(true);
  });

  it("treats dragged image assets as provided even when stored asset.type is stale", () => {
    expect(
      hasProvidedMediaInputValue("image", {
        kind: "asset",
        asset: {
          id: "asset-legacy-image",
          hash: "hash-image",
          name: "frame.png",
          type: "video",
          src: "assets/frame.png",
          createdAt: Date.now(),
        },
      }),
    ).toBe(true);
  });

  it("hydrates generation asset files from the asset store before falling back to fetch", async () => {
    const hydratedFile = new File(["video"], "hydrated.mp4", {
      type: "video/mp4",
    });
    mockEnsureAssetFileLoaded.mockResolvedValue(hydratedFile);

    await expect(
      resolveAssetFileForGeneration({
        id: "asset-1",
        file: undefined,
        src: "assets/clip.mp4",
        name: "clip.mp4",
        type: "video",
      }),
    ).resolves.toBe(hydratedFile);

    expect(mockEnsureAssetFileLoaded).toHaveBeenCalledWith("asset-1");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("falls back to fetching the asset source when no hydrated file exists", async () => {
    mockEnsureAssetFileLoaded.mockResolvedValue(null);
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["image"], { type: "image/webp" }),
    } as Response);

    const file = await resolveAssetFileForGeneration({
      id: "asset-2",
      file: undefined,
      src: "blob:image-asset",
      name: "frame.webp",
      type: "image",
    });

    expect(globalThis.fetch).toHaveBeenCalledWith("blob:image-asset");
    expect(file.name).toBe("frame.webp");
    expect(file.type).toBe("image/webp");
  });
});
