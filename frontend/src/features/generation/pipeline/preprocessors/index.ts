/**
 * Ordered list of frontend preprocessors.
 *
 * The runner executes these sequentially. Each processor checks its own
 * activation condition and reads from / writes to the shared context.
 *
 * Order matters:
 * 1. collectTextInputs — simple text routing (no dependencies)
 * 2. collectImageInputs — simple image routing (no dependencies)
 * 3. collectVideoInputs — video normalization + derived mask rendering
 * 4. prepareAspectRatioInputs — resolve dispatch AR and optionally crop visuals
 */

import type { Processor, FrontendPreprocessContext } from "../types";
import { collectTextInputs } from "./collectTextInputs";
import { collectImageInputs } from "./collectImageInputs";
import { collectVideoInputs } from "./collectVideoInputs";
import { prepareAspectRatioInputs } from "./prepareAspectRatioInputs";

export const FRONTEND_PREPROCESSORS: readonly Processor<FrontendPreprocessContext>[] =
  [
    collectTextInputs,
    collectImageInputs,
    collectVideoInputs,
    prepareAspectRatioInputs,
  ];

export {
  collectTextInputs,
  collectImageInputs,
  collectVideoInputs,
  prepareAspectRatioInputs,
};
