import { API_BASE_URL } from "../config";

const DOWNLOADS_API = `${API_BASE_URL}/downloads`;

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
  if (!response.ok) {
    throw new Error(`Failed to fetch available models (${response.status})`);
  }
  return (await response.json()) as AvailableModelsResponse;
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
  if (!response.ok) {
    throw new Error(`Failed to start download (${response.status})`);
  }
  return (await response.json()) as StartDownloadResponse;
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
