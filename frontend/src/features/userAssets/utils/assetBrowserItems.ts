import type { Asset, AssetFamily, AssetType } from "../../../types/Asset";
import { getFamilyMembers } from "./familyMembers";
import { isAssetVisibleInBrowser } from "./assetVisibility";

export type AssetBrowserItem =
  | {
      kind: "asset";
      asset: Asset;
      sortAsset: Asset;
    }
  | {
      kind: "family";
      asset: Asset;
      family: AssetFamily;
      memberCount: number;
      sortAsset: Asset;
    };

interface BuildAssetBrowserItemsOptions {
  assets: readonly Asset[];
  families: readonly AssetFamily[];
  assetType: AssetType;
  showFavouritesOnly: boolean;
}

function pickRepresentativeMember(
  family: AssetFamily,
  members: readonly Asset[],
): Asset | undefined {
  if (members.length === 0) {
    return undefined;
  }

  return (
    members.find((member) => member.id === family.representativeAssetId) ??
    members[0]
  );
}

export function buildAssetBrowserItems({
  assets,
  families,
  assetType,
  showFavouritesOnly,
}: BuildAssetBrowserItemsOptions): AssetBrowserItem[] {
  const visibleAssets = assets.filter(
    (asset) => asset.type === assetType && isAssetVisibleInBrowser(asset),
  );
  const familyById = new Map(families.map((family) => [family.id, family]));
  const handledFamilyIds = new Set<string>();
  const items: AssetBrowserItem[] = [];

  for (const asset of visibleAssets) {
    const familyId = asset.familyId;
    if (!familyId) {
      if (!showFavouritesOnly || asset.favourite) {
        items.push({
          kind: "asset",
          asset,
          sortAsset: asset,
        });
      }
      continue;
    }

    const family = familyById.get(familyId);
    if (!family) {
      if (!showFavouritesOnly || asset.favourite) {
        items.push({
          kind: "asset",
          asset,
          sortAsset: asset,
        });
      }
      continue;
    }

    if (handledFamilyIds.has(familyId)) {
      continue;
    }

    handledFamilyIds.add(familyId);
    const members = getFamilyMembers(assets, family).filter(
      (member) => member.type === assetType,
    );
    const representative = pickRepresentativeMember(family, members);

    if (!representative) {
      continue;
    }

    if (showFavouritesOnly && !representative.favourite) {
      continue;
    }

    if (members.length <= 1) {
      items.push({
        kind: "asset",
        asset: representative,
        sortAsset: representative,
      });
      continue;
    }

    items.push({
      kind: "family",
      asset: representative,
      family,
      memberCount: members.length,
      sortAsset: representative,
    });
  }

  return items;
}
