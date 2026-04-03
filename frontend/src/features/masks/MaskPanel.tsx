import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  ButtonGroup,
  Menu,
  MenuItem,
  Typography,
  Divider,
  Chip,
} from "@mui/material";
import { DeleteOutline, Add } from "@mui/icons-material";
import { MASK_TYPES } from "./model/maskFactory";
import { useMaskPanel } from "./hooks/useMaskPanel";
import {
  DefaultTransformationSections,
  getDefaultTransforms,
  getEntryByType,
  getDefaultSectionId,
  useTransformationController,
} from "../transformations";
import { parseMaskClipId } from "../timeline";
import { Sam2MaskPanel } from "./components/Sam2MaskPanel";
import { Sam2ModelDownloadOverlay } from "./components/Sam2ModelDownloadOverlay";

const connectedButtonSx = {
  textTransform: "none",
  borderColor: "#2f333a",
  bgcolor: "#4a4f57",
  color: "#f2f3f5",
  "&:hover": {
    bgcolor: "#5a606b",
    borderColor: "#2f333a",
  },
  "&.Mui-disabled": {
    bgcolor: "#3a3f47",
    color: "#8a8f98",
    borderColor: "#2f333a",
  },
};

const selectedConnectedButtonSx = {
  ...connectedButtonSx,
  bgcolor: "#6b7280",
  color: "#ffffff",
  "&:hover": {
    bgcolor: "#7a8292",
  },
};

function useLocalActiveSection(
  activeContextId: string | undefined,
  sectionOrder: string[],
) {
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeContextId || sectionOrder.length === 0) {
      setActiveSectionId(null);
      return;
    }

    setActiveSectionId((currentSectionId) => {
      if (currentSectionId && sectionOrder.includes(currentSectionId)) {
        return currentSectionId;
      }
      return sectionOrder[0] ?? null;
    });
  }, [activeContextId, sectionOrder]);

  const activateSection = useCallback(
    (sectionId: string) => {
      if (!activeContextId) return;
      setActiveSectionId(sectionId);
    },
    [activeContextId],
  );

  return {
    activeSectionId,
    activateSection,
  };
}

export const MaskPanel = memo(function MaskPanel() {
  const {
    selectedClipId,
    masks,
    selectedMaskId,
    selectedMask,
    addMenuAnchorEl,
    isAddDisabled,
    addDisabledReason,
    setAddMenuAnchorEl,
    requestDraw,
    selectMask,
    setMaskMode,
    maskInverted,
    setMaskInverted,
    sam2PointMode,
    setSam2PointMode,
    sam2Points,
    isSam2Available,
    isSam2Checking,
    sam2AvailabilityError,
    ensureSam2Available,
    sam2CurrentFramePointsCount,
    clearSam2Points,
    clearSam2CurrentFramePoints,
    generateSam2FramePreview,
    isSam2FrameGenerating,
    sam2FramePreviewError,
    generateSam2Mask,
    isSam2Generating,
    sam2GenerateError,
    isSam2Dirty,
    hasSam2MaskAsset,
    deleteSelectedMask,
  } = useMaskPanel();
  const {
    activeContextId: sharedMaskContextId,
    activeTransforms: sharedMaskTransforms,
    activeTimelineClip: sharedMaskTimelineClip,
    setActiveTransforms: setSharedMaskTransforms,
    updateActiveTransform: updateSharedMaskTransform,
    handleSetDefaultGroupsEnabled: handleSetSharedMaskGroupsEnabled,
    handleCommit: handleSharedMaskCommit,
  } = useTransformationController({ target: "maskComposite" });
  const {
    activeContextId: selectedMaskContextId,
    activeTransforms: selectedMaskTransforms,
    activeTimelineClip: selectedMaskTimelineClip,
    setActiveTransforms: setSelectedMaskTransforms,
    updateActiveTransform: updateSelectedMaskTransform,
    handleSetDefaultGroupsEnabled: handleSetSelectedMaskGroupsEnabled,
    handleCommit: handleSelectedMaskCommit,
  } = useTransformationController({ target: "mask" });

  const layoutDefinitions = useMemo(
    () =>
      getDefaultTransforms().filter(
        (definition) => definition.type === "layout",
      ),
    [],
  );
  const growDefinitions = useMemo(() => {
    const grow = getEntryByType("mask_grow");
    return grow ? [grow] : [];
  }, []);
  const featherDefinitions = useMemo(() => {
    const feather = getEntryByType("feather");
    return feather ? [feather] : [];
  }, []);
  const sharedMaskOperationDefinitions = useMemo(
    () => [...growDefinitions, ...featherDefinitions],
    [growDefinitions, featherDefinitions],
  );

  // SAM2 masks are point-based and don't use shape transformation sections.
  // Compute this before the section hook to pass an empty sectionOrder.
  const selectedMaskIsSam2 =
    selectedMask?.type === "mask" && selectedMask.maskType === "sam2";

  const sharedSectionOrder = useMemo(
    () =>
      sharedMaskOperationDefinitions.map((definition) =>
        getDefaultSectionId(definition.type),
      ),
    [sharedMaskOperationDefinitions],
  );
  const selectedMaskSectionOrder = useMemo(
    () =>
      selectedMaskIsSam2
        ? []
        : layoutDefinitions.map((definition) =>
            getDefaultSectionId(definition.type),
          ),
    [layoutDefinitions, selectedMaskIsSam2],
  );

  const {
    activeSectionId: activeSharedSectionId,
    activateSection: activateSharedSection,
  } = useLocalActiveSection(
    sharedMaskContextId,
    selectedClipId ? sharedSectionOrder : [],
  );
  const {
    activeSectionId: activeSelectedMaskSectionId,
    activateSection: activateSelectedMaskSection,
  } = useLocalActiveSection(
    selectedMaskContextId,
    selectedMask ? selectedMaskSectionOrder : [],
  );

  const handleModelsInstalled = useCallback(() => {
    void ensureSam2Available();
  }, [ensureSam2Available]);

  if (!selectedClipId) return null;

  const selectedMaskIndex = selectedMask
    ? masks.findIndex((mask) => mask.id === selectedMask.id)
    : -1;
  const selectedMaskLabel =
    selectedMaskIndex >= 0 ? `Mask ${selectedMaskIndex + 1}` : "Mask";
  const selectedMaskMode =
    (selectedMask?.type === "mask" ? selectedMask.maskMode : undefined) ??
    "apply";
  const isSam2Mask = selectedMaskIsSam2;
  const showSam2DownloadOverlay = isSam2Mask && !isSam2Available;

  return (
    <Box
      data-testid="mask-panel"
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        overflowY: "auto",
      }}
    >
      <Box sx={{ px: 2, pt: 2, pb: 1 }}>
        <Typography
          variant="caption"
          sx={{ color: "text.secondary", display: "block", mb: 1 }}
        >
          Clip Masks
        </Typography>
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 1,
            width: "100%",
          }}
        >
          {masks.map((mask, index) => (
            <Chip
              key={mask.id}
              data-testid="mask-chip"
              label={`Mask ${index + 1}`}
              size="small"
              variant="outlined"
              color={
                parseMaskClipId(mask.id)?.maskId === selectedMaskId
                  ? "primary"
                  : "default"
              }
              onClick={() => {
                const maskLocalId = parseMaskClipId(mask.id)?.maskId;
                if (maskLocalId) selectMask(maskLocalId);
              }}
              sx={{
                fontSize: "0.75rem",
                height: 24,
                cursor: "pointer",
              }}
            />
          ))}
          <Chip
            size="small"
            data-testid="mask-add-chip"
            label="Add mask"
            variant="outlined"
            icon={<Add sx={{ fontSize: "1rem !important" }} />}
            onClick={(event) => setAddMenuAnchorEl(event.currentTarget)}
            disabled={isAddDisabled}
            sx={{
              fontSize: "0.75rem",
              height: 24,
              cursor: isAddDisabled ? "default" : "pointer",
            }}
          />
        </Box>
        <Menu
          data-testid="mask-add-menu"
          anchorEl={addMenuAnchorEl}
          open={Boolean(addMenuAnchorEl)}
          onClose={() => setAddMenuAnchorEl(null)}
        >
          {MASK_TYPES.map((shape) => (
            <MenuItem key={shape} onClick={() => requestDraw(shape)}>
              {shape[0].toUpperCase() + shape.slice(1)}
            </MenuItem>
          ))}
        </Menu>
        {addDisabledReason && (
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", display: "block", mt: 1 }}
          >
            {addDisabledReason}
          </Typography>
        )}
      </Box>

      {sharedMaskContextId && sharedMaskOperationDefinitions.length > 0 && (
        <Box sx={{ px: 2, pb: 1 }}>
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", display: "block", mb: 1 }}
          >
            Shared Mask Edges
          </Typography>
          <DefaultTransformationSections
            definitions={sharedMaskOperationDefinitions}
            activeTransforms={sharedMaskTransforms}
            activeContextId={sharedMaskContextId}
            activeSectionId={activeSharedSectionId}
            timelineClip={sharedMaskTimelineClip}
            onCommit={handleSharedMaskCommit}
            onSetDefaultGroupsEnabled={handleSetSharedMaskGroupsEnabled}
            onUpdateTransform={updateSharedMaskTransform}
            onSetTransforms={setSharedMaskTransforms}
            onActivateSection={activateSharedSection}
          />
        </Box>
      )}

      {selectedMask ? (
        isSam2Mask ? (
          <>
            {showSam2DownloadOverlay && (
              <Sam2ModelDownloadOverlay
                onModelsInstalled={handleModelsInstalled}
              />
            )}
            <Sam2MaskPanel
              maskMode={selectedMaskMode}
              maskInverted={maskInverted}
              maskLabel={selectedMaskLabel}
              sam2PointMode={sam2PointMode}
              points={sam2Points}
              currentFramePointsCount={sam2CurrentFramePointsCount}
              isSam2Available={isSam2Available}
              isSam2Checking={isSam2Checking}
              sam2AvailabilityError={sam2AvailabilityError}
              onClearPoints={clearSam2Points}
              onClearCurrentFramePoints={clearSam2CurrentFramePoints}
              onGenerateFramePreview={generateSam2FramePreview}
              isFrameGenerating={isSam2FrameGenerating}
              framePreviewError={sam2FramePreviewError}
              onGenerateMask={generateSam2Mask}
              isGenerating={isSam2Generating}
              generateError={sam2GenerateError}
              isDirty={isSam2Dirty}
              hasMaskAsset={hasSam2MaskAsset}
              onSetMaskMode={setMaskMode}
              onSetMaskInverted={setMaskInverted}
              onSetSam2PointMode={setSam2PointMode}
            />
            <Box sx={{ px: 2, pb: 2 }}>
              <Divider sx={{ borderColor: "#2a2d33", mb: 2 }} />
              <Button
                data-testid="mask-delete-button"
                variant="outlined"
                color="error"
                startIcon={<DeleteOutline fontSize="small" />}
                onClick={deleteSelectedMask}
                sx={{ textTransform: "none", width: "100%" }}
              >
                Delete Mask
              </Button>
            </Box>
          </>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Box sx={{ px: 2 }}>
              <Typography
                variant="caption"
                sx={{ color: "text.secondary", display: "inline-block", mr: 1 }}
              >
                {selectedMaskLabel}
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: "text.disabled", display: "inline-block" }}
              >
                {`— Shape: ${selectedMask?.type === "mask" ? (selectedMask.maskType ?? "rectangle") : "rectangle"}`}
              </Typography>
            </Box>

            <DefaultTransformationSections
              definitions={layoutDefinitions}
              activeTransforms={selectedMaskTransforms}
              activeContextId={selectedMaskContextId}
              activeSectionId={activeSelectedMaskSectionId}
              timelineClip={selectedMaskTimelineClip}
              onCommit={handleSelectedMaskCommit}
              onSetDefaultGroupsEnabled={handleSetSelectedMaskGroupsEnabled}
              onUpdateTransform={updateSelectedMaskTransform}
              onSetTransforms={setSelectedMaskTransforms}
              onActivateSection={activateSelectedMaskSection}
            />

            <Box sx={{ px: 2, pb: 2 }}>
              <Divider sx={{ borderColor: "#2a2d33", mb: 2 }} />

              <Typography
                variant="caption"
                sx={{ color: "text.secondary", display: "block", mb: 1 }}
              >
                Mode
              </Typography>
              <ButtonGroup
                variant="contained"
                disableElevation
                size="small"
                fullWidth
                sx={{ mb: 1 }}
              >
                <Button
                  data-testid="mask-mode-apply"
                  onClick={() => setMaskMode("apply")}
                  sx={
                    selectedMaskMode === "apply"
                      ? selectedConnectedButtonSx
                      : connectedButtonSx
                  }
                >
                  Apply
                </Button>
                <Button
                  data-testid="mask-mode-preview"
                  onClick={() => setMaskMode("preview")}
                  sx={
                    selectedMaskMode === "preview"
                      ? selectedConnectedButtonSx
                      : connectedButtonSx
                  }
                >
                  Preview
                </Button>
                <Button
                  data-testid="mask-mode-off"
                  onClick={() => setMaskMode("off")}
                  sx={
                    selectedMaskMode === "off"
                      ? selectedConnectedButtonSx
                      : connectedButtonSx
                  }
                >
                  Off
                </Button>
              </ButtonGroup>

              <Typography
                variant="caption"
                sx={{ color: "text.secondary", display: "block", mb: 1 }}
              >
                Inversion
              </Typography>
              <ButtonGroup
                variant="contained"
                disableElevation
                size="small"
                fullWidth
                sx={{ mb: 1 }}
              >
                <Button
                  data-testid="mask-inversion-normal"
                  onClick={() => setMaskInverted(false)}
                  sx={
                    !maskInverted
                      ? selectedConnectedButtonSx
                      : connectedButtonSx
                  }
                >
                  Normal
                </Button>
                <Button
                  data-testid="mask-inversion-inverted"
                  onClick={() => setMaskInverted(true)}
                  sx={
                    maskInverted ? selectedConnectedButtonSx : connectedButtonSx
                  }
                >
                  Inverted
                </Button>
              </ButtonGroup>

              <Button
                data-testid="mask-delete-button"
                variant="outlined"
                color="error"
                startIcon={<DeleteOutline fontSize="small" />}
                onClick={deleteSelectedMask}
                sx={{ textTransform: "none", width: "100%" }}
              >
                Delete Mask
              </Button>
            </Box>
          </Box>
        )
      ) : (
        <Box sx={{ px: 2, pb: 2 }}>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Add a mask to start editing.
          </Typography>
        </Box>
      )}
    </Box>
  );
});
