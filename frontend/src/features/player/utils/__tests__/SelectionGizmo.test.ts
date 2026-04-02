import { beforeEach, describe, expect, it, vi } from "vitest";
import { Container, Sprite, Texture } from "pixi.js";

const { syncContainerTransformToTargetMock } = vi.hoisted(() => ({
  syncContainerTransformToTargetMock: vi.fn(() => true),
}));

vi.mock("../../../renderer", () => ({
  syncContainerTransformToTarget: syncContainerTransformToTargetMock,
}));

import { SelectionGizmo } from "../SelectionGizmo";

describe("SelectionGizmo", () => {
  beforeEach(() => {
    syncContainerTransformToTargetMock.mockClear();
  });

  it("uses intrinsic sprite bounds instead of effect-inflated local bounds", () => {
    const viewport = new Container();
    const gizmo = new SelectionGizmo();
    viewport.addChild(gizmo);

    const target = new Sprite(Texture.WHITE);
    target.anchor.set(0.5);

    const getLocalBoundsSpy = vi
      .spyOn(target, "getLocalBounds")
      .mockReturnValue({
        x: 240,
        y: 180,
        width: 80,
        height: 60,
      } as ReturnType<Sprite["getLocalBounds"]>);

    gizmo.update(target, 1);

    expect(syncContainerTransformToTargetMock).toHaveBeenCalledWith(
      gizmo,
      target,
    );
    expect(getLocalBoundsSpy).not.toHaveBeenCalled();
    expect(gizmo.pivot.x).toBeCloseTo(0);
    expect(gizmo.pivot.y).toBeCloseTo(0);
  });

  it("keeps using getLocalBounds for non-sprite gizmo targets", () => {
    const viewport = new Container();
    const gizmo = new SelectionGizmo();
    viewport.addChild(gizmo);

    const target = new Container();
    const getLocalBoundsSpy = vi
      .spyOn(target, "getLocalBounds")
      .mockReturnValue({
        x: 10,
        y: 20,
        width: 100,
        height: 50,
      } as ReturnType<Container["getLocalBounds"]>);

    gizmo.update(target, 1);

    expect(getLocalBoundsSpy).toHaveBeenCalled();
    expect(gizmo.pivot.x).toBeCloseTo(0);
    expect(gizmo.pivot.y).toBeCloseTo(0);
  });
});
