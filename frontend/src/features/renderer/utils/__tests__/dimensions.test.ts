import { describe, it, expect } from "vitest";
import {
  deriveTrueDimensionsFromShortEdge,
  getProjectDimensions,
} from "../dimensions";

describe("getProjectDimensions", () => {
  it("should return correct dimensions for 16:9", () => {
    expect(getProjectDimensions("16:9")).toEqual({ width: 1920, height: 1080 });
  });

  it("should return correct dimensions for 4:3", () => {
    expect(getProjectDimensions("4:3")).toEqual({ width: 1440, height: 1080 });
  });

  it("should return correct dimensions for 1:1", () => {
    expect(getProjectDimensions("1:1")).toEqual({ width: 1080, height: 1080 });
  });

  it("should return correct dimensions for 3:4", () => {
    expect(getProjectDimensions("3:4")).toEqual({ width: 810, height: 1080 });
  });

  it("should return correct dimensions for 9:16", () => {
    expect(getProjectDimensions("9:16")).toEqual({ width: 608, height: 1080 });
  });

  it("should return default 16:9 dimensions for unknown ratio", () => {
    // @ts-expect-error Testing invalid input
    expect(getProjectDimensions("invalid")).toEqual({
      width: 1920,
      height: 1080,
    });
  });
});

describe("deriveTrueDimensionsFromShortEdge", () => {
  it("returns true landscape dimensions from the short edge", () => {
    expect(deriveTrueDimensionsFromShortEdge("16:9", 1080)).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it("returns true portrait dimensions from the short edge", () => {
    expect(deriveTrueDimensionsFromShortEdge("9:16", 1080)).toEqual({
      width: 1080,
      height: 1920,
    });
  });

  it("returns square dimensions from the short edge", () => {
    expect(deriveTrueDimensionsFromShortEdge("1:1", 720)).toEqual({
      width: 720,
      height: 720,
    });
  });
});
