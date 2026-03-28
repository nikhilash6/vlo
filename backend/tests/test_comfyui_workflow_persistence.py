import asyncio
import json
import os
import sys

import pytest

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from routers import comfyui
from services.workflow_rules.object_info import set_object_info_cache


class DummyRequest:
    def __init__(self, payload):
        self._payload = payload

    async def json(self):
        return self._payload


def test_save_workflow_content_persists_to_backend_workflows_dir(
    tmp_path, monkeypatch
):
    monkeypatch.setattr(comfyui, "WORKFLOWS_DIR", tmp_path)
    monkeypatch.setattr(
        comfyui,
        "OBJECT_INFO_PATH",
        tmp_path / ".config" / "object_info.json",
    )

    payload = {
        "workflow": {"nodes": [{"id": 1}], "extra": {"source": "test"}},
        "object_info": {"LoadImage": {"input": {}}},
    }
    result = asyncio.run(
        comfyui.save_workflow_content(
            "wf.json", DummyRequest(payload)
        )
    )

    assert result == {
        "workflow_id": "wf.json",
        "saved": True,
        "object_info_saved": True,
    }
    assert json.loads((tmp_path / "wf.json").read_text(encoding="utf-8")) == {
        "nodes": [{"id": 1}],
        "extra": {"source": "test"},
    }
    assert json.loads(
        (tmp_path / ".config" / "object_info.json").read_text(encoding="utf-8")
    ) == {"LoadImage": {"input": {}}}


def test_resolve_workflow_rules_uses_graph_data_for_randomized_control_after_generate():
    payload = {
        "workflow": {
            "4814": {
                "class_type": "RandomNoise",
                "inputs": {
                    "noise_seed": 42,
                },
            }
        },
        "graph_data": {
            "nodes": [
                {
                    "id": 4814,
                    "type": "RandomNoise",
                    "title": "RandomNoise",
                    "inputs": [],
                    "widgets_values": [42, "randomize"],
                }
            ]
        },
    }
    object_info = {
        "RandomNoise": {
            "input": {
                "required": {
                    "noise_seed": [
                        "INT",
                        {
                            "min": 0,
                            "max": 99,
                            "control_after_generate": True,
                        },
                    ]
                }
            },
            "input_order": {
                "required": ["noise_seed"],
            },
        }
    }

    set_object_info_cache(object_info)
    try:
        result = asyncio.run(
            comfyui.resolve_workflow_rules(
                DummyRequest(payload)
            )
        )
    finally:
        set_object_info_cache(None)

    widget = result["rules"]["nodes"]["4814"]["widgets"]["noise_seed"]
    assert widget["control_after_generate"] is True
    assert widget["default_randomize"] is True
    assert widget["value_type"] == "int"
