import type { AspectRatio } from "./useProjectStore";

export const PROJECT_ASPECT_RATIOS: readonly AspectRatio[] = [
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16",
];

export const EXACT_INPUT_ASPECT_RATIO_TOOLTIP =
  "If selected, this will make the output aspect ratio exactly match the input ratio, even if it doesn't match the project-supported aspect ratios. If unselected, it will crop the image to the best supported fit before dispatch.";
