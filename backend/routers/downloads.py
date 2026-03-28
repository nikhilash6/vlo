"""Download API endpoints.

Provides endpoints for listing available models, starting downloads,
streaming progress via SSE, and cancelling downloads.
"""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services import download_service
from services.model_registry import get_available_sam2_models, get_sam2_download_specs

router = APIRouter(prefix="/downloads", tags=["downloads"])


class StartDownloadRequest(BaseModel):
    modelType: str
    modelKey: str


@router.get("/models")
def list_available_models():
    return {
        "sam2": get_available_sam2_models(),
    }


@router.post("/start")
async def start_download(request: StartDownloadRequest):
    if request.modelType == "sam2":
        try:
            specs = get_sam2_download_specs(request.modelKey)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        label = request.modelKey
        for model in get_available_sam2_models():
            if model["key"] == request.modelKey:
                label = model["label"]
                break
    else:
        raise HTTPException(status_code=400, detail=f"Unknown model type: {request.modelType}")

    try:
        job = download_service.start_download(label=label, files=specs)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    return {"jobId": job.job_id, "label": job.label, "status": job.status}


@router.get("/{job_id}/progress")
async def stream_progress(job_id: str):
    job = download_service.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Download job not found")

    async def event_stream():
        last_snapshot: str | None = None
        while True:
            snapshot = json.dumps(job.to_dict())
            if snapshot != last_snapshot:
                last_snapshot = snapshot
                yield f"event: {job.status}\ndata: {snapshot}\n\n"

            if job.status in ("complete", "failed", "cancelled"):
                return

            progress_event = job.progress_event
            if progress_event is not None:
                progress_event.clear()
                try:
                    await asyncio.wait_for(progress_event.wait(), timeout=0.5)
                except asyncio.TimeoutError:
                    pass
            else:
                await asyncio.sleep(0.25)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{job_id}/cancel")
def cancel_download(job_id: str):
    if not download_service.cancel_job(job_id):
        raise HTTPException(status_code=404, detail="Download job not found")
    return {"cancelled": True}
