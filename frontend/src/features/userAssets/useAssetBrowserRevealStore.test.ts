import { beforeEach, describe, expect, it } from "vitest";
import {
  revealAssetInBrowser,
  useAssetBrowserRevealStore,
} from "./useAssetBrowserRevealStore";

describe("useAssetBrowserRevealStore", () => {
  beforeEach(() => {
    useAssetBrowserRevealStore.setState({ revealRequest: null });
  });

  it("clears the active reveal request when the request id matches", () => {
    revealAssetInBrowser("asset-1");
    const requestId =
      useAssetBrowserRevealStore.getState().revealRequest?.requestId;

    expect(requestId).toEqual(expect.any(Number));

    useAssetBrowserRevealStore.getState().clearRevealRequest(requestId);

    expect(useAssetBrowserRevealStore.getState().revealRequest).toBeNull();
  });

  it("does not clear a newer reveal request when asked to clear an older one", () => {
    revealAssetInBrowser("asset-1");
    const staleRequestId =
      useAssetBrowserRevealStore.getState().revealRequest?.requestId;

    revealAssetInBrowser("asset-2");

    useAssetBrowserRevealStore
      .getState()
      .clearRevealRequest(staleRequestId);

    expect(useAssetBrowserRevealStore.getState().revealRequest).toMatchObject({
      assetId: "asset-2",
      requestId: expect.any(Number),
    });
  });
});
