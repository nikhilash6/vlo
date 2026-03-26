import React, { useCallback, useState } from "react";
import {
  Box,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Typography,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import { useDraggable } from "@dnd-kit/core";
import MusicNoteIcon from "@mui/icons-material/MusicNote";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import DeleteIcon from "@mui/icons-material/Delete";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ReplayIcon from "@mui/icons-material/Replay";
import TimelineIcon from "@mui/icons-material/Timeline";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import type { Asset } from "../../../types/Asset";
import {
  createClipFromAsset,
  insertAssetAtTime,
  useTimelineClipCountForAsset,
} from "../../timeline";
import {
  canRegenerateFromAssetMetadata,
  useGenerationStore,
} from "../../generation/publicApi";
import { getTimelineSelectionFromAsset } from "../../timelineSelection";
import { useAssetStore } from "../useAssetStore";
import { AssetPreviewDialog } from "./AssetPreviewDialog";

interface AssetCardProps {
  asset: Asset;
  onShowFamily?: (familyId: string) => void;
  layout?: "default" | "square";
}

// Styled Components for better performance
const StyledCard = styled(Paper, {
  shouldForwardProp: (prop) => prop !== "isDragging" && prop !== "layout",
})<{ isDragging?: boolean; layout: "default" | "square" }>(
  ({ isDragging, layout }) => ({
  width: "100%",
  backgroundColor: "#252525",
  color: "white",
  overflow: "hidden",
  cursor: "grab",
  transition: "transform 0.1s",
  "&:hover": { transform: "scale(1.02)" },
  position: "relative",
  opacity: isDragging ? 0.5 : 1,
  ...(layout === "square"
    ? {
        aspectRatio: "1 / 1",
      }
    : {}),
}));

const ThumbnailContainer = styled(Box, {
  shouldForwardProp: (prop) => prop !== "layout",
})<{ layout: "default" | "square" }>(({ layout }) => ({
  height: layout === "square" ? "100%" : 80,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "#000",
  position: "relative",
}));

const OverlayControls = styled(Box, {
  shouldForwardProp: (prop) => prop !== "isPlaying",
})<{ isPlaying: boolean }>(({ isPlaying }) => ({
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: isPlaying ? "transparent" : "rgba(0,0,0,0.3)",
  opacity: isPlaying ? 0 : 1,
  transition: "opacity 0.2s",
  "&:hover": { opacity: 1 },
}));

const DurationBadge = styled(Box)({
  position: "absolute",
  bottom: 4,
  right: 4,
  backgroundColor: "rgba(0, 0, 0, 0.7)",
  paddingLeft: 4,
  paddingRight: 4,
  borderRadius: 2,
  pointerEvents: "none",
});

const StyledActionButton = styled(IconButton)({
  position: "absolute",
  top: 4,
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  color: "white",
  padding: 4,
  "&:hover": {
    backgroundColor: "rgba(0, 0, 0, 0.75)",
  },
  zIndex: 10,
});

const StyledFavouriteButton = styled(StyledActionButton)({
  left: 4,
});

const StyledMenuButton = styled(StyledActionButton)({
  right: 4,
});

const MetadataArea = styled(Box, {
  shouldForwardProp: (prop) => prop !== "layout",
})<{ layout: "default" | "square" }>(({ layout }) => ({
  padding: 8,
  ...(layout === "square"
    ? {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 2,
        paddingTop: 28,
        background:
          "linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(9, 9, 9, 0.84) 44%, rgba(9, 9, 9, 0.96) 100%)",
      }
    : {}),
}));

const ContentRoot = styled(Box)({
  height: "100%",
});

const EMPTY_PREVIEW_STYLES = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  height: "100%",
} as const;

const MEDIA_ACTION_STYLES = {
  color: "white",
} as const;

const DURATION_TEXT_STYLES = {
  fontSize: "0.6rem",
  color: "white",
} as const;

const TIMESTAMP_STYLES = {
  fontSize: "0.65rem",
  color: "#aaa",
} as const;

const MENU_ANCHOR_ORIGIN = {
  vertical: "bottom",
  horizontal: "right",
} as const;

const MENU_TRANSFORM_ORIGIN = {
  vertical: "top",
  horizontal: "right",
} as const;

// Helper to format seconds into MM:SS
const formatDuration = (seconds?: number) => {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

function canRegenerateFromMetadata(asset: Asset): boolean {
  return canRegenerateFromAssetMetadata(asset.creationMetadata);
}

function AssetCardContent({
  asset,
  onShowFamily,
  layout = "default",
}: AssetCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null);

  const displayImage =
    asset.thumbnail || (asset.type === "image" ? asset.src : null);

  const deleteAsset = useAssetStore((state) => state.deleteAsset);
  const updateAsset = useAssetStore((state) => state.updateAsset);
  const timelineClipCount = useTimelineClipCountForAsset(asset.id);
  const timelineSelection = getTimelineSelectionFromAsset(asset);
  const canRegenerate = canRegenerateFromMetadata(asset);
  const canShowFamily = Boolean(asset.familyId && onShowFamily);
  const isMenuOpen = Boolean(menuAnchorEl);

  const handleMouseLeave = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleOpenMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      event.preventDefault();
      setMenuAnchorEl(event.currentTarget);
    },
    [],
  );

  const handleCloseMenu = useCallback(() => {
    setMenuAnchorEl(null);
  }, []);

  const handleDelete = useCallback(() => {
    handleCloseMenu();
    const confirmMessage =
      timelineClipCount > 0
        ? "Are you sure you want to delete this asset? This will remove it from disk permanently.\n\nThis asset is used by clips on the Timeline.\nClips on the Timeline are derived from the asset and will be deleted."
        : "Are you sure you want to delete this asset? This will remove it from disk permanently.";

    if (window.confirm(confirmMessage)) {
      void deleteAsset(asset.id);
    }
  }, [asset.id, deleteAsset, handleCloseMenu, timelineClipCount]);

  const handleSendToTimeline = useCallback(() => {
    handleCloseMenu();
    if (!timelineSelection) {
      return;
    }

    insertAssetAtTime(asset, timelineSelection.start);
  }, [asset, handleCloseMenu, timelineSelection]);

  const handleRegenerate = useCallback(async () => {
    handleCloseMenu();

    try {
      await useGenerationStore.getState().loadWorkflowFromAssetMetadata(asset);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load workflow metadata";
      window.alert(message);
    }
  }, [asset, handleCloseMenu]);

  const handleOpenFamily = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      event.preventDefault();
      if (asset.familyId && onShowFamily) {
        onShowFamily(asset.familyId);
      }
    },
    [asset.familyId, onShowFamily],
  );

  const handleFavouriteToggle = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      event.preventDefault();
      void updateAsset(asset.id, { favourite: !asset.favourite });
    },
    [asset.favourite, asset.id, updateAsset],
  );

  const handlePlayToggle = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();

      if (asset.type === "video") {
        setIsPreviewOpen(true);
        return;
      }

      if (asset.type === "audio") {
        setIsPlaying((prev) => !prev);
      }
    },
    [asset.type],
  );

  const handlePreviewClose = useCallback(() => {
    setIsPreviewOpen(false);
  }, []);

  return (
    <>
      <ContentRoot onMouseLeave={handleMouseLeave}>
        {/* Thumbnail / Video Area */}
        <ThumbnailContainer layout={layout}>
          {displayImage ? (
            <img
              src={displayImage}
              alt={asset.name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <Box sx={EMPTY_PREVIEW_STYLES}>
              {asset.type === "audio" ? (
                <MusicNoteIcon sx={{ fontSize: 40, color: "#888" }} />
              ) : (
                <Typography variant="caption" sx={{ color: "#555" }}>
                  No Preview
                </Typography>
              )}
            </Box>
          )}

          {/* Audio Player */}
          {isPlaying && asset.type === "audio" && (
            <audio src={asset.src} autoPlay loop />
          )}

          {/* Video/Audio Overlay Controls */}
          {(asset.type === "video" || asset.type === "audio") && (
            <OverlayControls isPlaying={asset.type === "audio" && isPlaying}>
              <IconButton
                onClick={handlePlayToggle}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label={
                  asset.type === "video"
                    ? "Preview video"
                    : isPlaying
                      ? "Pause audio"
                      : "Play audio"
                }
                sx={MEDIA_ACTION_STYLES}
              >
                {asset.type === "audio" && isPlaying ? (
                  <PauseCircleOutlineIcon sx={{ fontSize: 32 }} />
                ) : (
                  <PlayCircleOutlineIcon sx={{ fontSize: 32 }} />
                )}
              </IconButton>
            </OverlayControls>
          )}

          {/* Duration Badge */}
          {asset.type !== "image" && asset.duration && (
            <DurationBadge
              sx={{
                bottom: layout === "square" ? 56 : 4,
              }}
            >
              <Typography
                variant="caption"
                sx={DURATION_TEXT_STYLES}
              >
                {formatDuration(asset.duration)}
              </Typography>
            </DurationBadge>
          )}
        </ThumbnailContainer>

        <StyledFavouriteButton
          size="small"
          onClick={handleFavouriteToggle}
          onPointerDown={(event) => event.stopPropagation()}
          aria-label={
            asset.favourite ? "Remove from favourites" : "Add to favourites"
          }
          title={asset.favourite ? "Remove from favourites" : "Add to favourites"}
          sx={{
            color: asset.favourite ? "#ff4d4f" : "white",
          }}
        >
          {asset.favourite ? (
            <FavoriteIcon fontSize="small" />
          ) : (
            <FavoriteBorderIcon fontSize="small" />
          )}
        </StyledFavouriteButton>

        {canShowFamily ? (
          <StyledMenuButton
            size="small"
            onClick={handleOpenFamily}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Open family"
            title="Open family"
            sx={{ right: 34 }}
          >
            <FolderOpenIcon fontSize="small" />
          </StyledMenuButton>
        ) : null}

        <StyledMenuButton
          size="small"
          onClick={handleOpenMenu}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Asset actions"
          title="Asset actions"
        >
          <MoreVertIcon fontSize="small" />
        </StyledMenuButton>
        {isMenuOpen ? (
          <Menu
            anchorEl={menuAnchorEl}
            open
            onClose={handleCloseMenu}
            anchorOrigin={MENU_ANCHOR_ORIGIN}
            transformOrigin={MENU_TRANSFORM_ORIGIN}
            onClick={(event) => event.stopPropagation()}
          >
            {canRegenerate ? (
              <MenuItem onClick={() => void handleRegenerate()}>
                <ListItemIcon>
                  <ReplayIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Regenerate</ListItemText>
              </MenuItem>
            ) : null}
            {timelineSelection ? (
              <MenuItem onClick={handleSendToTimeline}>
                <ListItemIcon>
                  <TimelineIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Send to Timeline</ListItemText>
              </MenuItem>
            ) : null}
            <MenuItem onClick={handleDelete}>
              <ListItemIcon>
                <DeleteIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Delete</ListItemText>
            </MenuItem>
          </Menu>
        ) : null}

        {/* Metadata Area */}
        <MetadataArea layout={layout}>
          <Typography
            variant="caption"
            noWrap
            display="block"
            sx={{
              fontWeight: 500,
              pr: layout === "square" ? 3 : 0,
            }}
            title={asset.name} // Tooltip for long names
            data-testid="asset-card-name"
          >
            {asset.name}
          </Typography>
          <Typography
            variant="caption"
            display="block"
            sx={TIMESTAMP_STYLES}
          >
            {asset.createdAt
              ? new Date(asset.createdAt).toLocaleTimeString()
              : "Unknown Time"}
            {/* Fallback added in case createdAt is missing in legacy data */}
          </Typography>
        </MetadataArea>
      </ContentRoot>

      {asset.type === "video" && isPreviewOpen ? (
        <AssetPreviewDialog
          asset={asset}
          open
          onClose={handlePreviewClose}
        />
      ) : null}
    </>
  );
}

const MemoizedAssetCardContent = React.memo(AssetCardContent);

function AssetCardComponent({
  asset,
  onShowFamily,
  layout = "default",
}: AssetCardProps) {
  const draggableData = React.useMemo(
    () => ({
      type: "asset",
      clip: createClipFromAsset(asset),
      asset,
    }),
    [asset],
  );

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `asset_${asset.id}`,
    data: draggableData,
  });

  return (
    <StyledCard
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      elevation={2}
      isDragging={isDragging}
      layout={layout}
      data-testid="asset-card"
    >
      <MemoizedAssetCardContent
        asset={asset}
        onShowFamily={onShowFamily}
        layout={layout}
      />
    </StyledCard>
  );
}

export const AssetCard = React.memo(AssetCardComponent);
