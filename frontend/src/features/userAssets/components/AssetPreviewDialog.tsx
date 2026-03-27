import { useEffect } from "react";
import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
} from "@mui/material";
import type { Asset } from "../../../types/Asset";
import { useAssetSourceUrl } from "../publicApi";

interface AssetPreviewDialogProps {
  asset: Asset;
  open: boolean;
  onClose: () => void;
}

export function AssetPreviewDialog({
  asset,
  open,
  onClose,
}: AssetPreviewDialogProps) {
  const sourceUrl = useAssetSourceUrl(asset.id, open);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleWindowBlur() {
      onClose();
    }

    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [onClose, open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: "#050505",
          color: "white",
          overflow: "hidden",
        },
      }}
    >
      <DialogTitle sx={{ pr: 7, fontSize: "0.95rem" }}>{asset.name}</DialogTitle>
      <IconButton
        aria-label="Close preview"
        onClick={onClose}
        sx={{
          position: "absolute",
          top: 8,
          right: 8,
          color: "white",
          zIndex: 1,
        }}
      >
        <CloseIcon />
      </IconButton>
      <DialogContent sx={{ p: 0, bgcolor: "#000" }}>
        {sourceUrl ? (
          <Box
            component="video"
            src={sourceUrl}
            autoPlay
            controls
            playsInline
            aria-label={`${asset.name} preview`}
            sx={{
              display: "block",
              width: "100%",
              maxHeight: "75vh",
              backgroundColor: "#000",
            }}
          />
        ) : (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 280,
              color: "#9aa0a6",
            }}
          >
            <Typography variant="body2">Loading preview...</Typography>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
