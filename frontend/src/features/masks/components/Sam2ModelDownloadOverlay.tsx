import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  LinearProgress,
  Typography,
} from "@mui/material";
import { CloudDownload, Check, Close } from "@mui/icons-material";
import {
  getAvailableModels,
  startModelDownload,
  cancelDownload,
  subscribeToProgress,
  type DownloadableModel,
  type DownloadProgressEvent,
} from "../../../services/downloadApi";

interface Sam2ModelDownloadOverlayProps {
  onModelsInstalled: () => void;
}

interface ActiveDownload {
  jobId: string;
  modelKey: string;
  progress: DownloadProgressEvent | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const cardSx = {
  p: 1.5,
  borderRadius: 1,
  border: "1px solid #3a3d44",
  bgcolor: "#2a2d33",
};

export function Sam2ModelDownloadOverlay({ onModelsInstalled }: Sam2ModelDownloadOverlayProps) {
  const [models, setModels] = useState<DownloadableModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDownload, setActiveDownload] = useState<ActiveDownload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getAvailableModels();
      setModels(response.sam2);

      const hasInstalledModel = response.sam2.some((m) => m.installed);
      if (hasInstalledModel) {
        onModelsInstalled();
      }
    } catch {
      // Silently fail — overlay still shows generic message
    } finally {
      setLoading(false);
    }
  }, [onModelsInstalled]);

  useEffect(() => {
    void fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    return () => {
      unsubRef.current?.();
    };
  }, []);

  const handleDownload = useCallback(async (modelKey: string) => {
    setError(null);
    try {
      const result = await startModelDownload("sam2", modelKey);
      const download: ActiveDownload = { jobId: result.jobId, modelKey, progress: null };
      setActiveDownload(download);

      unsubRef.current?.();
      unsubRef.current = subscribeToProgress(
        result.jobId,
        (event) => {
          setActiveDownload((prev) => prev ? { ...prev, progress: event } : null);
          if (event.status === "complete") {
            unsubRef.current?.();
            unsubRef.current = null;
            setTimeout(() => {
              void fetchModels();
              setActiveDownload(null);
            }, 1000);
          }
          if (event.status === "failed" || event.status === "cancelled") {
            unsubRef.current?.();
            unsubRef.current = null;
            if (event.status === "failed") {
              setError(event.error ?? "Download failed");
            }
            setActiveDownload(null);
          }
        },
        (err) => {
          setError(err.message);
          setActiveDownload(null);
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start download");
    }
  }, [fetchModels]);

  const handleCancel = useCallback(async () => {
    if (!activeDownload) return;
    try {
      await cancelDownload(activeDownload.jobId);
    } catch {
      // Cancel is best-effort
    }
  }, [activeDownload]);

  if (loading) return null;

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
      }}
    >
      <CloudDownload sx={{ fontSize: 40, color: "text.secondary" }} />
      <Typography variant="subtitle2" sx={{ color: "text.primary" }}>
        SAM2 Models Required
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary", lineHeight: 1.5 }}>
        Download a model to enable AI-powered mask generation.
      </Typography>

      {error && (
        <Typography variant="caption" sx={{ color: "error.main" }}>
          {error}
        </Typography>
      )}

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, width: "100%" }}>
        {models.map((model) => {
          const isDownloading = activeDownload?.modelKey === model.key;
          const progress = isDownloading ? activeDownload.progress : null;
          const isComplete = progress?.status === "complete";
          const pct =
            progress?.progress.overallBytesTotal && progress.progress.overallBytesTotal > 0
              ? Math.round((progress.progress.overallBytes / progress.progress.overallBytesTotal) * 100)
              : null;

          return (
            <Box key={model.key} sx={cardSx}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: "text.primary" }}>
                  {model.label}
                </Typography>
                {model.installed && (
                  <Check sx={{ fontSize: 16, color: "success.main" }} />
                )}
              </Box>
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1 }}>
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
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
                      onClick={() => void handleCancel()}
                      sx={{ minWidth: 0, p: 0.5, textTransform: "none" }}
                    >
                      <Close sx={{ fontSize: 14 }} />
                    </Button>
                  </Box>
                  {isComplete && (
                    <Typography variant="caption" sx={{ color: "success.main", mt: 0.5 }}>
                      Download complete
                    </Typography>
                  )}
                </Box>
              ) : (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<CloudDownload sx={{ fontSize: 14 }} />}
                  onClick={() => void handleDownload(model.key)}
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
    </Box>
  );
}
