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

function isPositiveFiniteNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
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

export function isAssetFamilyCompatibilityComplete(
  compatibility: AssetFamilyCompatibility | null | undefined,
): compatibility is AssetFamilyCompatibility {
  if (!compatibility || !isPositiveFiniteNumber(compatibility.durationMs)) {
    return false;
  }

  if (compatibility.assetType === "video") {
    return isPositiveFiniteNumber(compatibility.fpsMilli);
  }

  return compatibility.fpsMilli === null;
}

export function doesAssetMatchFamilyCompatibility(
  asset: Pick<Asset, "type" | "duration" | "fps">,
  compatibility: AssetFamilyCompatibility | null | undefined,
): boolean {
  if (!compatibility) {
    return false;
  }

  return areAssetFamilyCompatibilitiesEqual(
    buildAssetFamilyCompatibilityFromAsset(asset),
    compatibility,
  );
}

export function doesAssetBelongToFamily(
  asset: Pick<Asset, "familyId" | "type" | "duration" | "fps">,
  family: Pick<AssetFamily, "id" | "compatibility">,
): boolean {
  return (
    asset.familyId === family.id &&
    doesAssetMatchFamilyCompatibility(asset, family.compatibility)
  );
}
