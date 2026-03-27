interface DeleteAssetWithConfirmationOptions {
  assetId: string;
  deleteAsset: (assetId: string) => Promise<void> | void;
  timelineClipCount: number;
}

export function getAssetDeleteConfirmationMessage(
  timelineClipCount: number,
): string {
  return timelineClipCount > 0
    ? "Are you sure you want to delete this asset? This will remove it from disk permanently.\n\nThis asset is used by clips on the Timeline.\nClips on the Timeline are derived from the asset and will be deleted."
    : "Are you sure you want to delete this asset? This will remove it from disk permanently.";
}

export async function deleteAssetWithConfirmation({
  assetId,
  deleteAsset,
  timelineClipCount,
}: DeleteAssetWithConfirmationOptions): Promise<boolean> {
  const confirmMessage = getAssetDeleteConfirmationMessage(timelineClipCount);

  if (!window.confirm(confirmMessage)) {
    return false;
  }

  await deleteAsset(assetId);
  return true;
}
