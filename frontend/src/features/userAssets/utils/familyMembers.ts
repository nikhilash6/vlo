import type { Asset, AssetFamily } from "../../../types/Asset";
import { isAssetVisibleInBrowser } from "./assetVisibility";

function isAssetInFamily(asset: Asset, family: AssetFamily): boolean {
  const familyHashes = family.hashes ?? [];
  return asset.family?.uuid === family.uuid || familyHashes.includes(asset.hash);
}

export function getFamilyMembers(
  assets: readonly Asset[],
  family: AssetFamily | null | undefined,
): Asset[] {
  if (!family) {
    return [];
  }

  const seenIds = new Set<string>();

  return assets
    .filter((asset) => {
      if (!isAssetVisibleInBrowser(asset) || !isAssetInFamily(asset, family)) {
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
