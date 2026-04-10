from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from services.gen_pipeline.context import BackendPipelineContext
from services.gen_pipeline.processors.inject_values import apply_injections
from services.gen_pipeline.processors.utils.warning import pipeline_warning
from services.gen_pipeline.types import Processor, ProcessorMeta


MEMORY_LOADER_NODE_TYPES = frozenset(
    {"VLOMemoryLoadImage", "VLOMemoryLoadVideo", "VLOMemoryLoadAudio"}
)


UploadMediaBytesFn = Callable[
    [Any, bytes, str, str],
    Awaitable[tuple[str | None, dict[str, Any] | None]],
]
RegisterMediaBytesFn = Callable[
    [Any, bytes, str, str, str, str | None],
    Awaitable[tuple[str | None, dict[str, Any] | None]],
]


class _UploadMediaProcessor:
    meta = ProcessorMeta(
        name="upload_media",
        reads=("buffered_media", "workflow", "injections"),
        writes=("workflow", "injections", "warnings"),
        description="Uploads or registers buffered media with ComfyUI and injects the returned references into the workflow",
    )

    def __init__(
        self,
        upload_media_bytes_fn: UploadMediaBytesFn,
        register_media_bytes_fn: RegisterMediaBytesFn,
        input_node_map: dict[str, list[dict[str, Any]]],
    ):
        self._upload_media_bytes = upload_media_bytes_fn
        self._register_media_bytes = register_media_bytes_fn
        self._input_node_map = input_node_map

    def is_active(self, ctx: BackendPipelineContext) -> bool:
        return bool(ctx.buffered_media)

    async def execute(self, ctx: BackendPipelineContext) -> None:
        for buffered_input_id, media_info in ctx.buffered_media.items():
            node_id = media_info.get("node_id")
            param = media_info.get("param")
            input_type = media_info.get("input_type")
            if not isinstance(node_id, str) or not isinstance(param, str):
                continue
            if not isinstance(input_type, str):
                continue

            node = ctx.workflow.get(node_id)
            current_class_type = (
                node.get("class_type", "")
                if isinstance(node, dict)
                else media_info.get("class_type", "")
            )

            if current_class_type in MEMORY_LOADER_NODE_TYPES:
                injected_value, upload_warning = await self._register_media_bytes(
                    ctx.client,
                    media_info["bytes"],
                    media_info["filename"],
                    media_info["content_type"],
                    input_type,
                    ctx.client_id,
                )
            else:
                injected_value, upload_warning = await self._upload_media_bytes(
                    ctx.client,
                    media_info["bytes"],
                    media_info["filename"],
                    media_info["content_type"],
                )

            if upload_warning:
                upload_warning["node_id"] = node_id
                upload_warning.setdefault("details", {})
                upload_warning["details"]["buffered_input_id"] = buffered_input_id
                ctx.warnings.append(upload_warning)
                continue
            if not injected_value:
                continue

            if isinstance(node, dict):
                mappings = self._input_node_map.get(node.get("class_type", ""), [])
                mapping = next(
                    (entry for entry in mappings if entry.get("param") == param),
                    None,
                )
                if mapping and mapping.get("input_type") == input_type:
                    ctx.injections.setdefault(node_id, {})[param] = injected_value
                elif mapping:
                    ctx.warnings.append(
                        pipeline_warning(
                            "media_mapping_mismatch",
                            "Media input type does not match node mapping; default node value kept",
                            node_id=node_id,
                            details={
                                "expected": mapping.get("input_type"),
                                "received": input_type,
                            },
                        )
                    )

        ctx.workflow = apply_injections(ctx.workflow, ctx.injections)


def create_upload_media_processor(
    upload_media_bytes_fn: UploadMediaBytesFn,
    register_media_bytes_fn: RegisterMediaBytesFn,
    input_node_map: dict[str, list[dict[str, Any]]],
) -> Processor:
    return _UploadMediaProcessor(
        upload_media_bytes_fn,
        register_media_bytes_fn,
        input_node_map,
    )


__all__ = ["create_upload_media_processor"]
