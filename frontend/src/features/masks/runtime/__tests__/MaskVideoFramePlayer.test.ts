import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Asset } from "../../../../types/Asset";

const mockWorkers: Array<{
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
}> = [];

vi.mock("../../../renderer/workers/decoder.worker?worker", () => ({
  default: class {
    onmessage: ((event: MessageEvent) => void) | null = null;
    postMessage = vi.fn(
      (message: { type: "prepare" | "render"; clipId: string }) => {
        if (message.type === "prepare") {
          this.onmessage?.({
            data: {
              type: "ready",
              clipId: message.clipId,
            },
          } as MessageEvent);
        }
      },
    );
    terminate = vi.fn();

    constructor() {
      mockWorkers.push(this);
    }
  },
}));

import { MaskVideoFramePlayer } from "../MaskVideoFramePlayer";

function createMaskAsset(id: string): Asset {
  return {
    id,
    type: "video",
    name: `${id}.webm`,
    src: `blob:${id}`,
    hash: `${id}-hash`,
    createdAt: 0,
  };
}

describe("MaskVideoFramePlayer", () => {
  beforeEach(() => {
    mockWorkers.length = 0;
  });

  it("serializes overlapping strict frame requests", async () => {
    const player = new MaskVideoFramePlayer("clip_1");
    await player.setSource(createMaskAsset("mask_asset"));

    const worker = mockWorkers[0];
    expect(worker).toBeDefined();

    const firstRender = player.renderAt(0, { strict: true });
    const secondRender = player.renderAt(1, { strict: true });

    await vi.waitFor(() => {
      const renderMessages = worker.postMessage.mock.calls
        .map((call) => call[0])
        .filter((message) => message.type === "render");
      expect(renderMessages).toHaveLength(1);
    });

    const renderMessagesBeforeResolve = worker.postMessage.mock.calls
      .map((call) => call[0])
      .filter((message) => message.type === "render");
    expect(renderMessagesBeforeResolve).toHaveLength(1);
    expect(renderMessagesBeforeResolve[0]?.time).toBe(0);

    let secondSettled = false;
    void secondRender.then(() => {
      secondSettled = true;
    });
    await Promise.resolve();
    expect(secondSettled).toBe(false);

    worker.onmessage?.({
      data: {
        type: "frame",
        clipId: "mask_video_clip_1",
        bitmap: null,
      },
    } as MessageEvent);

    await firstRender;
    await vi.waitFor(() => {
      const renderMessages = worker.postMessage.mock.calls
        .map((call) => call[0])
        .filter((message) => message.type === "render");
      expect(renderMessages).toHaveLength(2);
    });

    const renderMessagesAfterResolve = worker.postMessage.mock.calls
      .map((call) => call[0])
      .filter((message) => message.type === "render");
    expect(renderMessagesAfterResolve).toHaveLength(2);
    expect(renderMessagesAfterResolve[1]?.time).toBe(1);

    worker.onmessage?.({
      data: {
        type: "frame",
        clipId: "mask_video_clip_1",
        bitmap: null,
      },
    } as MessageEvent);

    await expect(secondRender).resolves.toBeUndefined();
    player.dispose();
  });
});
