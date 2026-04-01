/**
 * Ordered list of frontend preprocessors.
 *
 * The runner executes these sequentially. Each processor checks its own
 * activation condition and reads from / writes to the shared context.
 *
 * Order matters:
 * 1. collectTextInputs — simple text routing (no dependencies)
 * 2. collectImageInputs — simple image routing (no dependencies)
 * 3. collectAudioInputs — simple audio routing (no dependencies)
 * 4. collectVideoInputs — video normalization + derived mask rendering
 * 5. prepareAspectRatioInputs — resolve dispatch AR and optionally crop visuals
 */

import type { Processor, FrontendPreprocessContext } from "../types";
import { collectTextInputs } from "./collectTextInputs";
import { collectImageInputs } from "./collectImageInputs";
import { collectAudioInputs } from "./collectAudioInputs";
import { collectVideoInputs } from "./collectVideoInputs";
import { prepareAspectRatioInputs } from "./prepareAspectRatioInputs";

export const FRONTEND_PREPROCESSORS: readonly Processor<FrontendPreprocessContext>[] =
  [
    collectTextInputs,
    collectImageInputs,
    collectAudioInputs,
    collectVideoInputs,
    prepareAspectRatioInputs,
  ];

export {
  collectTextInputs,
  collectImageInputs,
  collectAudioInputs,
  collectVideoInputs,
  prepareAspectRatioInputs,
};
