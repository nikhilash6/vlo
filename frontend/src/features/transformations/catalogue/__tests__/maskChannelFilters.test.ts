import { beforeEach, describe, expect, it, vi } from "vitest";

const { filterFromSpy } = vi.hoisted(() => ({
  filterFromSpy: vi.fn(),
}));

vi.mock("pixi.js", () => ({
  Filter: {
    from: filterFromSpy,
  },
}));

import { createMaskBinaryThresholdFilter } from "../mask/maskBinaryThresholdFilter";
import { createMaskRedToAlphaFilter } from "../mask/maskRedToAlphaFilter";

describe("mask channel filters", () => {
  beforeEach(() => {
    filterFromSpy.mockReset();
    filterFromSpy.mockReturnValue({});
  });

  it("thresholds composite mask coverage from the red channel only", () => {
    createMaskBinaryThresholdFilter();

    const fragment = filterFromSpy.mock.calls[0]?.[0]?.gl?.fragment as
      | string
      | undefined;

    expect(fragment).toContain("float coverage = color.r;");
    expect(fragment).not.toContain("color.a");
    expect(fragment).not.toContain("max(color.r, color.a)");
  });

  it("presents the final composite mask from the red channel only", () => {
    createMaskRedToAlphaFilter();

    const fragment = filterFromSpy.mock.calls[0]?.[0]?.gl?.fragment as
      | string
      | undefined;

    expect(fragment).toContain("float coverage = color.r;");
    expect(fragment).not.toContain("max(color.r, color.a)");
  });
});
