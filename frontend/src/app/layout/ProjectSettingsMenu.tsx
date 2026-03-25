import { useState, type ChangeEvent } from "react";
import {
  Box,
  Checkbox,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import ViewSidebarIcon from "@mui/icons-material/ViewSidebar";
import ViewStreamIcon from "@mui/icons-material/ViewStream";
import CheckIcon from "@mui/icons-material/Check";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import {
  EXACT_INPUT_ASPECT_RATIO_TOOLTIP,
  type AspectRatio,
} from "../../features/project";
import { useProjectStore } from "../../features/project/useProjectStore";

const FPS_OPTIONS = [16, 24, 25, 30, 60];

const ASPECT_RATIO_OPTIONS: Array<{ value: AspectRatio; label: string }> = [
  { value: "16:9", label: "16:9 (Landscape)" },
  { value: "4:3", label: "4:3 (Standard)" },
  { value: "1:1", label: "1:1 (Square)" },
  { value: "3:4", label: "3:4 (Portrait)" },
  { value: "9:16", label: "9:16 (Story)" },
];

export function ProjectSettingsMenu() {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const config = useProjectStore((state) => state.config);
  const updateConfig = useProjectStore((state) => state.updateConfig);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLayoutChange = (mode: "full-height" | "compact") => {
    void updateConfig({ layoutMode: mode });
    handleClose();
  };

  const handleFpsChange = (fps: number) => {
    void updateConfig({ fps });
    handleClose();
  };

  const handleAspectRatioChange = (aspectRatio: AspectRatio) => {
    void updateConfig({ aspectRatio });
    handleClose();
  };
  const handleExactInputAspectRatioChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    void updateConfig({ exactInputAspectRatio: event.target.checked });
  };
  const currentLayout = config.layoutMode || "compact";
  const currentFps = config.fps || 30;
  const currentAspectRatio = config.aspectRatio || "16:9";
  const currentExactInputAspectRatio = Boolean(config.exactInputAspectRatio);

  return (
    <>
      <IconButton
        onClick={handleClick}
        size="small"
        sx={{ ml: 1, color: "rgba(255, 255, 255, 0.7)" }}
        data-testid="project-settings-button"
        aria-label="Project Settings"
      >
        <SettingsIcon fontSize="small" />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        slotProps={{
          paper: {
            sx: {
              bgcolor: "#1e1e1e",
              color: "white",
              border: "1px solid #333",
              minWidth: 200,
            },
          },
        }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="caption" color="gray">
            LAYOUT
          </Typography>
        </Box>
        <MenuItem onClick={() => handleLayoutChange("full-height")}>
          <ListItemIcon>
            <ViewSidebarIcon
              fontSize="small"
              sx={{
                color:
                  currentLayout === "full-height" ? "primary.main" : "white",
              }}
            />
          </ListItemIcon>
          <ListItemText>Full Height Sidebars</ListItemText>
          {currentLayout === "full-height" && (
            <CheckIcon fontSize="small" color="primary" sx={{ ml: 1 }} />
          )}
        </MenuItem>
        <MenuItem onClick={() => handleLayoutChange("compact")}>
          <ListItemIcon>
            <ViewStreamIcon
              fontSize="small"
              sx={{
                color: currentLayout === "compact" ? "primary.main" : "white",
              }}
            />
          </ListItemIcon>
          <ListItemText>Classic (Wide Timeline)</ListItemText>
          {currentLayout === "compact" && (
            <CheckIcon fontSize="small" color="primary" sx={{ ml: 1 }} />
          )}
        </MenuItem>

        <Divider sx={{ borderColor: "#333" }} />
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="caption" color="gray">
            FPS
          </Typography>
        </Box>
        {FPS_OPTIONS.map((fps) => (
          <MenuItem key={fps} onClick={() => handleFpsChange(fps)}>
            <ListItemText>{`${fps} fps`}</ListItemText>
            {currentFps === fps && (
              <CheckIcon fontSize="small" color="primary" sx={{ ml: 1 }} />
            )}
          </MenuItem>
        ))}

        <Divider sx={{ borderColor: "#333" }} />
        <Box
          sx={{
            px: 2,
            py: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
          }}
        >
          <Typography variant="caption" color="gray">
            ASPECT RATIO
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Typography variant="caption" color="gray">
              EXACT
            </Typography>
            <Checkbox
              checked={currentExactInputAspectRatio}
              onChange={handleExactInputAspectRatioChange}
              size="small"
              inputProps={{
                "aria-label": "Match input aspect ratio exactly",
              }}
              sx={{
                color: "rgba(255, 255, 255, 0.65)",
                p: 0.25,
                "&.Mui-checked": {
                  color: "primary.main",
                },
              }}
            />
            <Tooltip title={EXACT_INPUT_ASPECT_RATIO_TOOLTIP} arrow>
              <IconButton
                size="small"
                sx={{ color: "rgba(255, 255, 255, 0.6)", p: 0.25 }}
                aria-label="Exact aspect ratio help"
              >
                <InfoOutlinedIcon fontSize="inherit" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
        {ASPECT_RATIO_OPTIONS.map((ratio) => (
          <MenuItem
            key={ratio.value}
            onClick={() => handleAspectRatioChange(ratio.value)}
          >
            <ListItemText>{ratio.label}</ListItemText>
            {currentAspectRatio === ratio.value && (
              <CheckIcon fontSize="small" color="primary" sx={{ ml: 1 }} />
            )}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
