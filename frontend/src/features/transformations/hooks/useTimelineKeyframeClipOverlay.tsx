import { useMemo } from "react";
import { Box } from "@mui/material";
import { styled } from "@mui/material/styles";
import { useShallow } from "zustand/react/shallow";
import type { TimelineClipOverlayDefinition } from "../../timeline/clipOverlayApi";
import { createLayerTimeOverlayItem } from "../../timeline/clipOverlayApi";
import {
  parseMaskClipId,
  selectMaskClipsForParent,
  useTimelineStore,
} from "../../timeline/useTimelineStore";
import type { TimelineClip } from "../../../types/TimelineTypes";
import { useTransformationViewStore } from "../store/useTransformationViewStore";
import { collectSectionKeyframes } from "../utils/sectionKeyframes";

const DiamondMarker = styled(Box)(() => ({
  width: 8,
  height: 8,
  transform: "rotate(45deg)",
  border: "1px solid rgba(0,0,0,0.65)",
  boxShadow: "0 0 4px rgba(0,0,0,0.5)",
  pointerEvents: "none",
}));

function resolveKeyframeLane(
  groupIndex: number,
  maxGroupIndex: number,
): "top" | "middle" | "bottom" {
  if (maxGroupIndex <= 0) {
    return "middle";
  }

  if (maxGroupIndex === 1) {
    return groupIndex === 0 ? "top" : "bottom";
  }

  if (groupIndex <= 0) {
    return "top";
  }

  if (groupIndex >= maxGroupIndex) {
    return "bottom";
  }

  return "middle";
}

function resolveActiveClipKeyframes(
  clip: TimelineClip,
  maskClips: TimelineClip[],
  activeSection: { clipId: string; sectionId: string } | null,
) {
  if (!activeSection) {
    return [];
  }

  if (activeSection.clipId === clip.id) {
    return collectSectionKeyframes(clip, activeSection.sectionId);
  }

  const parsedMaskClipId = parseMaskClipId(activeSection.clipId);
  if (!parsedMaskClipId || parsedMaskClipId.clipId !== clip.id) {
    return [];
  }

  const maskClip = maskClips.find((candidate) => candidate.id === activeSection.clipId);
  if (!maskClip) {
    return [];
  }

  return collectSectionKeyframes(maskClip, activeSection.sectionId);
}

function useKeyframeOverlayItems({
  clip,
}: {
  clip: TimelineClip;
  isSelected: boolean;
}) {
  const activeSection = useTransformationViewStore((state) => {
    const currentActiveSection = state.activeSection;
    if (!currentActiveSection) {
      return null;
    }

    if (currentActiveSection.clipId === clip.id) {
      return currentActiveSection;
    }

    const parsedMaskClipId = parseMaskClipId(currentActiveSection.clipId);
    if (parsedMaskClipId?.clipId === clip.id) {
      return currentActiveSection;
    }

    return null;
  });

  const maskClips = useTimelineStore(
    useShallow((state) => selectMaskClipsForParent(state, clip.id)),
  );

  return useMemo(() => {
    const keyframes = resolveActiveClipKeyframes(clip, maskClips, activeSection);
    if (keyframes.length === 0) {
      return [];
    }

    const maxGroupIndex = keyframes.reduce(
      (largestGroupIndex, marker) =>
        Math.max(largestGroupIndex, marker.groupIndex),
      0,
    );

    return keyframes.map((marker) =>
      createLayerTimeOverlayItem({
        id: marker.id,
        transformId: marker.transformId,
        layerInputTicks: marker.inputTime,
        lane: resolveKeyframeLane(marker.groupIndex, maxGroupIndex),
        content: <DiamondMarker sx={{ backgroundColor: marker.color }} />,
      }),
    );
  }, [activeSection, clip, maskClips]);
}

const TIMELINE_KEYFRAME_CLIP_OVERLAY: TimelineClipOverlayDefinition = {
  id: "timeline-keyframe-overlay",
  useItems: useKeyframeOverlayItems,
};

export function useTimelineKeyframeClipOverlay(): TimelineClipOverlayDefinition {
  return TIMELINE_KEYFRAME_CLIP_OVERLAY;
}
