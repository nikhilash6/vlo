import { act, renderHook } from "@testing-library/react";
import type { DragEndEvent } from "@dnd-kit/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useInteractionStore } from "../../useInteractionStore";
import { useAssetDrag } from "../useAssetDrag";

const { mockHandleEnd, mockHandleMove } = vi.hoisted(() => ({
  mockHandleEnd: vi.fn(),
  mockHandleMove: vi.fn(),
}));

vi.mock("../useClipMove", () => ({
  useClipMove: () => ({
    handleEnd: mockHandleEnd,
    handleMove: mockHandleMove,
  }),
}));

describe("useAssetDrag", () => {
  beforeEach(() => {
    mockHandleEnd.mockReset();
    mockHandleMove.mockReset();
    useInteractionStore.getState().stopDrag();
  });

  it("routes managed media-input drops to the target slot callback", () => {
    const onReorderDrop = vi.fn();
    const { result } = renderHook(() => useAssetDrag());

    act(() => {
      result.current.handleAssetDragEnd({
        active: {
          data: {
            current: {
              type: "media-input",
              inputId: "62:image",
            },
          },
        },
        over: {
          data: {
            current: {
              type: "asset-slot",
              onReorderDrop,
            },
          },
        },
      } as unknown as DragEndEvent);
    });

    expect(onReorderDrop).toHaveBeenCalledWith({
      type: "media-input",
      inputId: "62:image",
    });
    expect(mockHandleEnd).not.toHaveBeenCalled();
  });
});
