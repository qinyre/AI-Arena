"""
Registry & multi-provider 单元测试 — 不依赖真实 API。

验证：
1. registry 能从 yaml 正确加载 7 个 provider
2. 每个 provider 的 protocol / api_base / 模型元数据正确
3. 成本计算用 per_1m 单位正确
4. orchestrator 的 client 工厂能正确路由所有 provider
5. 错误配置（未知 provider / 未配模型 / 缺 key）能给出清晰报错
6. 向后兼容：OpenAIClient 别名仍可用
"""
import sys
import os
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.llm.registry import load_registry, get_registry, get_model_info
from app.llm.openai_client import OpenAICompatibleClient, OpenAIClient, OllamaClient
from app.llm.claude_client import ClaudeClient


@pytest.fixture(scope="module")
def registry():
    """每个测试模块用同一个 registry 实例"""
    return load_registry()


class TestRegistryLoading:
    """registry 加载"""

    def test_all_seven_providers_loaded(self, registry):
        """7 个 provider 全部加载"""
        expected = {"deepseek", "openai", "anthropic", "gemini", "qwen", "siliconflow", "ollama"}
        assert set(registry.providers.keys()) == expected

    def test_default_is_deepseek(self, registry):
        """默认 provider 应为 deepseek（开发期推荐）"""
        assert registry.default_provider == "deepseek"
        assert registry.default_model == "deepseek-chat"

    def test_protocol_routing(self, registry):
        """只有 anthropic 是 anthropic 协议，其余都是 openai 兼容"""
        for name, prov in registry.providers.items():
            if name == "anthropic":
                assert prov.protocol == "anthropic", f"{name} 应为 anthropic 协议"
            else:
                assert prov.protocol == "openai", f"{name} 应为 openai 兼容协议"

    def test_gemini_base_url_has_trailing_slash(self, registry):
        """Gemini base_url 结尾斜杠是硬性要求"""
        assert registry["gemini"].api_base.endswith("/"), \
            "Gemini base_url 必须以 / 结尾，否则 OpenAI SDK 会报错"


class TestModelInfo:
    """模型元数据查询"""

    def test_get_model_info_returns_correct_costs(self, registry):
        """成本字段正确（每 1M token）"""
        info = get_model_info("deepseek", "deepseek-chat")
        assert info.cost_in == 0.27
        assert info.cost_out == 1.10
        assert info.context == 64000

    def test_get_model_info_nonexistent_returns_none(self, registry):
        """查询不存在的模型返回 None"""
        assert get_model_info("deepseek", "nonexistent-model") is None
        assert get_model_info("nonexistent-provider", "any") is None

    def test_every_provider_has_at_least_one_model(self, registry):
        """每个 provider 至少有一个模型"""
        for name, prov in registry.providers.items():
            assert len(prov.models) > 0, f"{name} 没有配置任何模型"

    def test_ollama_has_zero_cost(self, registry):
        """Ollama 本地模型成本为 0"""
        info = get_model_info("ollama", "llama3.3")
        assert info.cost_in == 0.0
        assert info.cost_out == 0.0


class TestCostCalculation:
    """成本计算（per 1M token 单位）"""

    def test_openai_compatible_cost(self):
        """OpenAICompatibleClient 成本按 1M token 计算"""
        client = OpenAICompatibleClient(
            api_key="fake", model="gpt-4.1-mini",
            cost_per_1m_input=0.4, cost_per_1m_output=1.6
        )
        # 1000 input + 500 output tokens
        # = 0.4 * 1000/1e6 + 1.6 * 500/1e6 = 0.0004 + 0.0008 = 0.0012
        cost = client.estimate_cost(1000, 500)
        assert abs(cost - 0.0012) < 1e-9

    def test_claude_cost(self):
        """ClaudeClient 成本按 1M token 计算"""
        client = ClaudeClient(
            api_key="fake", model="claude-sonnet-4-5",
            cost_per_1m_input=3.0, cost_per_1m_output=15.0
        )
        # 1M input + 1M output = 3.0 + 15.0 = 18.0
        cost = client.estimate_cost(1_000_000, 1_000_000)
        assert abs(cost - 18.0) < 1e-6

    def test_ollama_client_is_free(self):
        """OllamaClient 成本恒为 0"""
        client = OllamaClient(model="llama3.3")
        assert client.estimate_cost(10_000_000, 10_000_000) == 0.0


class TestClientFactory:
    """orchestrator client 工厂路由"""

    @pytest.fixture
    def orchestrator(self):
        """构造一个不触发 initialize 的 orchestrator 实例"""
        from app.core.orchestrator import GameOrchestrator
        orch = GameOrchestrator.__new__(GameOrchestrator)
        return orch

    @pytest.fixture(autouse=True)
    def _fake_keys(self, monkeypatch):
        """为所有 provider 注入 fake key，避免缺 key 报错"""
        for env in ["DEEPSEEK_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
                    "GEMINI_API_KEY", "DASHSCOPE_API_KEY", "SILICONFLOW_API_KEY"]:
            monkeypatch.setenv(env, f"fake-{env.lower()}")

    def test_all_openai_compatible_providers_route_correctly(self, orchestrator, registry):
        """6 个 openai 协议 provider 都路由到 OpenAICompatibleClient"""
        cases = [
            ("deepseek", "deepseek-chat"),
            ("openai", "gpt-4.1-mini"),
            ("gemini", "gemini-2.5-flash"),
            ("qwen", "qwen-plus"),
            ("siliconflow", "Qwen/Qwen2.5-72B-Instruct"),
            ("ollama", "llama3.3"),
        ]
        for prov, model in cases:
            client = orchestrator._create_client({"provider": prov, "model": model}, registry)
            assert isinstance(client, OpenAICompatibleClient), \
                f"{prov} 应路由到 OpenAICompatibleClient"
            assert client.model == model

    def test_anthropic_routes_to_claude_client(self, orchestrator, registry):
        """anthropic 协议路由到 ClaudeClient"""
        client = orchestrator._create_client(
            {"provider": "anthropic", "model": "claude-sonnet-4-5"}, registry
        )
        assert isinstance(client, ClaudeClient)
        assert client.model == "claude-sonnet-4-5"

    def test_base_url_propagates_from_registry(self, orchestrator, registry):
        """provider 的 base_url 从 registry 正确传给 client"""
        client = orchestrator._create_client(
            {"provider": "deepseek", "model": "deepseek-chat"}, registry
        )
        assert "api.deepseek.com" in str(client.client.base_url)

    def test_cost_propagates_from_registry(self, orchestrator, registry):
        """模型成本从 registry 正确传给 client"""
        client = orchestrator._create_client(
            {"provider": "deepseek", "model": "deepseek-chat"}, registry
        )
        info = get_model_info("deepseek", "deepseek-chat")
        assert client.cost_per_1m_input == info.cost_in
        assert client.cost_per_1m_output == info.cost_out

    def test_unknown_provider_raises(self, orchestrator, registry):
        """未知 provider 报错"""
        with pytest.raises(ValueError, match="未知"):
            orchestrator._create_client(
                {"provider": "nonexistent", "model": "x"}, registry
            )

    def test_unknown_model_raises(self, orchestrator, registry):
        """provider 下未配置的模型报错"""
        with pytest.raises(ValueError, match="未配置模型"):
            orchestrator._create_client(
                {"provider": "deepseek", "model": "no-such-model"}, registry
            )

    def test_missing_key_raises(self, orchestrator, registry, monkeypatch):
        """缺 key 的 provider 报错"""
        monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
        with pytest.raises(ValueError, match="环境变量"):
            orchestrator._create_client(
                {"provider": "deepseek", "model": "deepseek-chat"}, registry
            )

    def test_ollama_works_without_key(self, orchestrator, registry):
        """Ollama 无需 key 也能创建 client"""
        client = orchestrator._create_client(
            {"provider": "ollama", "model": "llama3.3"}, registry
        )
        assert isinstance(client, OpenAICompatibleClient)


class TestBackwardCompatibility:
    """向后兼容"""

    def test_openai_client_alias_still_works(self):
        """旧代码 import OpenAIClient 仍可用（别名指向 OpenAICompatibleClient）"""
        assert OpenAIClient is OpenAICompatibleClient
        client = OpenAIClient(api_key="fake", model="gpt-4.1-mini")
        assert isinstance(client, OpenAICompatibleClient)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
