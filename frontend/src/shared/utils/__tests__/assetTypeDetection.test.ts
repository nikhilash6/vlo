import { describe, expect, it } from "vitest";

import {
  assetMatchesType,
  resolveAssetType,
} from "../assetTypeDetection";

describe("assetTypeDetection", () => {
  it("prefers the file mime type over stale stored asset metadata", () => {
    const assetType = resolveAssetType({
      file: new File(["image"], "poster.bin", { type: "image/png" }),
      type: "video",
      name: "poster.bin",
      src: "blob:poster",
    });

    expect(assetType).toBe("image");
  });

  it("falls back to the asset filename when the stored type is stale", () => {
    expect(
      assetMatchesType(
        {
          type: "video",
          file: undefined,
          name: "reference-frame.webp",
          src: "assets/reference-frame.webp",
        },
        "image",
      ),
    ).toBe(true);
  });

  it("detects media types from source urls with query params", () => {
    expect(
      resolveAssetType({
        type: "audio",
        file: undefined,
        name: "mystery",
        src: "assets/clip.mov?cache=123#preview",
      }),
    ).toBe("video");
  });
});
