import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.api.schemas import ModelConnectionTestRequest
from app.core.orchestrator import GameOrchestrator
from app.main import test_model_connection as run_model_connection_test


def test_model_connection_uses_minimal_generation(monkeypatch):
    captured = {}

    class FakeClient:
        async def generate(self, prompt, **kwargs):
            captured.update(prompt=prompt, **kwargs)
            return {"model": "test-model", "usage": {"total_tokens": 3}}

    monkeypatch.setattr(
        GameOrchestrator,
        "_create_client_from_explicit",
        lambda config: FakeClient(),
    )
    result = asyncio.run(run_model_connection_test(ModelConnectionTestRequest(
        api_format="openai",
        base_url="https://example.com/v1",
        model="test-model",
        api_key="secret",
    )))

    assert result["ok"] is True
    assert captured["json_mode"] is False
    assert captured["max_tokens"] == 8
