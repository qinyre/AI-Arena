import asyncio
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.api.schemas import GameReviewRequest, ModelConnectionTestRequest
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


def test_remote_anthropic_endpoint_requires_api_key():
    with pytest.raises(ValueError, match="Anthropic 远程端点必须填写 API Key"):
        GameOrchestrator._create_client_from_explicit({
            "api_format": "anthropic",
            "base_url": "https://example.com",
            "model": "claude-test",
        })


def test_model_connection_accepts_registered_provider(monkeypatch):
    class FakeClient:
        async def generate(self, *_args, **_kwargs):
            return {"model": "managed-model", "usage": {"total_tokens": 2}}

    captured = {}

    def fake_create(self, config, _registry):
        captured.update(config)
        return FakeClient()

    monkeypatch.setattr(GameOrchestrator, "_create_client", fake_create)
    result = asyncio.run(run_model_connection_test(ModelConnectionTestRequest(
        provider="managed",
        model="managed-model",
    )))

    assert result["ok"] is True
    assert captured["provider"] == "managed"
    assert "base_url" not in captured


def test_game_review_request_accepts_exactly_one_model_source():
    managed = GameReviewRequest(provider="deepseek", model="deepseek-v4-flash")
    explicit = GameReviewRequest(
        api_format="openai",
        base_url="https://example.com/v1",
        model="custom-model",
    )

    assert managed.provider == "deepseek"
    assert explicit.base_url == "https://example.com/v1"
    with pytest.raises(ValueError, match="必须且只能填写一个"):
        GameReviewRequest(model="missing-source")
    with pytest.raises(ValueError, match="必须且只能填写一个"):
        GameReviewRequest(
            provider="deepseek",
            base_url="https://example.com/v1",
            model="two-sources",
        )
