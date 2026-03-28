import { API_BASE_URL } from "../config";

const DOWNLOADS_API = `${API_BASE_URL}/downloads`;

function extractErrorMessage(payload: unknown): string | null {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.detail === "string") {
    const message = record.detail.trim();
    if (message.length > 0) return message;
  }

  if (typeof record.message === "string") {
    const message = record.message.trim();
    if (message.length > 0) return message;
  }

  return null;
}

async function parseJsonResponse<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  const rawText = (await response.text()).trim();
  const isJson = contentType.includes("application/json");

  if (!response.ok) {
    if (isJson && rawText) {
      try {
        const payload = JSON.parse(rawText) as unknown;
        const message = extractErrorMessage(payload);
        if (message) {
          throw new Error(message);
        }
      } catch (error) {
        if (error instanceof Error && error.message) {
          throw error;
        }
      }
    }
    throw new Error(`${fallbackMessage} (${response.status})`);
  }

  if (!isJson || !rawText) {
    throw new Error(fallbackMessage);
  }

  try {
    return JSON.parse(rawText) as T;
  } catch {
    throw new Error(fallbackMessage);
  }
}

export interface DownloadableModel {
  key: string;
  label: string;
  description: string;
  installed: boolean;
}

export interface AvailableModelsResponse {
  sam2: DownloadableModel[];
}

export interface StartDownloadResponse {
  jobId: string;
  label: string;
  status: string;
}

export interface DownloadProgressEvent {
  jobId: string;
  label: string;
  status: "pending" | "downloading" | "complete" | "failed" | "cancelled";
  progress: {
    currentFileIndex: number;
    totalFiles: number;
    currentFileBytes: number;
    currentFileTotal: number | null;
    overallBytes: number;
    overallBytesTotal: number | null;
  };
  error: string | null;
}

export async function getAvailableModels(): Promise<AvailableModelsResponse> {
  const response = await fetch(`${DOWNLOADS_API}/models`);
  return parseJsonResponse<AvailableModelsResponse>(
    response,
    "Unable to load SAM2 model list",
  );
}

export async function startModelDownload(
  modelType: string,
  modelKey: string,
): Promise<StartDownloadResponse> {
  const response = await fetch(`${DOWNLOADS_API}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modelType, modelKey }),
  });
  return parseJsonResponse<StartDownloadResponse>(
    response,
    "Unable to start model download",
  );
}

export async function cancelDownload(jobId: string): Promise<void> {
  const response = await fetch(`${DOWNLOADS_API}/${jobId}/cancel`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Failed to cancel download (${response.status})`);
  }
}

export function subscribeToProgress(
  jobId: string,
  onEvent: (event: DownloadProgressEvent) => void,
  onError?: (error: Error) => void,
): () => void {
  const url = `${DOWNLOADS_API}/${jobId}/progress`;
  const eventSource = new EventSource(url);

  function handleMessage(e: MessageEvent) {
    try {
      const data = JSON.parse(e.data as string) as DownloadProgressEvent;
      onEvent(data);
    } catch {
      // ignore parse errors
    }
  }

  eventSource.addEventListener("pending", handleMessage);
  eventSource.addEventListener("downloading", handleMessage);
  eventSource.addEventListener("complete", handleMessage);
  eventSource.addEventListener("failed", handleMessage);
  eventSource.addEventListener("cancelled", handleMessage);

  eventSource.onerror = () => {
    if (eventSource.readyState === EventSource.CLOSED) {
      return;
    }
    onError?.(new Error("Download progress connection lost"));
    eventSource.close();
  };

  return () => {
    eventSource.close();
  };
}
