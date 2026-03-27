import { create } from "zustand";

interface AssetBrowserRevealRequest {
  assetId: string;
  requestId: number;
}

interface AssetBrowserRevealState {
  revealRequest: AssetBrowserRevealRequest | null;
  revealAssetInBrowser: (assetId: string) => void;
}

let nextRevealRequestId = 1;

export const useAssetBrowserRevealStore = create<AssetBrowserRevealState>(
  (set) => ({
    revealRequest: null,
    revealAssetInBrowser: (assetId) => {
      set({
        revealRequest: {
          assetId,
          requestId: nextRevealRequestId,
        },
      });

      nextRevealRequestId += 1;
    },
  }),
);

export function revealAssetInBrowser(assetId: string): void {
  useAssetBrowserRevealStore.getState().revealAssetInBrowser(assetId);
}
