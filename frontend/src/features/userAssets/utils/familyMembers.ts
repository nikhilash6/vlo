import type { Asset, AssetFamily, AssetType } from "../../../types/Asset";
import { doesAssetBelongToFamily } from "../../../shared/utils/assetFamilies";
import { isAssetVisibleInBrowser } from "./assetVisibility";

export function getAssetsForFamilyId(
  assets: readonly Asset[],
  familyId: string | null | undefined,
): Asset[] {
  if (!familyId) {
    return [];
  }

  return assets.filter((asset) => asset.familyId === familyId);
}

export function pickRepresentativeAssetId(
  assets: readonly Asset[],
  familyId: string | null | undefined,
): string | undefined {
  return getAssetsForFamilyId(assets, familyId)
    .sort((left, right) => {
      const createdAtDifference = (right.createdAt || 0) - (left.createdAt || 0);
      if (createdAtDifference !== 0) {
        return createdAtDifference;
      }

      return left.name.localeCompare(right.name);
    })[0]?.id;
}

export function getFamilyMembers(
  assets: readonly Asset[],
  family: AssetFamily | null | undefined,
  assetType?: AssetType,
): Asset[] {
  if (!family) {
    return [];
  }

  const seenIds = new Set<string>();

  return assets
    .filter((asset) => {
      if (
        !isAssetVisibleInBrowser(asset) ||
        !doesAssetBelongToFamily(asset, family) ||
        (assetType !== undefined && asset.type !== assetType)
      ) {
        return false;
      }

      if (seenIds.has(asset.id)) {
        return false;
      }

      seenIds.add(asset.id);
      return true;
    })
    .sort((left, right) => {
      const createdAtDifference = (right.createdAt || 0) - (left.createdAt || 0);
      if (createdAtDifference !== 0) {
        return createdAtDifference;
      }

      return left.name.localeCompare(right.name);
    });
}

export function getFamilyMembersForAsset(
  assets: readonly Asset[],
  families: readonly AssetFamily[],
  asset: Asset | null | undefined,
): Asset[] {
  if (!asset?.familyId) {
    return [];
  }

  const family = families.find((candidate) => candidate.id === asset.familyId);
  return getFamilyMembers(assets, family, asset.type);
}

export function getAdjacentFamilyMemberForAsset(
  assets: readonly Asset[],
  families: readonly AssetFamily[],
  asset: Asset | null | undefined,
  direction: "previous" | "next",
): Asset | null {
  const familyMembers = getFamilyMembersForAsset(assets, families, asset);
  if (!asset || familyMembers.length <= 1) {
    return null;
  }

  const currentIndex = familyMembers.findIndex(
    (candidate) => candidate.id === asset.id,
  );
  if (currentIndex < 0) {
    return null;
  }

  const delta = direction === "previous" ? -1 : 1;
  const nextIndex =
    (currentIndex + delta + familyMembers.length) % familyMembers.length;

  return familyMembers[nextIndex] ?? null;
}
