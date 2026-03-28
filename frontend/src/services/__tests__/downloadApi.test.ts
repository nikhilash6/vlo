import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAvailableModels, startModelDownload } from "../downloadApi";

describe("downloadApi", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  it("returns a friendly error when the model list endpoint responds with HTML", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response("<!DOCTYPE html><html><body>Not JSON</body></html>", {
        status: 200,
        headers: {
          "content-type": "text/html",
        },
      }),
    );

    await expect(getAvailableModels()).rejects.toThrow(
      "Unable to load SAM2 model list",
    );
  });

  it("preserves JSON detail when starting a download fails", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: "A download is already in progress for one or more destination files",
        }),
        {
          status: 409,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    await expect(
      startModelDownload("sam2", "sam2.1_hiera_small"),
    ).rejects.toThrow(
      "A download is already in progress for one or more destination files",
    );
  });
});
