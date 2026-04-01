import type { FrontendPreprocessContext, Processor } from "../types";
import { throwIfAborted } from "../utils/abort";
import {
  buildWorkflowInputLookup,
  getNodeInputRequestKey,
} from "../../utils/workflowInputs";

/**
 * Collects audio slot values and routes them to `audioInputs`
 * for direct node injection.
 */
export const collectAudioInputs: Processor<FrontendPreprocessContext> = {
  meta: {
    name: "collectAudioInputs",
    reads: ["slotValues", "workflowInputs"],
    writes: ["audioInputs"],
    description: "Routes audio slot values to node inputs",
  },

  isActive() {
    return true;
  },

  async execute(ctx) {
    throwIfAborted(ctx.signal);
    const inputById = buildWorkflowInputLookup(ctx.workflowInputs);

    for (const [inputId, value] of Object.entries(ctx.slotValues)) {
      throwIfAborted(ctx.signal);
      if (value.type !== "audio") continue;
      const input = inputById.get(inputId);
      if (!input) continue;
      ctx.audioInputs[getNodeInputRequestKey(input, inputById)] = value.file;
    }
  },
};
