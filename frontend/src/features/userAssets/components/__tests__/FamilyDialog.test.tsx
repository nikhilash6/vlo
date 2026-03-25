import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Asset, AssetFamily } from "../../../../types/Asset";
import { useAssetStore } from "../../useAssetStore";
import { FamilyDialog } from "../FamilyDialog";

const { assetCardMock } = vi.hoisted(() => ({
  assetCardMock: vi.fn(
    ({ asset }: { asset: Asset; layout?: "default" | "square" }) => (
      <div data-testid="family-asset-card">{asset.name}</div>
    ),
  ),
}));

vi.mock("../../useAssetStore");
vi.mock("../AssetCard", () => ({
  AssetCard: assetCardMock,
}));

const family: AssetFamily = {
  id: "8d3995b4-4f43-4fe2-a702-b3e87ae0d8b0",
  representativeAssetId: "asset-2",
  autoMatchKeys: ["generation-family:v1:match"],
  compatibility: {
    assetType: "video",
    durationMs: 5000,
    fpsMilli: null,
  },
  createdAt: 1,
  updatedAt: 1,
};

const mockAssets: Asset[] = [
  {
    id: "asset-1",
    hash: "family-hash-1",
    familyId: family.id,
    name: "hero.mp4",
    type: "video",
    src: "hero.mp4",
    createdAt: 10,
  },
  {
    id: "asset-2",
    hash: "family-hash-2",
    familyId: family.id,
    name: "hero-alt.mp4",
    type: "video",
    src: "hero-alt.mp4",
    createdAt: 20,
  },
  {
    id: "asset-3",
    hash: "other-hash",
    familyId: family.id,
    name: "hero-take-2.mp4",
    type: "video",
    src: "hero-take-2.mp4",
    createdAt: 15,
  },
  {
    id: "mask-asset",
    hash: "family-hash-2",
    familyId: family.id,
    name: "hero_mask.webm",
    type: "video",
    src: "hero_mask.webm",
    createdAt: 25,
    creationMetadata: {
      source: "sam2_mask",
      parentAssetId: "asset-1",
      parentClipId: "clip-1",
      maskClipId: "clip-1::mask::1",
      pointCount: 4,
      sourceHash: "family-hash-1",
    },
  },
];

type AssetStoreState = ReturnType<typeof useAssetStore.getState>;

function mockStore(assets: Asset[]) {
  vi.mocked(useAssetStore).mockImplementation(
    (selector: (state: AssetStoreState) => unknown) =>
      selector({
        assets,
      } as unknown as AssetStoreState),
  );
}

describe("FamilyDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assetCardMock.mockClear();
  });

  it("renders visible members that belong to the selected family", () => {
    mockStore(mockAssets);

    render(<FamilyDialog family={family} open={true} onClose={vi.fn()} />);

    expect(
      screen.getByRole("dialog", { name: /Asset Family/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(family.id)).toBeInTheDocument();
    expect(screen.getByText("3 members")).toBeInTheDocument();
    expect(screen.getAllByTestId("family-asset-card")).toHaveLength(3);
    expect(screen.getByText("hero-alt.mp4")).toBeInTheDocument();
    expect(screen.getByText("hero-take-2.mp4")).toBeInTheDocument();
    expect(screen.getByText("hero.mp4")).toBeInTheDocument();
    expect(screen.queryByText("hero_mask.webm")).not.toBeInTheDocument();
    expect(assetCardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        layout: "square",
      }),
      undefined,
    );
  });

  it("shows an empty state when no family members resolve", () => {
    mockStore([]);

    render(<FamilyDialog family={family} open={true} onClose={vi.fn()} />);

    expect(
      screen.getByText("No assets from this family are available yet."),
    ).toBeInTheDocument();
    expect(screen.getByText("0 members")).toBeInTheDocument();
  });

  it("calls onClose from the close button", () => {
    mockStore(mockAssets);
    const onClose = vi.fn();

    render(<FamilyDialog family={family} open={true} onClose={onClose} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Close family dialog" }),
    );

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
