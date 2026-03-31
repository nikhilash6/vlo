import { describe, expect, it, vi } from "vitest";
import { GenerationWakeLock } from "../GenerationWakeLock";

function createSentinel() {
  let released = false;
  let releaseListener: (() => void) | null = null;

  return {
    get released() {
      return released;
    },
    addEventListener(type: "release", listener: () => void) {
      if (type === "release") {
        releaseListener = listener;
      }
    },
    async release() {
      released = true;
      releaseListener?.();
    },
  };
}

describe("GenerationWakeLock", () => {
  it("requests a screen wake lock when enabled and visible", async () => {
    const sentinel = createSentinel();
    const request = vi.fn().mockResolvedValue(sentinel);
    const wakeLock = new GenerationWakeLock({
      navigator: { wakeLock: { request } },
      document: {
        visibilityState: "visible",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });

    await wakeLock.setEnabled(true);

    expect(request).toHaveBeenCalledWith("screen");
  });

  it("releases the sentinel when disabled", async () => {
    const sentinel = createSentinel();
    const releaseSpy = vi.spyOn(sentinel, "release");
    const wakeLock = new GenerationWakeLock({
      navigator: {
        wakeLock: {
          request: vi.fn().mockResolvedValue(sentinel),
        },
      },
      document: {
        visibilityState: "visible",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });

    await wakeLock.setEnabled(true);
    await wakeLock.setEnabled(false);

    expect(releaseSpy).toHaveBeenCalledTimes(1);
  });

  it("reacquires when the page becomes visible again", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(createSentinel())
      .mockResolvedValueOnce(createSentinel());
    let visibilityListener: (() => void) | null = null;
    const doc = {
      visibilityState: "hidden" as DocumentVisibilityState,
      addEventListener: vi.fn(
        (type: "visibilitychange", listener: () => void) => {
          if (type === "visibilitychange") {
            visibilityListener = listener;
          }
        },
      ),
      removeEventListener: vi.fn(),
    };
    const wakeLock = new GenerationWakeLock({
      navigator: { wakeLock: { request } },
      document: doc,
    });

    await wakeLock.setEnabled(true);
    expect(request).not.toHaveBeenCalled();

    doc.visibilityState = "visible";
    const fireVisibilityChange = visibilityListener as (() => void) | null;
    if (fireVisibilityChange) {
      fireVisibilityChange();
    }
    await Promise.resolve();

    expect(request).toHaveBeenCalledTimes(1);
  });
});
