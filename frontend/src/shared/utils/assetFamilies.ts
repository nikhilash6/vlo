import type {
  Asset,
  AssetFamily,
  AssetFamilyCompatibility,
  AssetType,
} from "../../types/Asset";

const DEFAULT_IMAGE_DURATION_SECONDS = 5;

interface AssetFamilyCompatibilitySource {
  type: AssetType;
  duration?: number;
  fps?: number;
}

function normalizeDurationSeconds(
  assetType: AssetType,
  duration: number | undefined,
): number | null {
  const resolvedDuration =
    assetType === "image" ? (duration ?? DEFAULT_IMAGE_DURATION_SECONDS) : duration;
  if (typeof resolvedDuration !== "number" || !Number.isFinite(resolvedDuration)) {
    return null;
  }

  return Math.max(0, Math.round(resolvedDuration * 1000));
}

function normalizeFps(fps: number | undefined): number | null {
  if (typeof fps !== "number" || !Number.isFinite(fps) || fps <= 0) {
    return null;
  }

  return Math.round(fps * 1000);
}

export function buildAssetFamilyCompatibility(
  source: AssetFamilyCompatibilitySource,
): AssetFamilyCompatibility {
  return {
    assetType: source.type,
    durationMs: normalizeDurationSeconds(source.type, source.duration),
    fpsMilli: source.type === "video" ? normalizeFps(source.fps) : null,
  };
}

export function buildAssetFamilyCompatibilityFromAsset(
  asset: Pick<Asset, "type" | "duration" | "fps">,
): AssetFamilyCompatibility {
  return buildAssetFamilyCompatibility({
    type: asset.type,
    duration: asset.duration,
    fps: asset.fps,
  });
}

export function areAssetFamilyCompatibilitiesEqual(
  left: AssetFamilyCompatibility,
  right: AssetFamilyCompatibility,
): boolean {
  return (
    left.assetType === right.assetType &&
    left.durationMs === right.durationMs &&
    left.fpsMilli === right.fpsMilli
  );
}

export function doesAssetBelongToFamily(
  asset: Pick<Asset, "familyId">,
  family: Pick<AssetFamily, "id">,
): boolean {
  return asset.familyId === family.id;
}
