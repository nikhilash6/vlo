import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { TimelineClip } from "../../../../types/TimelineTypes";
import { TICKS_PER_SECOND } from "../../../timeline";
import { useAssetBrowserRevealStore } from "../../useAssetBrowserRevealStore";
import { useTimelineAssetRevealClipOverlay } from "../useTimelineAssetRevealClipOverlay";

const baseClip: TimelineClip = {
  id: "clip-1",
  trackId: "track-1",
  start: 0,
  type: "video",
  assetId: "asset-1",
  name: "Clip 1",
  sourceDuration: 10 * TICKS_PER_SECOND,
  transformedDuration: 10 * TICKS_PER_SECOND,
  transformedOffset: 0,
  timelineDuration: 10 * TICKS_PER_SECOND,
  croppedSourceDuration: 10 * TICKS_PER_SECOND,
  offset: 0,
  transformations: [],
};

function useOverlayItems(clip: TimelineClip) {
  const overlay = useTimelineAssetRevealClipOverlay();
  return overlay.useItems({ clip, isSelected: false });
}

describe("useTimelineAssetRevealClipOverlay", () => {
  beforeEach(() => {
    useAssetBrowserRevealStore.setState({ revealRequest: null });
  });

  it("creates a bottom-right endpoint overlay that reveals the asset in the browser", () => {
    const { result } = renderHook(() => useOverlayItems(baseClip));

    expect(result.current).toHaveLength(1);
    expect(result.current[0].placement).toMatchObject({
      kind: "endpoint",
      edge: "end",
      lane: "bottom",
      insetPx: 8,
    });

    result.current[0].onClick?.();

    expect(useAssetBrowserRevealStore.getState().revealRequest).toMatchObject({
      assetId: "asset-1",
      requestId: expect.any(Number),
    });
  });

  it("omits the reveal overlay for clips that do not reference an asset", () => {
    const { result } = renderHook(() =>
      useOverlayItems({ ...baseClip, assetId: undefined }),
    );

    expect(result.current).toEqual([]);
  });
});
