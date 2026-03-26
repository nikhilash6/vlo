import React, { useState, useRef, useMemo, memo } from "react";
import {
  Box,
  Tabs,
  Tab,
  CircularProgress,
  Grid,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
} from "@mui/material";

// Icons
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import VideoLibraryIcon from "@mui/icons-material/VideoLibrary";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";
import LibraryMusicIcon from "@mui/icons-material/LibraryMusic";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import SortIcon from "@mui/icons-material/Sort";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";

import type { AssetType } from "../../types/Asset";
import { useAssetStore } from "./useAssetStore";
import { AssetCard } from "./components/AssetCard";
import { isAssetVisibleInBrowser } from "./utils/assetVisibility";
import { getFamilyMembers } from "./utils/familyMembers";

type SortOption = "dateDesc" | "dateAsc" | "nameAsc";
const ASSET_TYPE_PRIORITY: AssetType[] = ["video", "image", "audio"];

interface FamilyScope {
  familyId: string;
  assetType: AssetType;
}

function hasDraggedFiles(event: React.DragEvent<HTMLDivElement>): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

function getPreferredUploadedAssetType(
  assetTypes: readonly AssetType[],
): AssetType | null {
  for (const assetType of ASSET_TYPE_PRIORITY) {
    if (assetTypes.includes(assetType)) {
      return assetType;
    }
  }

  return null;
}

function isRepresentativeAsset(
  assetId: string,
  assetType: AssetType,
  familyId: string | null | undefined,
  families: ReturnType<typeof useAssetStore.getState>["families"],
  assets: ReturnType<typeof useAssetStore.getState>["assets"],
): boolean {
  if (!familyId) {
    return true;
  }

  const family = families.find((candidate) => candidate.id === familyId);
  if (!family?.representativeAssetId) {
    return true;
  }

  if (family.representativeAssetId === assetId) {
    return true;
  }

  const representativeAsset = assets.find(
    (candidate) => candidate.id === family.representativeAssetId,
  );

  // If family data is inconsistent, prefer showing the asset rather than hiding it.
  if (!representativeAsset || representativeAsset.type !== assetType) {
    return true;
  }

  return false;
}

function AssetBrowserComponent() {
  const [activeTab, setActiveTab] = useState<AssetType>("video");
  const [sortOption, setSortOption] = useState<SortOption>("dateDesc");
  const [sortAnchorEl, setSortAnchorEl] = useState<null | HTMLElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showFavouritesOnly, setShowFavouritesOnly] = useState(false);
  const [familyScope, setFamilyScope] = useState<FamilyScope | null>(null);

  const assets = useAssetStore((state) => state.assets);
  const families = useAssetStore((state) => state.families);

  const addLocalAssets = useAssetStore((state) => state.addLocalAssets);
  const isUploading = useAssetStore((state) => state.isUploading);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);

  const handleTabChange = (
    _event: React.SyntheticEvent,
    newValue: AssetType,
  ) => {
    setActiveTab(newValue);
  };

  const handleAssetFiles = async (files: readonly File[]) => {
    if (files.length === 0) {
      return;
    }

    const uploadedAssets = await addLocalAssets(files, { source: "uploaded" });
    const nextTab = getPreferredUploadedAssetType(
      uploadedAssets.map((asset) => asset.type),
    );

    if (nextTab) {
      setActiveTab(nextTab);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    void handleAssetFiles(files);
    event.target.value = "";
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragOver(true);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = isUploading ? "none" : "copy";
    if (!isUploading) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

    if (dragDepthRef.current === 0) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragOver(false);

    if (isUploading) {
      return;
    }

    void handleAssetFiles(Array.from(event.dataTransfer.files));
  };

  // --- Sort Handlers ---
  const handleSortClick = (event: React.MouseEvent<HTMLElement>) => {
    setSortAnchorEl(event.currentTarget);
  };

  const handleSortClose = (option?: SortOption) => {
    if (option) setSortOption(option);
    setSortAnchorEl(null);
  };

  const familyMembersByType = useMemo(() => {
    const membersByType = new Map<string, number>();

    for (const family of families) {
      for (const asset of getFamilyMembers(assets, family)) {
        const key = `${family.id}:${asset.type}`;
        membersByType.set(key, (membersByType.get(key) ?? 0) + 1);
      }
    }

    return membersByType;
  }, [assets, families]);

  const selectedFamily = useMemo(
    () =>
      familyScope
        ? families.find((family) => family.id === familyScope.familyId)
        : undefined,
    [families, familyScope],
  );

  const scopedFamilyAssets = useMemo(() => {
    if (!familyScope || !selectedFamily) {
      return [];
    }

    return getFamilyMembers(assets, selectedFamily, familyScope.assetType);
  }, [assets, selectedFamily, familyScope]);

  React.useEffect(() => {
    if (familyScope && !selectedFamily) {
      setFamilyScope(null);
    }
  }, [familyScope, selectedFamily]);

  React.useEffect(() => {
    if (!familyScope) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }

      const target = event.target;
      if (target instanceof Element && target.closest('[role="dialog"]')) {
        return;
      }

      event.preventDefault();
      setFamilyScope(null);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [familyScope]);

  const sortedAssets = useMemo(() => {
    const baseAssets = familyScope
      ? activeTab === familyScope.assetType
        ? scopedFamilyAssets
        : []
      : assets.filter(
          (asset) =>
            asset.type === activeTab &&
            isAssetVisibleInBrowser(asset) &&
            isRepresentativeAsset(
              asset.id,
              asset.type,
              asset.familyId,
              families,
              assets,
            ),
        );

    const filtered = baseAssets.filter(
      (asset) => !showFavouritesOnly || asset.favourite,
    );

    return filtered.sort((a, b) => {
      switch (sortOption) {
        case "nameAsc":
          return a.name.localeCompare(b.name);
        case "dateAsc":
          return (a.createdAt || 0) - (b.createdAt || 0);
        case "dateDesc":
        default:
          return (b.createdAt || 0) - (a.createdAt || 0);
      }
    });
  }, [
    assets,
    families,
    activeTab,
    familyScope,
    scopedFamilyAssets,
    sortOption,
    showFavouritesOnly,
  ]);

  const handleShowFamily = (familyId: string) => {
    setFamilyScope({
      familyId,
      assetType: activeTab,
    });
  };

  const handleClearFamilyScope = () => setFamilyScope(null);
  const isFamilyScopeActive = Boolean(familyScope && selectedFamily);
  const emptyStateMessage = isFamilyScopeActive
    ? `No ${activeTab} assets in this family.`
    : `No ${activeTab} assets.`;

  return (
    <Box
      data-testid="asset-browser"
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        position: "relative",
      }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 1. Combined Header Row */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          // Removed borderBottom here as requested
          minHeight: 48,
          px: 1,
          bgcolor: "#121212",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Left: Tabs (Compact) */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            minWidth: 0,
            gap: 1,
          }}
        >
          {isFamilyScopeActive ? (
            <Tooltip title="Back to all assets">
              <IconButton
                aria-label="Back to all assets"
                onClick={handleClearFamilyScope}
                size="small"
                sx={{ color: "#c9d1d9", flexShrink: 0 }}
              >
                <ArrowBackIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : null}

          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            textColor="primary"
            indicatorColor="primary"
            sx={{
              minHeight: 48,
              "& .MuiTab-root": {
                minWidth: 50,
                minHeight: 48,
                px: 2, // Tighter horizontal padding on tabs
              },
            }}
          >
            <Tab
              icon={<VideoLibraryIcon fontSize="small" />}
              value="video"
              aria-label="Videos"
              data-testid="asset-browser-tab-video"
            />
            <Tab
              icon={<PhotoLibraryIcon fontSize="small" />}
              value="image"
              aria-label="Images"
              data-testid="asset-browser-tab-image"
            />
            <Tab
              icon={<LibraryMusicIcon fontSize="small" />}
              value="audio"
              aria-label="Audio"
              data-testid="asset-browser-tab-audio"
            />
          </Tabs>

          {isFamilyScopeActive && selectedFamily ? (
            <Box
              data-testid="asset-browser-family-scope"
              sx={{
                display: { xs: "none", sm: "flex" },
                alignItems: "center",
                gap: 0.75,
                minWidth: 0,
                px: 1.25,
                py: 0.75,
                borderRadius: 999,
                bgcolor: "#1b1b1b",
                border: "1px solid #2b2b2b",
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: "#9aa0a6",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Family
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: "#f1f3f4",
                  fontFamily: "monospace",
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={selectedFamily.id}
              >
                {selectedFamily.id}
              </Typography>
            </Box>
          ) : null}
        </Box>

        {/* Right: Actions Container */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            bgcolor: "#333", // Distinct background color
            borderRadius: "16px", // Rounded capsule shape
            px: 1,
            py: 0.5,
          }}
        >
          {/* Sort Icon */}
          <Tooltip title="Sort Assets">
            <IconButton
              onClick={handleSortClick}
              size="small"
              sx={{ color: "#aaa" }}
              data-testid="asset-browser-sort-button"
            >
              <SortIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip
            title={showFavouritesOnly ? "Show all assets" : "Show favourites"}
          >
            <IconButton
              onClick={() => setShowFavouritesOnly((current) => !current)}
              size="small"
              aria-label={
                showFavouritesOnly ? "Show all assets" : "Show favourite assets"
              }
              aria-pressed={showFavouritesOnly}
              sx={{ color: showFavouritesOnly ? "#ff4d4f" : "#aaa" }}
            >
              {showFavouritesOnly ? (
                <FavoriteIcon fontSize="small" />
              ) : (
                <FavoriteBorderIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>

          {/* Sort Menu */}
          <Menu
            anchorEl={sortAnchorEl}
            open={Boolean(sortAnchorEl)}
            onClose={() => handleSortClose()}
            PaperProps={{
              sx: { bgcolor: "#333", color: "white" },
            }}
          >
            <MenuItem
              onClick={() => handleSortClose("dateDesc")}
              selected={sortOption === "dateDesc"}
            >
              Newest First
            </MenuItem>
            <MenuItem
              onClick={() => handleSortClose("dateAsc")}
              selected={sortOption === "dateAsc"}
            >
              Oldest First
            </MenuItem>
            <MenuItem
              onClick={() => handleSortClose("nameAsc")}
              selected={sortOption === "nameAsc"}
            >
              Name (A-Z)
            </MenuItem>
          </Menu>

          {/* Upload Icon */}
          <input
            type="file"
            hidden
            data-testid="hidden-file-input"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="video/*,image/*,audio/*"
            multiple
          />
          <Tooltip title="Import Asset">
            <span>
              <IconButton
                aria-label="Import Asset"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                size="small"
                sx={{
                  // Bright blue color to stand out, similar to the old primary button
                  color: isUploading ? "#666" : "#4dabf5",
                }}
              >
                {isUploading ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  <UploadFileIcon fontSize="small" />
                )}
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {/* 2. Scrollable Grid Area */}
      <Box sx={{ flexGrow: 1, overflowY: "auto", p: 2 }}>
        {sortedAssets.length === 0 ? (
          <Typography
            variant="body2"
            sx={{ textAlign: "center", mt: 4, color: "#666" }}
          >
            {emptyStateMessage}
          </Typography>
        ) : (
          <Grid container spacing={2}>
            {sortedAssets.map((asset) => (
              <Grid size={{ xs: 6 }} key={asset.id}>
                <AssetCard
                  asset={asset}
                  onShowFamily={
                    !isFamilyScopeActive &&
                    asset.familyId &&
                    (familyMembersByType.get(`${asset.familyId}:${asset.type}`) ?? 0) >
                      1
                      ? handleShowFamily
                      : undefined
                  }
                />
              </Grid>
            ))}
          </Grid>
        )}
      </Box>

      {(isUploading || isDragOver) && (
        <Box
          aria-label={
            isUploading ? "Importing assets overlay" : "Drop assets overlay"
          }
          data-testid={
            isUploading
              ? "asset-browser-upload-overlay"
              : "asset-browser-drop-overlay"
          }
          sx={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: isUploading
              ? "rgba(18, 18, 18, 0.72)"
              : "rgba(77, 171, 245, 0.14)",
            border: isDragOver && !isUploading ? "2px dashed #4dabf5" : "none",
            pointerEvents: "none",
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1.5,
              px: 3,
              py: 2,
              borderRadius: 2,
              bgcolor: "rgba(18, 18, 18, 0.92)",
            }}
          >
            {isUploading ? (
              <>
                <CircularProgress size={32} />
                <Typography variant="body2">Importing assets...</Typography>
              </>
            ) : (
              <Typography variant="body2">Drop files to import</Typography>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}

export const AssetBrowser = memo(AssetBrowserComponent);
