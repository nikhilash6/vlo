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
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: "#111",
          color: "white",
        },
      }}
    >
      <DialogTitle sx={{ pr: 7 }}>
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
        <Typography variant="body2" sx={{ mt: 1, color: "#c4c7c5" }}>
          {familyMembers.length} member{familyMembers.length === 1 ? "" : "s"}
        </Typography>
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

      <DialogContent dividers sx={{ bgcolor: "#0b0b0b", borderColor: "#222" }}>
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
          <Grid container spacing={2}>
            {familyMembers.map((asset) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={asset.id}>
                <AssetCard asset={asset} />
              </Grid>
            ))}
          </Grid>
        )}
      </DialogContent>
    </Dialog>
  );
}
