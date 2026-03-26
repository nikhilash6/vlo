import type { Input } from "mediabunny";
import type { Asset, AssetFamily, AssetFamilyCompatibility } from "../../types/Asset";
import { buildAssetFamilyCompatibility } from "../../shared/utils/assetFamilies";
import { useAssetStore } from "./useAssetStore";
import { mediaProcessingService } from "./services/MediaProcessingService";

function findAssetById(
  assets: readonly Asset[],
  assetId: string | null | undefined,
): Asset | undefined {
  if (!assetId) {
    return undefined;
  }

  return assets.find((asset) => asset.id === assetId);
}

export function useAsset(assetId: string | null | undefined): Asset | undefined {
  return useAssetStore((state) => findAssetById(state.assets, assetId));
}

export function getAssets(): Asset[] {
  return useAssetStore.getState().assets;
}

function findFamilyById(
  families: readonly AssetFamily[],
  familyId: string | null | undefined,
): AssetFamily | undefined {
  if (!familyId) {
    return undefined;
  }

  return families.find((family) => family.id === familyId);
}

export function getAssetById(
  assetId: string | null | undefined,
): Asset | undefined {
  return findAssetById(useAssetStore.getState().assets, assetId);
}

export function useFamily(
  familyId: string | null | undefined,
): AssetFamily | undefined {
  return useAssetStore((state) => findFamilyById(state.families, familyId));
}

export function getFamilies(): AssetFamily[] {
  return useAssetStore.getState().families;
}

export function getFamilyById(
  familyId: string | null | undefined,
): AssetFamily | undefined {
  return findFamilyById(useAssetStore.getState().families, familyId);
}

export async function addLocalAsset(
  file: File,
  creationMetadata?: Asset["creationMetadata"],
  familyId?: Asset["familyId"],
): Promise<Asset | null> {
  return useAssetStore.getState().addLocalAsset(file, creationMetadata, familyId);
}

export async function addLocalAssetWithFamily(
  file: File,
  creationMetadata?: Asset["creationMetadata"],
  family?: Pick<AssetFamily, "id" | "compatibility">,
): Promise<Asset | null> {
  return useAssetStore
    .getState()
    .addLocalAssetWithFamily(file, creationMetadata, family);
}

export async function upsertFamily(family: AssetFamily): Promise<void> {
  await useAssetStore.getState().upsertFamily(family);
}

export async function deleteAsset(assetId: string): Promise<void> {
  await useAssetStore.getState().deleteAsset(assetId);
}

export async function scanForNewAssets(): Promise<void> {
  await useAssetStore.getState().scanForNewAssets();
}

export async function getAssetInput(assetId: string): Promise<Input | null> {
  return useAssetStore.getState().getInput(assetId);
}

export async function inspectAssetFamilyCompatibility(
  file: File,
): Promise<AssetFamilyCompatibility | null> {
  let candidateFile = file;

  if (
    !candidateFile.type ||
    candidateFile.type === "application/octet-stream" ||
    candidateFile.type === "text/plain"
  ) {
    const detectedMimeType = await mediaProcessingService.detectMimeType(file);
    if (detectedMimeType) {
      candidateFile = new File([file], file.name, {
        type: detectedMimeType,
      });
    }
  }

  if (candidateFile.type.startsWith("image/")) {
    return buildAssetFamilyCompatibility({
      type: "image",
      duration: 5,
    });
  }

  if (candidateFile.type.startsWith("audio/")) {
    const duration = await mediaProcessingService.computeDuration(candidateFile);
    return buildAssetFamilyCompatibility({
      type: "audio",
      duration,
    });
  }

  if (candidateFile.type.startsWith("video/")) {
    const metadata =
      await mediaProcessingService.getVideoTimingMetadata(candidateFile);
    return buildAssetFamilyCompatibility({
      type: "video",
      duration: metadata.duration,
      fps:
        typeof metadata.fps === "number" && metadata.fps > 0
          ? metadata.fps
          : undefined,
    });
  }

  return null;
}
