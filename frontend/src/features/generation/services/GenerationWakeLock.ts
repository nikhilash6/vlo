interface WakeLockSentinelLike {
  released?: boolean;
  release(): Promise<void>;
  addEventListener?(
    type: "release",
    listener: () => void,
    options?: AddEventListenerOptions,
  ): void;
}

interface WakeLockApiLike {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
}

interface WakeLockNavigatorLike {
  wakeLock?: WakeLockApiLike;
}

interface WakeLockDocumentLike {
  visibilityState?: DocumentVisibilityState;
  addEventListener?(
    type: "visibilitychange",
    listener: () => void,
  ): void;
  removeEventListener?(
    type: "visibilitychange",
    listener: () => void,
  ): void;
}

export class GenerationWakeLock {
  private sentinel: WakeLockSentinelLike | null = null;
  private enabled = false;
  private readonly nav: WakeLockNavigatorLike | null;
  private readonly doc: WakeLockDocumentLike | null;

  constructor(options?: {
    navigator?: WakeLockNavigatorLike | null;
    document?: WakeLockDocumentLike | null;
  }) {
    this.nav =
      options?.navigator ??
      (typeof navigator !== "undefined"
        ? (navigator as WakeLockNavigatorLike)
        : null);
    this.doc =
      options?.document ??
      (typeof document !== "undefined"
        ? (document as WakeLockDocumentLike)
        : null);

    this.doc?.addEventListener?.("visibilitychange", this.handleVisibilityChange);
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;

    if (enabled) {
      await this.acquire();
      return;
    }

    await this.release();
  }

  async dispose(): Promise<void> {
    this.enabled = false;
    this.doc?.removeEventListener?.(
      "visibilitychange",
      this.handleVisibilityChange,
    );
    await this.release();
  }

  private readonly handleVisibilityChange = (): void => {
    if (!this.enabled || this.doc?.visibilityState !== "visible") {
      return;
    }

    void this.acquire();
  };

  private readonly handleSentinelRelease = (): void => {
    this.sentinel = null;

    if (!this.enabled || this.doc?.visibilityState !== "visible") {
      return;
    }

    void this.acquire();
  };

  private async acquire(): Promise<void> {
    if (!this.enabled) return;
    if (this.doc?.visibilityState === "hidden") return;
    if (this.sentinel && this.sentinel.released !== true) return;

    const wakeLock = this.nav?.wakeLock;
    if (!wakeLock) return;

    try {
      const sentinel = await wakeLock.request("screen");
      this.sentinel = sentinel;
      sentinel.addEventListener?.("release", this.handleSentinelRelease, {
        once: true,
      });
    } catch (error) {
      console.warn("[Generation] Failed to acquire screen wake lock", error);
    }
  }

  private async release(): Promise<void> {
    const sentinel = this.sentinel;
    this.sentinel = null;

    if (!sentinel || sentinel.released === true) {
      return;
    }

    try {
      await sentinel.release();
    } catch (error) {
      console.warn("[Generation] Failed to release screen wake lock", error);
    }
  }
}
