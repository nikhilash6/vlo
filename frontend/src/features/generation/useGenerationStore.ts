import { create } from "zustand";
import { buildExecutionStoreState } from "./store/executionStoreState";
import { buildJobStoreState } from "./store/jobStoreState";
import { buildRuntimeStoreState } from "./store/runtimeStoreState";
import { isActiveGenerationJob } from "./store/jobMutations";
import { buildWorkflowStoreState } from "./store/workflowStoreState";
import { GenerationWakeLock } from "./services/GenerationWakeLock";
import type { GenerationStore } from "./store/types";

export { TEMP_WORKFLOW_ID } from "./store/constants";
export type {
  ComfyUIConnectionStatus,
  PreviewAnimation,
} from "./store/types";

export const useGenerationStore = create<GenerationStore>((set, get) => {
  let workflowLoadRequestId = 0;

  return {
    ...buildWorkflowStoreState(set, get, {
      getNextWorkflowLoadRequestId: () => {
        workflowLoadRequestId += 1;
        return workflowLoadRequestId;
      },
      isCurrentWorkflowLoadRequestId: (requestId) =>
        requestId === workflowLoadRequestId,
    }),
    ...buildRuntimeStoreState(set, get),
    ...buildJobStoreState(set, get),
    ...buildExecutionStoreState(set, get),
  };
});

function shouldHoldGenerationWakeLock(state: GenerationStore): boolean {
  const activeJob = state.activeJobId ? state.jobs.get(state.activeJobId) : null;

  return (
    state.pipelineStatus.phase === "preprocessing" ||
    isActiveGenerationJob(activeJob) ||
    state.generationQueue.length > 0 ||
    state.postprocessingJobIds.length > 0
  );
}

const generationWakeLock =
  typeof window !== "undefined" ? new GenerationWakeLock() : null;

if (generationWakeLock) {
  // The generation store outlives individual panels, so keep wake-lock state
  // subscribed at the store boundary rather than tying it to one component.
  let lastShouldHoldWakeLock = shouldHoldGenerationWakeLock(
    useGenerationStore.getState(),
  );

  void generationWakeLock.setEnabled(lastShouldHoldWakeLock);

  useGenerationStore.subscribe((state) => {
    const shouldHoldWakeLock = shouldHoldGenerationWakeLock(state);
    if (shouldHoldWakeLock === lastShouldHoldWakeLock) {
      return;
    }

    lastShouldHoldWakeLock = shouldHoldWakeLock;
    void generationWakeLock.setEnabled(shouldHoldWakeLock);
  });
}
