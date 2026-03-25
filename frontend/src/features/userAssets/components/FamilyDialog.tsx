import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Typography,
} from "@mui/material";
import type { AssetFamily } from "../../../types/Asset";
import { useAssetStore } from "../useAssetStore";
import { getFamilyMembers } from "../utils/familyMembers";
import { AssetCard } from "./AssetCard";

interface FamilyDialogProps {
  family: AssetFamily | null | undefined;
  open: boolean;
  onClose: () => void;
}

export function FamilyDialog({ family, open, onClose }: FamilyDialogProps) {
  const assets = useAssetStore((state) => state.assets);
  const familyMembers = getFamilyMembers(assets, family);
  const familyLabel = family?.id ?? "Unknown family";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      PaperProps={{
        sx: {
          bgcolor: "#111",
          color: "white",
          width: "min(1440px, calc(100vw - 48px))",
          maxWidth: "none",
          minHeight: "min(860px, calc(100vh - 48px))",
        },
      }}
    >
      <DialogTitle sx={{ pr: 8, pt: 3, pb: 2 }}>
        <Box
          sx={{
            display: "inline-flex",
            flexDirection: "column",
            gap: 0.75,
            maxWidth: "min(100%, 460px)",
            px: 2,
            py: 1.75,
            borderRadius: 2.5,
            bgcolor: "#171717",
            border: "1px solid #262626",
          }}
        >
          <Typography variant="h6" component="div">
            Asset Family
          </Typography>
          <Typography
            variant="caption"
            component="div"
            sx={{
              color: "#9aa0a6",
              fontFamily: "monospace",
              wordBreak: "break-all",
            }}
          >
            {familyLabel}
          </Typography>
          <Typography variant="body2" sx={{ color: "#c4c7c5" }}>
            {familyMembers.length} member{familyMembers.length === 1 ? "" : "s"}
          </Typography>
        </Box>
      </DialogTitle>

      <IconButton
        aria-label="Close family dialog"
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

      <DialogContent
        dividers
        sx={{
          bgcolor: "#0b0b0b",
          borderColor: "#222",
          px: { xs: 2, md: 3 },
          py: { xs: 2, md: 3 },
        }}
      >
        {familyMembers.length === 0 ? (
          <Box
            sx={{
              py: 6,
              textAlign: "center",
            }}
          >
            <Typography variant="body2" sx={{ color: "#8a8a8a" }}>
              No assets from this family are available yet.
            </Typography>
          </Box>
        ) : (
          <Grid container spacing={2.5}>
            {familyMembers.map((asset) => (
              <Grid size={{ xs: 12, sm: 6, lg: 4, xl: 3 }} key={asset.id}>
                <AssetCard asset={asset} layout="square" />
              </Grid>
            ))}
          </Grid>
        )}
      </DialogContent>
    </Dialog>
  );
}
