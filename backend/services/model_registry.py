"""Registry of downloadable models.

Maps human-friendly model keys to their HuggingFace download URLs.
This is the single source of truth for which models can be downloaded
and where they come from.
"""

from __future__ import annotations

from config import SAM2_SEARCH_PATHS
from services.download_service import DownloadFileSpec
from services.sam2.sam2_discovery import discover_sam2_models

_HF_RESOLVE = "https://huggingface.co/{repo}/resolve/main/{filename}"

SAM2_MODELS: dict[str, dict] = {
    "sam2.1_hiera_large": {
        "label": "SAM2.1 Large",
        "description": "Higher quality, ~900 MB",
        "repo": "facebook/sam2.1-hiera-large",
        "files": [
            {"filename": "sam2.1_hiera_large.pt"},
            {"filename": "sam2.1_hiera_l.yaml"},
        ],
    },
    "sam2.1_hiera_small": {
        "label": "SAM2.1 Small",
        "description": "Faster, ~185 MB",
        "repo": "facebook/sam2.1-hiera-small",
        "files": [
            {"filename": "sam2.1_hiera_small.pt"},
            {"filename": "sam2.1_hiera_s.yaml"},
        ],
    },
}


def get_sam2_download_specs(model_key: str) -> list[DownloadFileSpec]:
    model = SAM2_MODELS.get(model_key)
    if model is None:
        raise ValueError(f"Unknown SAM2 model key: {model_key}")

    dest_dir = str(SAM2_SEARCH_PATHS[0])
    repo = model["repo"]

    return [
        DownloadFileSpec(
            url=_HF_RESOLVE.format(repo=repo, filename=f["filename"]),
            dest_path=f"{dest_dir}/{f['filename']}",
            filename=f["filename"],
        )
        for f in model["files"]
    ]


def get_available_sam2_models() -> list[dict]:
    discovered = discover_sam2_models()
    discovered_names = {m["name"] for m in discovered}

    result = []
    for key, model in SAM2_MODELS.items():
        checkpoint_filename = next(
            f["filename"] for f in model["files"] if f["filename"].endswith(".pt")
        )
        result.append({
            "key": key,
            "label": model["label"],
            "description": model["description"],
            "installed": checkpoint_filename in discovered_names,
        })
    return result
