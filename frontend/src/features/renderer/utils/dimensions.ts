import type { AspectRatio } from "../../project/useProjectStore";

const FIXED_VERTICAL_RESOLUTION = 1080;

function parseAspectRatio(
  ratio: AspectRatio,
): { widthPart: number; heightPart: number } | null {
  const [widthPart, heightPart] = ratio.split(":").map(Number);

  if (
    !Number.isFinite(widthPart) ||
    !Number.isFinite(heightPart) ||
    heightPart === 0
  ) {
    return null;
  }

  return { widthPart, heightPart };
}

export const getProjectDimensions = (ratio: AspectRatio) => {
  const parsed = parseAspectRatio(ratio);
  if (!parsed) {
    return { width: 1920, height: FIXED_VERTICAL_RESOLUTION };
  }

  return {
    width: Math.round(
      (FIXED_VERTICAL_RESOLUTION * parsed.widthPart) / parsed.heightPart,
    ),
    height: FIXED_VERTICAL_RESOLUTION,
  };
};

export const deriveTrueDimensionsFromShortEdge = (
  ratio: AspectRatio,
  resolution: number,
) => {
  const parsed = parseAspectRatio(ratio);
  if (!parsed) {
    return { width: 1920, height: FIXED_VERTICAL_RESOLUTION };
  }

  const aspectRatio = parsed.widthPart / parsed.heightPart;
  if (aspectRatio >= 1) {
    return {
      width: Math.round(resolution * aspectRatio),
      height: resolution,
    };
  }

  return {
    width: resolution,
    height: Math.round(resolution / aspectRatio),
  };
};
