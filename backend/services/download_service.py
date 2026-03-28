"""Generic model download service.

Provides a reusable download engine that streams files from URLs to local paths
with progress tracking via callbacks. Downloads write to .tmp files and rename
on completion to prevent partial files from being discovered.
"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Literal

import httpx

CHUNK_SIZE = 256 * 1024  # 256 KB


@dataclass
class DownloadFileSpec:
    url: str
    dest_path: str  # absolute path
    filename: str


@dataclass
class DownloadProgress:
    current_file_index: int = 0
    total_files: int = 0
    current_file_bytes: int = 0
    current_file_total: int | None = None
    overall_bytes: int = 0
    overall_bytes_total: int | None = None

    def to_dict(self) -> dict:
        return {
            "currentFileIndex": self.current_file_index,
            "totalFiles": self.total_files,
            "currentFileBytes": self.current_file_bytes,
            "currentFileTotal": self.current_file_total,
            "overallBytes": self.overall_bytes,
            "overallBytesTotal": self.overall_bytes_total,
        }


@dataclass
class DownloadJob:
    job_id: str
    label: str
    files: list[DownloadFileSpec]
    status: Literal["pending", "downloading", "complete", "failed", "cancelled"] = "pending"
    progress: DownloadProgress = field(default_factory=DownloadProgress)
    error: str | None = None
    cancel_event: asyncio.Event = field(default_factory=asyncio.Event)

    def to_dict(self) -> dict:
        return {
            "jobId": self.job_id,
            "label": self.label,
            "status": self.status,
            "progress": self.progress.to_dict(),
            "error": self.error,
        }


_active_jobs: dict[str, DownloadJob] = {}


async def _execute_download_job(
    job: DownloadJob,
    on_progress: Callable[[], None] | None = None,
) -> None:
    job.status = "downloading"
    job.progress.total_files = len(job.files)

    # Pre-scan to estimate overall total if possible
    overall_downloaded_prior_files: int = 0

    async with httpx.AsyncClient(follow_redirects=True, timeout=httpx.Timeout(30.0, read=300.0)) as client:
        for file_index, file_spec in enumerate(job.files):
            if job.cancel_event.is_set():
                job.status = "cancelled"
                return

            job.progress.current_file_index = file_index
            job.progress.current_file_bytes = 0
            job.progress.current_file_total = None

            dest = Path(file_spec.dest_path)
            tmp_path = dest.with_suffix(dest.suffix + ".tmp")
            dest.parent.mkdir(parents=True, exist_ok=True)

            try:
                async with client.stream("GET", file_spec.url) as response:
                    response.raise_for_status()

                    content_length = response.headers.get("content-length")
                    if content_length is not None:
                        job.progress.current_file_total = int(content_length)

                    with open(tmp_path, "wb") as f:
                        async for chunk in response.aiter_bytes(CHUNK_SIZE):
                            if job.cancel_event.is_set():
                                job.status = "cancelled"
                                tmp_path.unlink(missing_ok=True)
                                return

                            f.write(chunk)
                            job.progress.current_file_bytes += len(chunk)
                            job.progress.overall_bytes = overall_downloaded_prior_files + job.progress.current_file_bytes

                            if on_progress:
                                on_progress()

                # Rename .tmp to final path
                tmp_path.rename(dest)
                overall_downloaded_prior_files += job.progress.current_file_bytes

            except Exception as exc:
                tmp_path.unlink(missing_ok=True)
                job.status = "failed"
                job.error = f"Failed to download {file_spec.filename}: {exc}"
                if on_progress:
                    on_progress()
                return

    job.status = "complete"
    if on_progress:
        on_progress()


def start_download(label: str, files: list[DownloadFileSpec]) -> DownloadJob:
    job = DownloadJob(
        job_id=str(uuid.uuid4()),
        label=label,
        files=files,
    )
    _active_jobs[job.job_id] = job

    progress_event = asyncio.Event()

    def notify_progress() -> None:
        progress_event.set()

    job._progress_event = progress_event  # type: ignore[attr-defined]

    asyncio.create_task(_execute_download_job(job, on_progress=notify_progress))
    return job


def get_job(job_id: str) -> DownloadJob | None:
    return _active_jobs.get(job_id)


def cancel_job(job_id: str) -> bool:
    job = _active_jobs.get(job_id)
    if job is None:
        return False
    job.cancel_event.set()
    return True
