import { useMemo } from "react";
import ImageSearchIcon from "@mui/icons-material/ImageSearch";
import { Box } from "@mui/material";
import { styled } from "@mui/material/styles";
import {
  createEndpointOverlayItem,
  type TimelineClipOverlayDefinition,
} from "../../timeline";
import { revealAssetInBrowser } from "../useAssetBrowserRevealStore";

const RevealAssetBadge = styled(Box)({
  width: 18,
  height: 18,
  borderRadius: 999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#f3f4f6",
  backgroundColor: "rgba(12, 12, 12, 0.72)",
  border: "1px solid rgba(255, 255, 255, 0.18)",
  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.45)",
  transition: "background-color 0.12s ease, border-color 0.12s ease",
  "&:hover": {
    backgroundColor: "rgba(77, 171, 245, 0.82)",
    borderColor: "rgba(255, 255, 255, 0.38)",
  },
});

function useAssetRevealOverlayItems({
  clip,
}: Parameters<TimelineClipOverlayDefinition["useItems"]>[0]) {
  return useMemo(() => {
    const assetId = clip.assetId;
    if (!assetId) {
      return [];
    }

    return [
      createEndpointOverlayItem({
        id: `reveal-asset:${clip.id}`,
        edge: "end",
        lane: "bottom",
        insetPx: 8,
        minClipWidthPx: 56,
        content: (
          <RevealAssetBadge title="Reveal asset in browser">
            <ImageSearchIcon sx={{ fontSize: 13 }} />
          </RevealAssetBadge>
        ),
        onClick: () => {
          revealAssetInBrowser(assetId);
        },
      }),
    ];
  }, [clip.assetId, clip.id]);
}

const TIMELINE_ASSET_REVEAL_CLIP_OVERLAY: TimelineClipOverlayDefinition = {
  id: "timeline-asset-reveal-overlay",
  useItems: useAssetRevealOverlayItems,
};

export function useTimelineAssetRevealClipOverlay(): TimelineClipOverlayDefinition {
  return TIMELINE_ASSET_REVEAL_CLIP_OVERLAY;
}
