import type { Asset } from "../../../types/Asset";
import { assetMatchesType } from "../../../shared/utils/assetTypeDetection";
import type { GenerationMediaInputValue } from "../types";
import { ensureAssetFileLoaded } from "../../userAssets";

function fallbackMimeTypeForAssetType(assetType: Asset["type"]): string {
  if (assetType === "image") {
    return "image/png";
  }
  if (assetType === "video") {
    return "video/mp4";
  }
  return "application/octet-stream";
}

export function hasProvidedMediaInputValue(
  inputType: "image" | "video",
  value: GenerationMediaInputValue | null | undefined,
): boolean {
  if (!value) return false;

  if (value.kind === "asset") {
    return assetMatchesType(value.asset, inputType);
  }

  if (inputType === "image") {
    return value.kind === "frame";
  }

  return (
    value.kind === "timelineSelection" &&
    value.preparedVideoFile !== null &&
    !value.isExtracting
  );
}

export async function resolveAssetFileForGeneration(
  asset: Pick<Asset, "id" | "file" | "src" | "name" | "type">,
): Promise<File> {
  if (asset.file) {
    return asset.file;
  }

  const hydratedFile = await ensureAssetFileLoaded(asset.id);
  if (hydratedFile) {
    return hydratedFile;
  }

  const response = await fetch(asset.src);
  if (!response.ok) {
    throw new Error(`Failed to fetch generation asset file (${response.status})`);
  }

  const blob = await response.blob();
  return new File([blob], asset.name, {
    type: blob.type || fallbackMimeTypeForAssetType(asset.type),
    lastModified: Date.now(),
  });
}
