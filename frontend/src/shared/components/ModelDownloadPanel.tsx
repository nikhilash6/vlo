import type { ReactNode } from "react";
import {
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Typography,
} from "@mui/material";
import { Check, Close } from "@mui/icons-material";
import type { DownloadableModel } from "../../services/downloadApi";
import type { ActiveModelDownload } from "../hooks/useModelDownloadController";

interface ModelDownloadPanelProps {
  icon?: ReactNode;
  title: string;
  description: string;
  models: DownloadableModel[];
  loading: boolean;
  loadingLabel: string;
  error: string | null;
  activeDownload: ActiveModelDownload | null;
  beforeModels?: ReactNode;
  emptyState?: ReactNode;
  onDownload: (modelKey: string) => void;
  onCancel: () => void;
}

const cardSx = {
  p: 1.5,
  borderRadius: 1,
  border: "1px solid #3a3d44",
  bgcolor: "#2a2d33",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function ModelDownloadPanel({
  icon,
  title,
  description,
  models,
  loading,
  loadingLabel,
  error,
  activeDownload,
  beforeModels,
  emptyState,
  onDownload,
  onCancel,
}: ModelDownloadPanelProps) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        px: 2,
        py: 3,
        gap: 2,
        textAlign: "center",
        borderRadius: 1,
        border: "1px solid #3a3d44",
        bgcolor: "#1f2126",
      }}
    >
      {icon ?? null}
      <Typography variant="subtitle2" sx={{ color: "text.primary" }}>
        {title}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary", lineHeight: 1.5 }}>
        {description}
      </Typography>

      {error ? (
        <Typography variant="caption" sx={{ color: "error.main" }}>
          {error}
        </Typography>
      ) : null}

      {beforeModels ? <Box sx={{ width: "100%" }}>{beforeModels}</Box> : null}

      {loading ? (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1,
            width: "100%",
            py: 1,
          }}
        >
          <CircularProgress size={20} />
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {loadingLabel}
          </Typography>
        </Box>
      ) : models.length > 0 ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, width: "100%" }}>
          {models.map((model) => {
            const isDownloading = activeDownload?.modelKey === model.key;
            const progress = isDownloading ? activeDownload.progress : null;
            const pct =
              progress?.progress.overallBytesTotal &&
              progress.progress.overallBytesTotal > 0
                ? Math.round(
                    (progress.progress.overallBytes / progress.progress.overallBytesTotal) * 100,
                  )
                : null;

            return (
              <Box key={model.key} sx={cardSx}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 0.5,
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 600, color: "text.primary" }}>
                    {model.label}
                  </Typography>
                  {model.installed ? (
                    <Check sx={{ fontSize: 16, color: "success.main" }} />
                  ) : null}
                </Box>
                <Typography
                  variant="caption"
                  sx={{ color: "text.secondary", display: "block", mb: 1 }}
                >
                  {model.description}
                </Typography>

                {model.installed ? (
                  <Typography variant="caption" sx={{ color: "success.main" }}>
                    Installed
                  </Typography>
                ) : isDownloading ? (
                  <Box>
                    <LinearProgress
                      variant={pct !== null ? "determinate" : "indeterminate"}
                      value={pct ?? undefined}
                      sx={{ mb: 0.5, borderRadius: 1 }}
                    />
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        {progress?.progress.overallBytes != null
                          ? formatBytes(progress.progress.overallBytes)
                          : "Starting..."}
                        {progress?.progress.overallBytesTotal != null
                          ? ` / ${formatBytes(progress.progress.overallBytesTotal)}`
                          : ""}
                        {pct !== null ? ` (${pct}%)` : ""}
                      </Typography>
                      <Button
                        size="small"
                        color="error"
                        onClick={() => void onCancel()}
                        sx={{ minWidth: 0, p: 0.5, textTransform: "none" }}
                      >
                        <Close sx={{ fontSize: 14 }} />
                      </Button>
                    </Box>
                  </Box>
                ) : (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => void onDownload(model.key)}
                    disabled={activeDownload !== null}
                    sx={{ textTransform: "none", width: "100%" }}
                  >
                    Download
                  </Button>
                )}
              </Box>
            );
          })}
        </Box>
      ) : (
        emptyState ?? null
      )}
    </Box>
  );
}
