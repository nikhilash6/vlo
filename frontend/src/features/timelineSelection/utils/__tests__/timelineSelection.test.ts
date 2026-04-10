import { describe, expect, it } from "vitest";
import {
  getTicksPerFrame,
  normalizeTimelineSelection,
  resolveSelectionFps,
  resolveSelectionFrameStep,
  snapFrameCountToStep,
} from "../timelineSelection";
import { TICKS_PER_SECOND } from "../../../timeline";

describe("timelineSelection helpers", () => {
  it("resolves selection fps over project fps", () => {
    expect(resolveSelectionFps({ fps: 24 }, 30)).toBe(24);
    expect(resolveSelectionFps({ fps: null }, 30)).toBe(30);
  });

  it("falls back to project fps when selection fps is missing", () => {
    expect(resolveSelectionFps({}, 30)).toBe(30);
  });

  it("resolves frame step with sane defaults", () => {
    expect(resolveSelectionFrameStep({ frameStep: 8 })).toBe(8);
    expect(resolveSelectionFrameStep({ frameStep: 0 })).toBe(1);
    expect(resolveSelectionFrameStep(undefined)).toBe(1);
  });

  it("snaps frame counts to step*n + 1", () => {
    expect(snapFrameCountToStep(30, 4, "floor")).toBe(29);
    expect(snapFrameCountToStep(31, 4, "floor")).toBe(29);
    expect(snapFrameCountToStep(1, 8, "floor")).toBe(1);
  });

  it("computes ticks per frame from fps", () => {
    expect(getTicksPerFrame(30)).toBe(TICKS_PER_SECOND / 30);
  });

  it("filters malformed clips from saved selections and recovers from the timeline", () => {
    const timelineClip = {
      id: "clip-1",
      type: "video" as const,
      name: "Clip",
      assetId: "asset-1",
      sourceDuration: 100,
      transformedDuration: 100,
      transformedOffset: 0,
      timelineDuration: 100,
      croppedSourceDuration: 100,
      offset: 0,
      transformations: [],
      trackId: "track-1",
      start: 0,
    };

    expect(
      normalizeTimelineSelection(
        {
          start: 0,
          end: 100,
          clips: [null as unknown as typeof timelineClip],
        },
        [timelineClip],
      ),
    ).toEqual({
      start: 0,
      end: 100,
      clips: [timelineClip],
    });
  });
});
